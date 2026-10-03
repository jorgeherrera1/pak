"use client";

import type { Element, ParsedDocument } from "@dark-factory/parse";
import { ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { bounds, pageOutlines, type Outline } from "@/lib/page-outline";
import { childrenOf, DOCUMENT, holds, label, subtree } from "@/lib/parse-tree";
import { anchor, Figure, Table } from "../../reader-parts";

const KIND = {
  section: "Section",
  paragraph: "Paragraph",
  table: "Table",
  figure: "Figure",
} as const;

const fixed = (n: number) => n.toFixed(2);

/** What the selected node holds and where it came from: its parent, its place in the text, and its place on the page. */
export function ElementPanel({
  doc,
  jobId,
  id,
  onSelect,
  onClose,
}: {
  doc: ParsedDocument;
  jobId: string;
  id: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const children = useMemo(() => childrenOf(doc), [doc]);
  const index = doc.elements.findIndex((e) => e.id === id);
  const e = doc.elements[index];
  const outlines = useMemo(
    () => (e ? pageOutlines(doc, subtree(children, e.id)) : []),
    [doc, children, e],
  );
  const parent = e?.parent ? doc.elements.find((p) => p.id === e.parent) : null;
  const eyebrow = e
    ? KIND[e.kind] + (e.kind === "paragraph" && e.role ? ` · ${e.role}` : "")
    : "Document";

  return (
    <aside
      aria-label={`Selected: ${id}`}
      className="flex w-[420px] shrink-0 flex-col gap-6 overflow-y-auto border-l bg-card p-6 *:shrink-0"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-display text-eyebrow tracking-eyebrow text-primary uppercase">
            {eyebrow}
          </span>
          <h2 className="font-display text-h5 font-bold break-all">
            {e ? e.id : "Document"}
          </h2>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded-xs p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </div>

      {e ? (
        <Content e={e} inside={holds(children.get(e.id) ?? [])} jobId={jobId} />
      ) : (
        <Facts>
          <Fact term="Pages">{doc.source.pages}</Fact>
          <Fact term="Elements">{doc.elements.length}</Fact>
          <Fact term="Characters">{doc.content.length.toLocaleString()}</Fact>
          <Fact term="SHA-256">
            <code className="text-xs break-all">{doc.source.sha256}</code>
          </Fact>
          {doc.warnings.length > 0 && (
            <Fact term="Warnings">
              <ul className="list-disc pl-4">
                {doc.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Fact>
          )}
        </Facts>
      )}

      {e && (
        <section className="flex flex-col gap-3">
          <h3 className="font-display text-xs font-bold tracking-eyebrow text-muted-foreground uppercase">
            Provenance
          </h3>
          <Facts>
            <Fact term="IN">
              <button
                type="button"
                onClick={() => onSelect(parent?.id ?? DOCUMENT)}
                className="text-left font-bold text-primary hover:text-action-hover"
              >
                {parent ? `${parent.id} · ${label(parent)}` : "Document"}
              </button>
            </Fact>
            <Fact term="Reading order">
              {index + 1} of {doc.elements.length}
            </Fact>
            <Fact term="Span">
              {e.span.map((s) => (
                <code key={s.offset} className="block text-xs">
                  offset {s.offset} · length {s.length}
                </code>
              ))}
            </Fact>
            {e.region.length > 0 && (
              <Fact term="Region">
                {e.region.map((r, i) => {
                  const b = bounds(r.polygon);
                  return (
                    <code key={i} className="block text-xs">
                      page {r.page} · {fixed(b.x)}, {fixed(b.y)} →{" "}
                      {fixed(b.x + b.width)}, {fixed(b.y + b.height)}
                    </code>
                  );
                })}
              </Fact>
            )}
          </Facts>
          {outlines.map((o) => (
            <PageOutline key={o.page} outline={o} id={e.id} />
          ))}
        </section>
      )}

      <Link
        href={`/jobs/${jobId}/parse${e ? `#${anchor(e.id)}` : ""}`}
        className="flex items-center gap-1 self-start text-sm font-bold text-primary hover:text-action-hover"
      >
        Show in reader
        <ChevronRight className="size-4" />
      </Link>
    </aside>
  );
}

function Content({
  e,
  inside,
  jobId,
}: {
  e: Element;
  inside: string;
  jobId: string;
}) {
  switch (e.kind) {
    case "section":
      return (
        <div className="flex flex-col gap-1">
          <p className="font-display text-body-lg font-bold">
            {e.heading ?? "Untitled"}
          </p>
          {inside && (
            <p className="text-sm text-muted-foreground">Holds {inside}</p>
          )}
        </div>
      );
    case "paragraph":
      return (
        <p className="rounded-sm bg-muted p-4 leading-relaxed">{e.text}</p>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          <Table
            e={e}
            className="w-full border-collapse text-xs"
            cellClassName="border px-2 py-1 text-left align-top"
            cell={(c) => c.text}
          />
        </div>
      );
    case "figure":
      return <Figure e={e} figureBase={`/api/jobs/${jobId}/artifacts/`} />;
  }
}

function Facts({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[112px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
      {children}
    </dl>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{term}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** Every paragraph, table and figure on the page as a box, the selection's filled in. */
function PageOutline({ outline, id }: { outline: Outline; id: string }) {
  const { frame } = outline;
  // Marked last, so they paint over their neighbours.
  const boxes = [...outline.boxes].sort(
    (a, b) => Number(a.marked) - Number(b.marked),
  );
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-xs text-muted-foreground">
        Page {outline.page}
      </figcaption>
      <svg
        role="img"
        aria-label={`Where ${id} sits on page ${outline.page}`}
        viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
        className="w-full rounded-sm border bg-background"
      >
        {boxes.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={b.width}
            height={b.height}
            vectorEffect="non-scaling-stroke"
            className={
              b.marked
                ? "fill-primary/20 stroke-primary stroke-2"
                : "fill-muted stroke-muted-foreground/40"
            }
          >
            <title>{b.id}</title>
          </rect>
        ))}
      </svg>
    </figure>
  );
}
