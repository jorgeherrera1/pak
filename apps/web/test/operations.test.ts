import { expect, test } from "vitest";
import { runOperation, type OperationPatch } from "../lib/operations";

const recorder = () => {
  const calls: OperationPatch[] = [];
  const set = async (_job: string, _name: string, patch: OperationPatch) => {
    calls.push(patch);
  };
  return { calls, set };
};

test("marks running then done and returns the value", async () => {
  const { calls, set } = recorder();
  const out = await runOperation("j", "analyze", async () => 42, set);
  expect(out).toBe(42);
  expect(calls.map((c) => c.status)).toEqual(["running", "done"]);
  expect(calls[0]?.startedAt).toBeInstanceOf(Date);
  expect(calls[1]?.finishedAt).toBeInstanceOf(Date);
});

test("marks failed with the message and rethrows", async () => {
  const { calls, set } = recorder();
  await expect(
    runOperation(
      "j",
      "analyze",
      async () => {
        throw new Error("boom");
      },
      set,
    ),
  ).rejects.toThrow("boom");
  expect(calls[1]).toMatchObject({ status: "failed", error: "boom" });
});
