import { and, eq } from "drizzle-orm";
import { db, operations } from "./db";

/** Every step's operations, in assembly-line order. Only this file knows them. */
export const OPERATIONS = {
  parse: ["upload", "parse"],
  annotate: ["annotate"],
  resolve: ["resolve", "link"],
} as const;
export type StepName = keyof typeof OPERATIONS;
export type OperationName = (typeof OPERATIONS)[StepName][number];
export type OperationPatch = Partial<
  Pick<
    typeof operations.$inferInsert,
    "status" | "error" | "warnings" | "startedAt" | "finishedAt"
  >
>;

/** The rows a new job starts with: upload already done by the create handler, everything else pending. */
export function initialOperations(jobId: string, now: Date) {
  return (Object.keys(OPERATIONS) as StepName[]).flatMap((step) =>
    OPERATIONS[step].map((name, position) => {
      const done = name === "upload";
      return {
        jobId,
        step,
        name,
        position,
        status: done ? ("done" as const) : ("pending" as const),
        startedAt: done ? now : null,
        finishedAt: done ? now : null,
      };
    }),
  );
}

export async function setOperation(
  jobId: string,
  step: StepName,
  name: OperationName,
  patch: OperationPatch,
) {
  await db
    .update(operations)
    .set(patch)
    .where(
      and(
        eq(operations.jobId, jobId),
        eq(operations.step, step),
        eq(operations.name, name),
      ),
    );
}

/** Runs one operation body and records running, done, or failed around it. Rethrows so the SDK can retry. */
export async function runOperation<T>(
  jobId: string,
  step: StepName,
  name: OperationName,
  fn: () => Promise<T>,
  set: typeof setOperation = setOperation,
): Promise<T> {
  await set(jobId, step, name, {
    status: "running",
    startedAt: new Date(),
    error: null,
  });
  try {
    const out = await fn();
    await set(jobId, step, name, { status: "done", finishedAt: new Date() });
    return out;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await set(jobId, step, name, {
      status: "failed",
      finishedAt: new Date(),
      error,
    });
    throw err;
  }
}
