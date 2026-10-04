import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { readDocument, readRequirements } from "@dark-factory/knowledge-graph";
import { db, isUuid, jobs, operations } from "@/lib/db";

/** The job, its document, and the classifications Annotate laid over it, all from the knowledge graph; not found until Annotate is done. */
export async function load(id: string) {
  if (!isUuid(id)) notFound();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!job) notFound();
  const [doc, classifications, [op]] = await Promise.all([
    readDocument(id),
    readRequirements(id),
    db
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.jobId, id),
          eq(operations.step, "annotate"),
          eq(operations.name, "annotate"),
        ),
      ),
  ]);
  if (!doc || op?.status !== "done") notFound();
  return { job, doc, ann: { classifications, warnings: op.warnings ?? [] } };
}
