import { eq } from "drizzle-orm";
import { db, isUuid, jobs, operations } from "@/lib/db";
import { OPERATIONS } from "@/lib/operations";

const STEPS = Object.keys(OPERATIONS);

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!isUuid(id))
    return Response.json({ error: "not found" }, { status: 404 });
  const [job] = await db().select().from(jobs).where(eq(jobs.id, id));
  if (!job) return Response.json({ error: "not found" }, { status: 404 });
  const ops = await db()
    .select()
    .from(operations)
    .where(eq(operations.jobId, id));
  // Assembly-line order: by step in OPERATIONS's key order, then by position within it.
  ops.sort(
    (a, b) =>
      STEPS.indexOf(a.step) - STEPS.indexOf(b.step) || a.position - b.position,
  );
  return Response.json({ ...job, operations: ops });
}
