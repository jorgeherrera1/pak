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

test("two step nodes, parse carrying its operations, and no result page", () => {
  const { nodes } = toCanvas(
    job([op("upload", "done"), op("parse", "done", null)]),
  );
  expect(nodes.map((n) => n.id)).toEqual(["parse", "engineer"]);
  expect(nodes.map((n) => n.data.label)).toEqual(["Parse", "Engineer"]);
  expect(nodes[0]?.data.operations.map((o) => o.name)).toEqual([
    "upload",
    "parse",
  ]);
  expect(nodes[1]?.data.status).toBe("pending");
  expect(nodes.every((n) => n.data.href === undefined)).toBe(true);
  expect(nodes.map((n) => n.data.handles)).toEqual([
    { target: false, source: true },
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

test("the edge into a running step is animated", () => {
  const running = toCanvas(
    job([
      op("upload", "done"),
      { ...op("engineer", "running"), step: "engineer" },
    ]),
  );
  expect(running.edges.map((e) => [e.source, e.target, e.type])).toEqual([
    ["parse", "engineer", "animated"],
  ]);
  const idle = toCanvas(job([op("upload", "done")]));
  expect(idle.edges.every((e) => e.type === undefined)).toBe(true);
});
