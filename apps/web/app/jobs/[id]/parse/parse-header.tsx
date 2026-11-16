import type { ParsedDocument } from "@dark-factory/contracts";
import Link from "next/link";
import { ViewSwitch } from "../view-switch";

/** The Parse pages' header: back to the job, what was parsed, and the switch between its two views. */
export function ParseHeader({
  jobId,
  filename,
  doc,
  view,
}: {
  jobId: string;
  filename: string;
  doc: ParsedDocument;
  view: "reader" | "graph";
}) {
  return (
    <header className="flex items-center gap-5 border-b bg-card px-8 py-4">
      <Link
        href={`/jobs/${jobId}`}
        className="text-sm font-bold text-primary hover:text-action-hover"
      >
        ← Job
      </Link>
      <span className="h-6 w-px bg-border" />
      <div className="flex flex-col">
        <span className="font-display text-sm font-bold">{filename}</span>
        <span className="text-xs text-muted-foreground">
          Parse · {doc.source.pages} pages · {doc.elements.length} elements ·{" "}
          {doc.content.length.toLocaleString()} characters
        </span>
      </div>
      <ViewSwitch jobId={jobId} step="parse" view={view} />
    </header>
  );
}
