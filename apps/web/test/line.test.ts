import { expect, test } from "vitest";
import {
  initialOperations,
  runOperation,
  type OperationPatch,
} from "@/lib/operations";

const recorder = () => {
  const calls: { step: string; name: string; patch: OperationPatch }[] = [];
  const set = async (
    _job: string,
    step: string,
    name: string,
    patch: OperationPatch,
  ) => {
    calls.push({ step, name, patch });
  };
  return { calls, set };
};

test("initialOperations lists parse then engineer, with upload already done", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const rows = initialOperations("j", now);
  expect(rows.map((r) => [r.step, r.name, r.position, r.status])).toEqual([
    ["parse", "upload", 0, "done"],
    ["parse", "parse", 1, "pending"],
    ["engineer", "engineer", 0, "pending"],
    ["engineer", "check", 1, "pending"],
  ]);
  expect(rows[0]).toMatchObject({
    jobId: "j",
    startedAt: now,
    finishedAt: now,
  });
  expect(rows[1]?.startedAt).toBeNull();
});

test("marks running then done and returns the value", async () => {
  const { calls, set } = recorder();
  const out = await runOperation("j", "engineer", "engineer", async () => 42, set);
  expect(out).toBe(42);
  expect(calls.map((c) => [c.step, c.name, c.patch.status])).toEqual([
    ["engineer", "engineer", "running"],
    ["engineer", "engineer", "done"],
  ]);
  expect(calls[0]?.patch.startedAt).toBeInstanceOf(Date);
  expect(calls[1]?.patch.finishedAt).toBeInstanceOf(Date);
});

test("marks failed with the message and rethrows", async () => {
  const { calls, set } = recorder();
  await expect(
    runOperation(
      "j",
      "parse",
      "parse",
      async () => {
        throw new Error("boom");
      },
      set,
    ),
  ).rejects.toThrow("boom");
  expect(calls[1]?.patch).toMatchObject({ status: "failed", error: "boom" });
});
