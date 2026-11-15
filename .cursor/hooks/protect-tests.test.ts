import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type Decision,
  decide,
  type HookEvent,
  PROTECTED,
  type World,
} from "./protect-tests.ts";

const script = fileURLToPath(new URL("./protect-tests.ts", import.meta.url));

function world(existing: readonly string[], approved = false): World {
  const have = new Set(existing.map((item) => path.resolve(item)));
  return {
    root: "/repo",
    cwd: "/repo",
    approved,
    exists: (absolutePath) => have.has(path.resolve(absolutePath)),
  };
}

function event(partial: HookEvent): HookEvent {
  return partial;
}

describe("existing test files", () => {
  const existing = "/repo/src/add.test.ts";

  it("denies a search-replace", () => {
    const decision = decide(
      event({
        hook_event_name: "preToolUse",
        tool_name: "StrReplace",
        cwd: "/repo",
        tool_input: {
          path: existing,
          old_string: "toBe(2)",
          new_string: "toBe(3)",
        },
      }),
      world([existing]),
    );
    expect(decision.permission).toBe("deny");
    if (decision.permission === "deny") {
      expect(decision.agent_message).toContain(PROTECTED.approval);
    }
  });

  it("denies a write and a delete", () => {
    const input = world([existing]);
    for (const tool_name of ["Write", "Delete"]) {
      const decision = decide(
        event({
          hook_event_name: "preToolUse",
          tool_name,
          cwd: "/repo",
          tool_input: { path: existing, contents: "nope" },
        }),
        input,
      );
      expect(decision.permission).toBe("deny");
    }
  });

  it("allows a write once Jorge has approved it", () => {
    const decision = decide(
      event({
        hook_event_name: "preToolUse",
        tool_name: "Write",
        cwd: "/repo",
        tool_input: { file_path: existing, contents: "next" },
      }),
      world([existing], true),
    );
    expect(decision).toEqual({ permission: "allow" });
  });

  it("allows creating a test file that is not on disk", () => {
    const decision = decide(
      event({
        hook_event_name: "preToolUse",
        tool_name: "Write",
        cwd: "/repo",
        tool_input: { path: "/repo/src/new.test.ts", contents: "fresh" },
      }),
      world([]),
    );
    expect(decision).toEqual({ permission: "allow" });
  });

  it("allows reading a test file", () => {
    const decision = decide(
      event({
        hook_event_name: "preToolUse",
        tool_name: "Read",
        cwd: "/repo",
        tool_input: { path: existing },
      }),
      world([existing]),
    );
    expect(decision).toEqual({ permission: "allow" });
  });
});

describe("shell commands", () => {
  const existing = "/repo/src/add.test.ts";

  it("denies rm of an existing test and allows cat", () => {
    const input = world([existing]);
    const remove = decide(
      event({
        hook_event_name: "beforeShellExecution",
        command: "rm src/add.test.ts",
        cwd: "/repo",
      }),
      input,
    );
    const read = decide(
      event({
        hook_event_name: "beforeShellExecution",
        command: "cat src/add.test.ts",
        cwd: "/repo",
      }),
      input,
    );
    expect(remove.permission).toBe("deny");
    expect(read).toEqual({ permission: "allow" });
  });

  it("denies a redirect onto an existing test and allows one onto a new test", () => {
    const input = world([existing]);
    const overwrite = decide(
      event({
        hook_event_name: "beforeShellExecution",
        command: "echo x > src/add.test.ts",
        cwd: "/repo",
      }),
      input,
    );
    const create = decide(
      event({
        hook_event_name: "beforeShellExecution",
        command: "echo x > src/new.test.ts",
        cwd: "/repo",
      }),
      input,
    );
    expect(overwrite.permission).toBe("deny");
    expect(create).toEqual({ permission: "allow" });
  });

  it("allows vitest to run one existing test file", () => {
    const decision = decide(
      event({
        hook_event_name: "beforeShellExecution",
        command: "pnpm exec vitest run src/add.test.ts",
        cwd: "/repo",
      }),
      world([existing]),
    );
    expect(decision).toEqual({ permission: "allow" });
  });

  it("denies a read that is chained to a delete", () => {
    const decision = decide(
      event({
        hook_event_name: "beforeShellExecution",
        command: "cat src/add.test.ts && rm src/add.test.ts",
        cwd: "/repo",
      }),
      world([existing]),
    );
    expect(decision.permission).toBe("deny");
  });

  it("allows git add and pnpm test", () => {
    const input = world([existing]);
    expect(
      decide(
        event({
          hook_event_name: "beforeShellExecution",
          command: "git add src/add.test.ts",
          cwd: "/repo",
        }),
        input,
      ),
    ).toEqual({ permission: "allow" });
    expect(
      decide(
        event({
          hook_event_name: "beforeShellExecution",
          command: "pnpm test",
          cwd: "/repo",
        }),
        input,
      ),
    ).toEqual({ permission: "allow" });
  });

  it("denies a glob delete", () => {
    const decision = decide(
      event({
        hook_event_name: "beforeShellExecution",
        command: "rm -f src/*.test.ts",
        cwd: "/repo",
      }),
      world([existing]),
    );
    expect(decision.permission).toBe("deny");
  });

  it("allows the same rm after approval", () => {
    const decision = decide(
      event({
        hook_event_name: "beforeShellExecution",
        command: "rm src/add.test.ts",
        cwd: "/repo",
      }),
      world([existing], true),
    );
    expect(decision).toEqual({ permission: "allow" });
  });
});

describe("the approval file and the hook", () => {
  it("denies creating the approval file", () => {
    const decision = decide(
      event({
        hook_event_name: "preToolUse",
        tool_name: "Write",
        cwd: "/repo",
        tool_input: {
          path: `/repo/${PROTECTED.approval}`,
          contents: "",
        },
      }),
      world([]),
    );
    expect(decision.permission).toBe("deny");
  });

  it("denies a shell command that would create the approval file", () => {
    const decision = decide(
      event({
        hook_event_name: "beforeShellExecution",
        command: "touch .cursor/jorge-approves-test-edits",
        cwd: "/repo",
      }),
      world([]),
    );
    expect(decision.permission).toBe("deny");
  });

  it("denies an apply-patch update of an existing test", () => {
    const decision = decide(
      event({
        hook_event_name: "preToolUse",
        tool_name: "ApplyPatch",
        cwd: "/repo",
        tool_input: {
          patch: "*** Update File: src/add.test.ts\n",
        },
      }),
      world(["/repo/src/add.test.ts"]),
    );
    expect(decision.permission).toBe("deny");
  });

  it("denies editing the hook until Jorge approves it", () => {
    const blocked = decide(
      event({
        hook_event_name: "preToolUse",
        tool_name: "StrReplace",
        cwd: "/repo",
        tool_input: {
          path: `/repo/${PROTECTED.hooksJson}`,
          old_string: "a",
          new_string: "b",
        },
      }),
      world([]),
    );
    const allowed = decide(
      event({
        hook_event_name: "preToolUse",
        tool_name: "StrReplace",
        cwd: "/repo",
        tool_input: {
          path: `/repo/${PROTECTED.hookScript}`,
          old_string: "a",
          new_string: "b",
        },
      }),
      world([], true),
    );
    expect(blocked.permission).toBe("deny");
    expect(allowed).toEqual({ permission: "allow" });
  });
});

describe("the hook script", () => {
  it("denies input that is not JSON", () => {
    const stdout = execFileSync(process.execPath, [script], {
      input: "{",
      encoding: "utf8",
    });
    expect(JSON.parse(stdout).permission).toBe("deny");
  });

  it("blocks a search-replace of a real test file, then allows it once the approval file exists", () => {
    const root = mkdtempSync(path.join(tmpdir(), "pak-hook-"));
    try {
      const testFile = path.join(root, "src", "add.test.ts");
      mkdirSync(path.dirname(testFile), { recursive: true });
      writeFileSync(testFile, "expect(1).toBe(1)\n");
      const payload = {
        conversation_id: "conv-1",
        generation_id: "gen-1",
        hook_event_name: "preToolUse",
        tool_name: "StrReplace",
        tool_input: {
          path: testFile,
          old_string: "expect(1).toBe(1)",
          new_string: "expect(1).toBe(2)",
        },
        tool_use_id: "tool-1",
        cwd: root,
        model: "default",
        cursor_version: "2.7.0",
        workspace_roots: [root],
        user_email: null,
        transcript_path: null,
      };
      const blocked = runScript(payload);
      expect(blocked.permission).toBe("deny");
      mkdirSync(path.join(root, ".cursor"), { recursive: true });
      writeFileSync(path.join(root, PROTECTED.approval), "");
      const allowed = runScript(payload);
      expect(allowed).toEqual({ permission: "allow" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function runScript(payload: unknown): Decision {
  const stdout = execFileSync(process.execPath, [script], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
  return JSON.parse(stdout) as Decision;
}
