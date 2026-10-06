import { expect, test } from "vitest";
import {
  stepStatus,
  toCanvas,
  type JobResponse,
  type OperationRow,
} from "@/lib/canvas";

const op = (
  name: string,
  status: OperationRow["status"],
  error: string | null = null,
): OperationRow => ({ step: "parse", name, position: 0, status, error });

const job = (operations: OperationRow[]): JobResponse => ({
  id: "j",
  filename: "a.pdf",
  size: 1,
  status: "running",
  error: null,
  operations,
});

test("step status derivation", () => {
  expect(stepStatus([])).toBe("pending");
  expect(stepStatus([op("a", "pending"), op("b", "pending")])).toBe("pending");
  expect(stepStatus([op("a", "done"), op("b", "pending")])).toBe("pending");
  expect(stepStatus([op("a", "done"), op("b", "running")])).toBe("running");
  expect(stepStatus([op("a", "done"), op("b", "done")])).toBe("done");
  expect(stepStatus([op("a", "running"), op("b", "failed")])).toBe("failed");
});

test("three step nodes in order, parse carrying its operations", () => {
  const { nodes } = toCanvas(
    job([op("upload", "done"), op("parse", "running", null)]),
  );
  expect(nodes.map((n) => n.id)).toEqual(["parse", "annotate", "resolve"]);
  expect(nodes.map((n) => n.data.label)).toEqual([
    "Parse",
    "Annotate",
    "Resolve",
  ]);
  expect(nodes[0]?.data.status).toBe("running");
  expect(nodes[0]?.data.operations.map((o) => o.name)).toEqual([
    "upload",
    "parse",
  ]);
  expect(nodes[1]?.data.operations).toEqual([]);
  expect(nodes[1]?.data.status).toBe("pending");
  expect(nodes[0]?.position.x).toBeLessThan(nodes[1]?.position.x ?? 0);
  expect(nodes[1]?.position.x).toBeLessThan(nodes[2]?.position.x ?? 0);
  expect(nodes.map((n) => n.data.handles)).toEqual([
    { target: false, source: true },
    { target: true, source: true },
    { target: true, source: false },
  ]);
});

test("operations are ordered by position and keep their error", () => {
  const { nodes } = toCanvas(
    job([
      { ...op("parse", "failed", "boom"), position: 2 },
      { ...op("upload", "done"), position: 0 },
      { ...op("parse", "done"), position: 1 },
    ]),
  );
  expect(nodes[0]?.data.operations.map((o) => o.name)).toEqual([
    "upload",
    "parse",
    "parse",
  ]);
  expect(nodes[0]?.data.operations[2]?.error).toBe("boom");
  expect(nodes[0]?.data.status).toBe("failed");
});

test("the edge into a running step is animated, others plain", () => {
  const running = toCanvas(
    job([{ ...op("x", "running"), step: "annotate" }, op("upload", "done")]),
  );
  expect(running.edges.map((e) => [e.source, e.target, e.type])).toEqual([
    ["parse", "annotate", "animated"],
    ["annotate", "resolve", undefined],
  ]);
  const idle = toCanvas(job([op("upload", "done")]));
  expect(idle.edges.every((e) => e.type === undefined)).toBe(true);
});

test("a node links to its reader only once every one of its operations is done", () => {
  const done = toCanvas(job([op("upload", "done"), op("parse", "done")]));
  expect(done.nodes[0]?.data.href).toBe("/jobs/j/parse");
  expect(done.nodes[1]?.data.href).toBeUndefined();
  const running = toCanvas(job([op("upload", "done"), op("parse", "running")]));
  expect(running.nodes[0]?.data.href).toBeUndefined();
  const annotated = toCanvas(
    job([op("parse", "done"), { ...op("annotate", "done"), step: "annotate" }]),
  );
  expect(annotated.nodes[1]?.data.href).toBe("/jobs/j/annotate");
  // Resolve has no page yet, so its node links nowhere even when it is done.
  const resolved = toCanvas(
    job([
      { ...op("resolve", "done"), step: "resolve" },
      { ...op("link", "done"), step: "resolve" },
    ]),
  );
  expect(resolved.nodes[2]?.data.status).toBe("done");
  expect(resolved.nodes[2]?.data.href).toBeUndefined();
});
