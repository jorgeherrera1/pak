import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ParsedDocument } from "@dark-factory/parse";
import { emptyGraph, parseGraph, type SrsGraph } from "@dark-factory/srs";

export type ToolCtx = { workspaceDir: string };

let tail: Promise<void> = Promise.resolve();

/** One writer at a time. Tool calls in a session share this process. */
export function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readJson(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

export async function loadDocument(ctx: ToolCtx): Promise<ParsedDocument> {
  const doc = await readJson(join(ctx.workspaceDir, "document.json"));
  if (!doc) throw new Error("document.json is missing from the workspace");
  return doc as ParsedDocument;
}

export async function loadGraph(ctx: ToolCtx): Promise<SrsGraph> {
  const path = join(ctx.workspaceDir, "graph.json");
  const saved = await readJson(path);
  if (saved) return parseGraph(saved);
  const run = (await readJson(join(ctx.workspaceDir, "run.json"))) as
    | { runId?: string }
    | undefined;
  if (!run?.runId) throw new Error("run.json is missing a runId");
  return emptyGraph(run.runId);
}

export async function saveGraph(ctx: ToolCtx, graph: SrsGraph): Promise<void> {
  const path = join(ctx.workspaceDir, "graph.json");
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(graph));
  await rename(tmp, path);
}

export async function withGraph<T>(
  ctx: ToolCtx,
  fn: (
    graph: SrsGraph,
    doc: ParsedDocument,
  ) =>
    | { graph?: SrsGraph; result: T }
    | Promise<{ graph?: SrsGraph; result: T }>,
): Promise<T> {
  return locked(async () => {
    const doc = await loadDocument(ctx);
    const graph = await loadGraph(ctx);
    const out = await fn(graph, doc);
    if (out.graph) await saveGraph(ctx, out.graph);
    return out.result;
  });
}
