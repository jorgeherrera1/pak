import { AnnotateHeader } from "./annotate-header";
import { AnnotateReader } from "./annotate-reader";
import { load } from "./load";

// The document as Annotate read it, with its requirements laid over it, both from the knowledge graph.
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { job, doc, ann } = await load(id);
  return (
    <main className="flex min-h-screen flex-col">
      <AnnotateHeader
        jobId={id}
        filename={job.filename}
        ann={ann}
        view="reader"
      />
      <AnnotateReader
        doc={doc}
        annotations={ann}
        figureBase={`/api/jobs/${id}/artifacts/`}
      />
    </main>
  );
}
