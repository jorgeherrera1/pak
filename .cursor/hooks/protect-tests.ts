import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PROTECTED = {
  approval: ".cursor/jorge-approves-test-edits",
  hooksJson: ".cursor/hooks.json",
  hookScript: ".cursor/hooks/protect-tests.ts",
} as const;

const TEST_DENY =
  "This existing test file is protected. Do not edit or delete it. Jorge can approve the edit by creating .cursor/jorge-approves-test-edits himself, outside the agent. Do not create that file.";

const APPROVAL_DENY =
  "Do not create or edit .cursor/jorge-approves-test-edits. Only Jorge creates that file, from outside the agent.";

const HOOK_DENY =
  "Do not edit the test-protection hook. Jorge approves that edit the same way he approves a test edit, by creating .cursor/jorge-approves-test-edits himself, outside the agent.";

const GLOB_DENY =
  "This command would delete or rewrite test files. Existing tests are protected. Jorge can approve the edit by creating .cursor/jorge-approves-test-edits himself, outside the agent. Do not create that file.";

const FILE_MUTATORS = new Set([
  "Write",
  "StrReplace",
  "Delete",
  "Edit",
  "EditNotebook",
  "MultiEdit",
  "ApplyPatch",
]);

const PATH_KEYS = new Set([
  "path",
  "file_path",
  "target_notebook",
  "notebook_path",
  "target_file",
]);

const READ_COMMANDS = new Set([
  "cat",
  "head",
  "tail",
  "less",
  "more",
  "bat",
  "rg",
  "grep",
  "egrep",
  "fgrep",
  "ls",
  "wc",
  "stat",
  "file",
  "pwd",
]);

const GIT_READ = new Set([
  "status",
  "diff",
  "log",
  "show",
  "add",
  "blame",
  "rev-parse",
  "commit",
  "branch",
  "remote",
  "describe",
  "merge-base",
  "shortlog",
]);

export type Decision =
  | { permission: "allow" }
  | { permission: "deny"; user_message: string; agent_message: string };

export type HookEvent = {
  hook_event_name: string;
  tool_name?: string;
  tool_input?: unknown;
  command?: string;
  cwd?: string;
  workspace_roots?: string[];
};

export type World = {
  root: string;
  cwd: string;
  approved: boolean;
  exists: (absolutePath: string) => boolean;
};

const allow: Decision = { permission: "allow" };

function deny(message: string): Decision {
  return {
    permission: "deny",
    user_message: message,
    agent_message: message,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const child = value[key];
  return typeof child === "string" ? child : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return undefined;
    items.push(item);
  }
  return items;
}

export function toEvent(value: unknown): HookEvent | null {
  if (!isRecord(value)) return null;
  const event: HookEvent = {
    hook_event_name:
      typeof value.hook_event_name === "string" ? value.hook_event_name : "",
  };
  if (typeof value.tool_name === "string") event.tool_name = value.tool_name;
  if ("tool_input" in value) event.tool_input = value.tool_input;
  if (typeof value.command === "string") event.command = value.command;
  if (typeof value.cwd === "string") event.cwd = value.cwd;
  const roots = stringArray(value.workspace_roots);
  if (roots) event.workspace_roots = roots;
  return event;
}

function relativeToRoot(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function isTestFile(absolutePath: string): boolean {
  const normalized = absolutePath.split(path.sep).join("/");
  if (/(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized))
    return true;
  return /(?:^|\/)__tests__\/[^/]+$/.test(normalized);
}

function writeViolation(absolutePath: string, world: World): Decision | null {
  const rel = relativeToRoot(world.root, absolutePath);
  if (rel === PROTECTED.approval) return deny(APPROVAL_DENY);
  if (
    (rel === PROTECTED.hooksJson || rel === PROTECTED.hookScript) &&
    !world.approved
  ) {
    return deny(HOOK_DENY);
  }
  if (
    isTestFile(absolutePath) &&
    world.exists(absolutePath) &&
    !world.approved
  ) {
    return deny(TEST_DENY);
  }
  return null;
}

function collectPaths(value: unknown, out: string[], depth: number): void {
  if (depth > 3) return;
  if (Array.isArray(value)) {
    for (const item of value) collectPaths(item, out, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (PATH_KEYS.has(key) && typeof child === "string") {
      out.push(child);
      continue;
    }
    if (key === "edits" || key === "files") collectPaths(child, out, depth + 1);
  }
}

function patchPaths(value: unknown): string[] {
  const texts: string[] = [];
  if (typeof value === "string") texts.push(value);
  else if (isRecord(value)) {
    for (const key of ["patch", "input", "command"]) {
      const child = value[key];
      if (typeof child === "string") texts.push(child);
    }
  }
  const paths: string[] = [];
  for (const text of texts) {
    for (const match of text.matchAll(
      /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm,
    )) {
      const found = match[1]?.trim();
      if (found) paths.push(found);
    }
  }
  return paths;
}

function toolPaths(event: HookEvent): string[] {
  const paths: string[] = [];
  collectPaths(event.tool_input, paths, 0);
  if (event.tool_name === "ApplyPatch")
    paths.push(...patchPaths(event.tool_input));
  return paths;
}

function splitSegments(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | "`" | null = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (ch === undefined) break;
    if (quote) {
      current += ch;
      if (ch === quote && command[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      current += ch;
      continue;
    }
    const next = command[i + 1];
    if (ch === "\n" || ch === ";") {
      parts.push(current);
      current = "";
      continue;
    }
    if ((ch === "&" && next === "&") || (ch === "|" && next === "|")) {
      parts.push(current);
      current = "";
      i += 1;
      continue;
    }
    if (ch === "|") {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function stripQuotes(segment: string): string {
  return segment.replace(
    /'(?:\\'|[^'])*'|"(?:\\"|[^"])*"|`(?:\\`|[^`])*`/g,
    " ",
  );
}

function redirectTargets(segment: string): string[] {
  const bare = stripQuotes(segment).replace(/\d*>&+\d*/g, " ");
  const targets: string[] = [];
  for (const match of bare.matchAll(/>>?\s*([^\s|&;]+)/g)) {
    const target = match[1];
    if (target && !target.startsWith("&")) targets.push(target);
  }
  return targets;
}

function tokens(segment: string): string[] {
  const out: string[] = [];
  for (const match of segment.matchAll(
    /'([^']*)'|"([^"]*)"|`([^`]*)`|(\S+)/g,
  )) {
    const token = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (token) out.push(token);
  }
  return out;
}

function isTestRunner(commandTokens: readonly string[]): boolean {
  const line = commandTokens.join(" ");
  if (/(?:^|\s)--write(?:\s|=|$)|(?:^|\s)-w(?:\s|$)/.test(line)) return false;
  const [a, b, c] = commandTokens;
  if (a === "vitest") return true;
  if (a === "npx" && b === "vitest") return true;
  if ((a === "pnpm" || a === "npm" || a === "yarn") && b === "test")
    return true;
  if (
    (a === "pnpm" || a === "npm" || a === "yarn") &&
    b === "run" &&
    c === "test"
  ) {
    return true;
  }
  return (a === "pnpm" || a === "npm") && b === "exec" && c === "vitest";
}

function segmentIsReadOnly(segment: string): boolean {
  const commandTokens = tokens(segment);
  const head = commandTokens[0];
  if (!head) return true;
  if (READ_COMMANDS.has(head)) return true;
  if (head === "git") {
    const sub = commandTokens[1];
    return sub !== undefined && GIT_READ.has(sub);
  }
  return isTestRunner(commandTokens);
}

function looksLikePath(token: string): boolean {
  if (token.includes("/") || token.includes("\\")) return true;
  if (isTestFile(token)) return true;
  return (
    token === "jorge-approves-test-edits" ||
    token === "hooks.json" ||
    token === "protect-tests.ts"
  );
}

function destructiveTestGlob(segment: string): boolean {
  if (!/\*\.(?:test|spec)\.[cm]?[jt]sx?|__tests__\/\*/.test(segment))
    return false;
  return (
    /\b(?:rm|mv|cp|tee|sed|perl|truncate|unlink|find)\b/.test(segment) ||
    /-delete\b/.test(segment)
  );
}

function segmentViolation(
  segment: string,
  world: World,
  cwd: string,
): Decision | null {
  for (const target of redirectTargets(segment)) {
    const violation = writeViolation(path.resolve(cwd, target), world);
    if (violation) return violation;
  }
  if (segmentIsReadOnly(segment)) return null;
  if (!world.approved && destructiveTestGlob(segment)) return deny(GLOB_DENY);
  for (const token of tokens(segment)) {
    if (!looksLikePath(token)) continue;
    const violation = writeViolation(path.resolve(cwd, token), world);
    if (violation) return violation;
  }
  return null;
}

function decideShell(command: string, world: World, cwd: string): Decision {
  for (const segment of splitSegments(command)) {
    const violation = segmentViolation(segment, world, cwd);
    if (violation) return violation;
  }
  return allow;
}

export function decide(event: HookEvent, world: World): Decision {
  const cwd =
    stringField(event.tool_input, "working_directory") ??
    event.cwd ??
    world.cwd;
  if (
    event.hook_event_name === "beforeShellExecution" ||
    event.tool_name === "Shell"
  ) {
    const command = event.command ?? stringField(event.tool_input, "command");
    if (command === undefined) return allow;
    return decideShell(command, world, cwd);
  }
  if (event.tool_name && FILE_MUTATORS.has(event.tool_name)) {
    for (const token of toolPaths(event)) {
      const violation = writeViolation(path.resolve(cwd, token), world);
      if (violation) return violation;
    }
  }
  return allow;
}

export function worldFromEvent(
  event: HookEvent,
  exists: (absolutePath: string) => boolean,
): World {
  const root = event.workspace_roots?.[0] || event.cwd || process.cwd();
  return {
    root,
    cwd: event.cwd || root,
    approved: exists(path.join(root, PROTECTED.approval)),
    exists,
  };
}

function writeDecision(decision: Decision): void {
  process.stdout.write(`${JSON.stringify(decision)}\n`);
}

function main(): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    writeDecision(deny("The hook received invalid JSON."));
    return;
  }
  const event = toEvent(parsed);
  if (!event) {
    writeDecision(deny("The hook received a payload it could not read."));
    return;
  }
  writeDecision(decide(event, worldFromEvent(event, existsSync)));
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) main();
