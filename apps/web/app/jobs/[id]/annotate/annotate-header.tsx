import type { AnnotateResult } from "@dark-factory/contracts";
import Link from "next/link";
import { ViewSwitch } from "../view-switch";

/** The Annotate pages' header: back to the job, what Annotate found, and the switch between its two views. */
export function AnnotateHeader({
  jobId,
  filename,
  ann,
  view,
}: {
  jobId: string;
  filename: string;
  ann: AnnotateResult;
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
          Annotate · {ann.classifications.length} classifications ·{" "}
          {ann.warnings.length} warnings
        </span>
      </div>
      <ViewSwitch jobId={jobId} step="annotate" view={view} />
    </header>
  );
}
