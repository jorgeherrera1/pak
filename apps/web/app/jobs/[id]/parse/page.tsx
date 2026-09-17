import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ParsedDocument } from "@dark-factory/parse";
import { getBlob } from "@/lib/blob";
import { db, isUuid, jobs } from "@/lib/db";
import { ParseReader } from "./parse-reader";

// Reads parsed.json straight from blob on the server: the job is done by the time this page has a link to it.
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  const blob = job && (await getBlob(`${id}/parsed.json`));
  if (!job || !blob) notFound();
  const doc = JSON.parse(blob.toString("utf8")) as ParsedDocument;
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
            Parse · {doc.source.pages} pages · {doc.elements.length} elements ·{" "}
            {doc.content.length.toLocaleString()} characters
          </span>
        </div>
        <a
          href={`/api/jobs/${id}/artifacts/parsed.json`}
          className="ml-auto text-sm font-bold text-primary hover:text-action-hover"
        >
          parsed.json
        </a>
      </header>
      <ParseReader doc={doc} figureBase={`/api/jobs/${id}/artifacts/`} />
    </main>
  );
}
