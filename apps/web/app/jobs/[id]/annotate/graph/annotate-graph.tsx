"use client";

import type { Classification } from "@dark-factory/annotate";
import type { ParsedDocument } from "@dark-factory/parse";
import { cn } from "@dark-factory/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { HEIGHT, toOutline, type OutlineCard } from "@/lib/outline";
import { DOCUMENT } from "@/lib/parse-tree";
import { CATEGORY, familyOf, ORDER, owner } from "@/lib/vocabulary";
import { anchor } from "../../reader-parts";

const flip = (key: string) => (set: ReadonlySet<string>) => {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
};

/** A type in its family's colour, as the reader's margin chips show it. */
function TypeChip({ r }: { r: Classification }) {
  const f = familyOf(r.type);
  return (
    <span
      className={`shrink-0 rounded-[6px] px-2 py-0.5 text-[11px] font-bold ${f.tint[0]} ${f.ink}`}
    >
      {r.type}
    </span>
  );
}

/** Sections on the left, the annotations they hold on the right; beside them, the one picked and every type. */
export function AnnotateGraph({
  doc,
  requirements,
  jobId,
}: {
  doc: ParsedDocument;
  requirements: Classification[];
  jobId: string;
}) {
  const everything = useMemo(
    () =>
      new Set([
        DOCUMENT,
        ...doc.elements.filter((e) => e.kind === "section").map((e) => e.id),
      ]),
    [doc],
  );
  const [open, setOpen] = useState<ReadonlySet<string>>(everything);
  /** Types switched off. */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const outline = useMemo(
    () => toOutline(doc, requirements, open, hidden),
    [doc, requirements, open, hidden],
  );
  const picked = outline.cards.find((c) => c.r.id === selected);
  const counts = new Map<string, number>();
  for (const r of requirements)
    counts.set(r.type, (counts.get(r.type) ?? 0) + 1);

  return (
    <div className="flex min-h-0 flex-1 gap-4 bg-muted p-6">
      <section
        aria-label="Outline"
        className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card"
      >
        <div className="flex items-center justify-between gap-4 border-b px-4 py-2.5">
          <span className="text-sm text-muted-foreground">
            Sections on the left, the annotations they hold on the right. Click
            a section to fold it.
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(everything)}
              className="h-10 rounded-sm border px-3.5 text-sm hover:bg-secondary"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={() => setOpen(new Set())}
              className="h-10 rounded-sm border px-3.5 text-sm hover:bg-secondary"
            >
              Collapse all
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <div
            className="relative"
            style={{ width: outline.width, height: outline.height }}
          >
            <svg
              width={outline.width}
              height={outline.height}
              className="absolute inset-0 fill-none stroke-border"
              strokeWidth={1.5}
              aria-hidden
            >
              <path d={outline.tree} />
              {outline.cards
                .filter((c) => c !== picked)
                .map((c) => (
                  <path key={c.r.id} d={c.link} />
                ))}
              {/* Last, so it crosses over the others. */}
              {picked && (
                <path
                  d={picked.link}
                  strokeWidth={2.5}
                  className="stroke-primary"
                />
              )}
            </svg>
            {outline.rows.map((row) => (
              <button
                key={row.id}
                type="button"
                aria-expanded={row.count ? row.open : undefined}
                disabled={!row.count}
                onClick={() => setOpen(flip(row.id))}
                style={{
                  left: row.x,
                  top: row.y,
                  width: row.w,
                  height: HEIGHT,
                }}
                className={cn(
                  "absolute flex items-center gap-2 rounded-sm border bg-card px-2.5 text-left text-sm disabled:cursor-default",
                  row.id === DOCUMENT &&
                    "border-foreground bg-foreground font-bold text-background",
                  row.id === picked?.section && "border-primary bg-secondary",
                )}
              >
                <ChevronRight
                  className={cn(
                    "size-4 shrink-0 transition-transform",
                    row.open && "rotate-90",
                    !row.count && "opacity-0",
                  )}
                />
                <span title={row.label} className="min-w-0 flex-1 truncate">
                  {row.label}
                </span>
                <span
                  className={cn(
                    "min-w-6 shrink-0 rounded-full px-1.5 text-center text-xs",
                    row.id === DOCUMENT
                      ? "opacity-70"
                      : "text-muted-foreground",
                    row.count > 0 && row.id !== DOCUMENT && "bg-muted",
                  )}
                >
                  {row.count}
                </span>
              </button>
            ))}
            {outline.cards.map((c) => (
              <button
                key={c.r.id}
                type="button"
                aria-pressed={c === picked}
                onClick={() => setSelected(c.r.id)}
                style={{ left: c.x, top: c.y, width: c.w, height: HEIGHT }}
                className={cn(
                  "absolute flex items-center gap-2.5 rounded-sm border bg-card pr-3 pl-2 text-left text-sm",
                  c === picked && "border-primary bg-secondary",
                )}
              >
                <TypeChip r={c.r} />
                <span title={c.r.text} className="min-w-0 flex-1 truncate">
                  {c.r.text}
                </span>
                <code className="shrink-0 text-[11px] text-muted-foreground">
                  {c.r.elementId}
                </code>
              </button>
            ))}
          </div>
        </div>
      </section>

      <aside className="flex w-[360px] shrink-0 flex-col gap-4 overflow-y-auto">
        {picked ? (
          <Picked c={picked} jobId={jobId} />
        ) : (
          <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
            Pick an annotation to see the exact text it quotes.
          </p>
        )}
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
          <h2 className="mb-2 ml-1 font-display text-sm font-bold">Types</h2>
          {ORDER.map((t) => {
            const n = counts.get(t) ?? 0;
            const on = !hidden.has(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                disabled={!n}
                onClick={() => setHidden(flip(t))}
                className="flex min-h-8 items-center gap-2.5 rounded-xs px-2 text-left text-sm hover:bg-secondary disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span
                  className={cn(
                    "size-2.5 shrink-0 rounded-[3px]",
                    familyOf(t).swatch,
                    !on && "opacity-40",
                  )}
                />
                <span
                  className={cn(
                    "flex-1",
                    !on && "text-muted-foreground line-through",
                  )}
                >
                  {t}
                </span>
                <span className="text-xs text-muted-foreground">{n}</span>
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

/** The picked annotation: its type, the words it quotes, and where they are. */
function Picked({ c, jobId }: { c: OutlineCard; jobId: string }) {
  const { r } = c;
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <TypeChip r={r} />
        {r.category && (
          <span className="text-muted-foreground">
            {r.category} · {CATEGORY[r.category]}
          </span>
        )}
      </div>
      <p className="text-body leading-relaxed text-pretty">“{r.text}”</p>
      <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Quotes</dt>
        <dd>
          <code className="text-xs">{r.elementId}</code>
        </dd>
        <dt className="text-muted-foreground">Section</dt>
        <dd>{c.path || "Untitled"}</dd>
      </dl>
      <Link
        href={`/jobs/${jobId}/annotate#${anchor(owner(r.elementId))}`}
        className="self-start py-2 text-sm font-bold text-primary hover:text-action-hover"
      >
        Show in reader
      </Link>
    </div>
  );
}
