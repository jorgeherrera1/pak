import { ReactFlowProvider } from "@xyflow/react";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { readDocument } from "@dark-factory/knowledge-graph";
import { db, isUuid, jobs } from "@/lib/db";
import { ParseHeader } from "../parse-header";
import { GraphView } from "./graph-view";

// The same document as the reader, drawn as the graph it is stored as.
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
    // The window minus the layout's h-16 header: the canvas fills the rest and the page never scrolls.
    <main className="flex h-[calc(100dvh-4rem)] flex-col">
      <ParseHeader jobId={id} filename={job.filename} doc={doc} view="graph" />
      <ReactFlowProvider>
        <GraphView doc={doc} jobId={id} />
      </ReactFlowProvider>
    </main>
  );
}
