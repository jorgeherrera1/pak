import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readDocument, readRequirements } from "@dark-factory/knowledge-graph";
import { db, isUuid, jobs, operations } from "@/lib/db";
import { AnnotateReader } from "./annotate-reader";

// The document as Annotate read it, with its requirements laid over it, both from the knowledge graph.
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
  const ann = { classifications, warnings: op.warnings ?? [] };
  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center gap-5 border-b bg-card px-8 py-4">
        <Link
          href={`/jobs/${id}`}
          className="text-sm font-bold text-primary hover:text-action-hover"
        >
          ← Job
        </Link>
        <span className="h-6 w-px bg-border" />
        <div className="flex flex-col">
          <span className="font-display text-sm font-bold">{job.filename}</span>
          <span className="text-xs text-muted-foreground">
            Annotate · {ann.classifications.length} classifications ·{" "}
            {ann.warnings.length} warnings
          </span>
        </div>
        <Link
          href={`/jobs/${id}/parse`}
          className="ml-auto text-sm font-bold text-primary hover:text-action-hover"
        >
          Parse
        </Link>
      </header>
      <AnnotateReader
        doc={doc}
        annotations={ann}
        figureBase={`/api/jobs/${id}/artifacts/`}
      />
    </main>
  );
}
