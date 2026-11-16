import { readDocument } from "@dark-factory/knowledge-graph";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, isUuid, jobs } from "@/lib/db";
import { ParseHeader } from "./parse-header";
import { ParseReader } from "./parse-reader";

// Reads the document from the knowledge graph on the server: the job is done by the time this page has a link to it.
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  const doc = job && (await readDocument(id));
  if (!job || !doc) notFound();
  return (
    <main className="flex min-h-screen flex-col">
      <ParseHeader jobId={id} filename={job.filename} doc={doc} view="reader" />
      <ParseReader doc={doc} figureBase={`/api/jobs/${id}/artifacts/`} />
    </main>
  );
}
