import { and, eq } from "drizzle-orm";
import { db, operations } from "./db";

export const STEP = "parse";
export const OPERATIONS = ["upload", "analyze", "build", "publish"] as const;
export type OperationName = (typeof OPERATIONS)[number];
export type OperationPatch = Partial<
  Pick<
    typeof operations.$inferInsert,
    "status" | "error" | "startedAt" | "finishedAt"
  >
>;

export async function setOperation(
  jobId: string,
  name: OperationName,
  patch: OperationPatch,
) {
  await db
    .update(operations)
    .set(patch)
    .where(
      and(
        eq(operations.jobId, jobId),
        eq(operations.step, STEP),
        eq(operations.name, name),
      ),
    );
}

/** Runs one operation body and records running, done, or failed around it. Rethrows so the SDK can retry. */
export async function runOperation<T>(
  jobId: string,
  name: OperationName,
  fn: () => Promise<T>,
  set: typeof setOperation = setOperation,
): Promise<T> {
  await set(jobId, name, {
    status: "running",
    startedAt: new Date(),
    error: null,
  });
  try {
    const out = await fn();
    await set(jobId, name, { status: "done", finishedAt: new Date() });
    return out;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await set(jobId, name, { status: "failed", finishedAt: new Date(), error });
    throw err;
  }
}
