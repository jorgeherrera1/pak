import type { ParsedDocument } from "@dark-factory/parse";
import { cn } from "@dark-factory/ui/lib/utils";
import Link from "next/link";

const VIEWS = [
  { id: "reader", label: "Reader", path: "" },
  { id: "graph", label: "Graph", path: "/graph" },
] as const;

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
  view: (typeof VIEWS)[number]["id"];
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
      <nav
        aria-label="View"
        className="ml-auto flex gap-1 rounded-sm border bg-muted p-1"
      >
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            href={`/jobs/${jobId}/parse${v.path}`}
            aria-current={v.id === view ? "page" : undefined}
            className={cn(
              "rounded-xs px-4 py-1.5 text-sm font-bold text-muted-foreground hover:text-foreground",
              v.id === view && "bg-card text-primary shadow-xs",
            )}
          >
            {v.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
