import { cn } from "@dark-factory/ui/lib/utils";
import Link from "next/link";

const VIEWS = [
  { id: "reader", label: "Reader", path: "" },
  { id: "graph", label: "Graph", path: "/graph" },
] as const;

/** The switch between a step's two views of its result. */
export function ViewSwitch({
  jobId,
  step,
  view,
}: {
  jobId: string;
  step: "parse" | "annotate";
  view: (typeof VIEWS)[number]["id"];
}) {
  return (
    <nav
      aria-label="View"
      className="ml-auto flex gap-1 rounded-sm border bg-muted p-1"
    >
      {VIEWS.map((v) => (
        <Link
          key={v.id}
          href={`/jobs/${jobId}/${step}${v.path}`}
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
  );
}
