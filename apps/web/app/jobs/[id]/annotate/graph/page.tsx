import { AnnotateHeader } from "../annotate-header";
import { load } from "../load";
import { AnnotateGraph } from "./annotate-graph";

// The document's sections as an outline, each requirement beside the section holding what it quotes.
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { job, doc, ann } = await load(id);
  return (
    // The window minus the layout's h-16 header: the outline scrolls inside it and the page never does.
    <main className="flex h-[calc(100dvh-4rem)] flex-col">
      <AnnotateHeader
        jobId={id}
        filename={job.filename}
        ann={ann}
        view="graph"
      />
      <AnnotateGraph doc={doc} requirements={ann.classifications} jobId={id} />
    </main>
  );
}
