import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { AnnotateResult } from "@dark-factory/annotate";
import type { ParsedDocument } from "@dark-factory/parse";
import { getBlob } from "@/lib/blob";
import { db, isUuid, jobs } from "@/lib/db";
import { AnnotateReader } from "./annotate-reader";

// The document as Annotate read it: parsed.json with annotate.json laid over it.
// Reads parsed.json straight from blob on the server: the job is done by the time this page has a link to it.
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  const [blob, annBlob] = job
    ? await Promise.all([
        getBlob(`${id}/parsed.json`),
        getBlob(`${id}/annotate.json`),
      ])
    : [];
  if (!job || !blob || !annBlob) notFound();
  const doc = JSON.parse(blob.toString("utf8")) as ParsedDocument;
  const ann = JSON.parse(annBlob.toString("utf8")) as AnnotateResult;
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
            {ann.mentions.length} mentions · {ann.warnings.length} warnings
          </span>
        </div>
        <Link
          href={`/jobs/${id}/parse`}
          className="ml-auto text-sm font-bold text-primary hover:text-action-hover"
        >
          Parse
        </Link>
        <a
          href={`/api/jobs/${id}/artifacts/annotate.json`}
          className="text-sm font-bold text-primary hover:text-action-hover"
        >
          annotate.json
        </a>
      </header>
      <AnnotateReader
        doc={doc}
        annotations={ann}
        figureBase={`/api/jobs/${id}/artifacts/`}
      />
    </main>
  );
}
