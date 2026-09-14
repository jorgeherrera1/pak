import { asc, eq } from "drizzle-orm";
import { db, isUuid, jobs, operations } from "@/lib/db";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!isUuid(id))
    return Response.json({ error: "not found" }, { status: 404 });
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!job) return Response.json({ error: "not found" }, { status: 404 });
  const ops = await db
    .select()
    .from(operations)
    .where(eq(operations.jobId, id))
    .orderBy(asc(operations.position));
  return Response.json({ ...job, operations: ops });
}
