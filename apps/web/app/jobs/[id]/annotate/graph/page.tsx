import { ReactFlowProvider } from "@xyflow/react";
import { GraphView } from "../../graph/graph-view";
import { AnnotateHeader } from "../annotate-header";
import { load } from "../load";

// The document as the graph it is stored as, each requirement joined to the element it quotes.
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { job, doc, ann } = await load(id);
  return (
    // The window minus the layout's h-16 header: the canvas fills the rest and the page never scrolls.
    <main className="flex h-[calc(100dvh-4rem)] flex-col">
      <AnnotateHeader
        jobId={id}
        filename={job.filename}
        ann={ann}
        view="graph"
      />
      <ReactFlowProvider>
        <GraphView doc={doc} jobId={id} requirements={ann.classifications} />
      </ReactFlowProvider>
    </main>
  );
}
