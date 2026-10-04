"use client";

import type { Element, ParsedDocument } from "@dark-factory/parse";
import { X } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { childrenOf, DOCUMENT, label, plural } from "@/lib/parse-tree";
import { anchor, Figure, Table } from "../reader-parts";

const KIND = {
  section: "Section",
  paragraph: "Paragraph",
  table: "Table",
  figure: "Figure",
} as const;

const fixed = (n: number) => n.toFixed(2);

/** "1st", "2nd", "3rd", "9th", "11th", "22nd". */
function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

/** The corners of the box around a region's polygon: "0.77, 2.86 → 7.44, 3.26". */
function corners(polygon: number[]): string {
  const xs = polygon.filter((_, i) => i % 2 === 0);
  const ys = polygon.filter((_, i) => i % 2 === 1);
  return `${fixed(Math.min(...xs))}, ${fixed(Math.min(...ys))} → ${fixed(Math.max(...xs))}, ${fixed(Math.max(...ys))}`;
}

/** The selected node: what it says, where it sits in the graph and the text, and where it was found on the page. */
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
  const parent = e?.parent ? doc.elements.find((p) => p.id === e.parent) : null;
  // The Document comes before every element, so its next is the first one.
  const next = doc.elements[index + 1];

  return (
    <aside
      aria-label={`Selected: ${id}`}
      className="flex w-[420px] shrink-0 flex-col gap-6 overflow-y-auto border-l bg-card p-8 *:shrink-0"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-display text-eyebrow tracking-eyebrow text-primary uppercase">
            {e ? KIND[e.kind] : "Document"}
          </span>
          <h2 className="font-display text-h4 font-bold break-all">
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
        <>
          <Content e={e} kids={children.get(e.id) ?? []} jobId={jobId} />
          <Facts>
            <Fact term="IN">
              <button
                type="button"
                onClick={() => onSelect(parent?.id ?? DOCUMENT)}
                className="text-left text-primary hover:text-action-hover"
              >
                {parent ? `${parent.id} · ${label(parent)}` : "Document"}
              </button>
            </Fact>
            <Fact term="Position">
              {ordinal(index + 1)} of {doc.elements.length} in reading order
            </Fact>
            <Fact term="Span">
              {e.span.map((s) => (
                <code key={s.offset} className="block text-[13px]">
                  offset {s.offset} · length {s.length}
                </code>
              ))}
            </Fact>
            {e.region.length > 0 && (
              <Fact term="Region">
                {e.region.map((r, i) => (
                  <code key={i} className="block text-[13px]">
                    page {r.page} · {corners(r.polygon)}
                  </code>
                ))}
              </Fact>
            )}
          </Facts>
        </>
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

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/jobs/${jobId}/parse${e ? `#${anchor(e.id)}` : ""}`}
          className="flex h-11 items-center rounded-sm bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-action-hover"
        >
          Show in reader
        </Link>
        {next && (
          <button
            type="button"
            onClick={() => onSelect(next.id)}
            className="flex h-11 items-center rounded-sm border px-4 text-sm font-bold text-primary hover:bg-secondary"
          >
            Next in order →
          </button>
        )}
      </div>
    </aside>
  );
}

/** How many body paragraphs a section's excerpt shows before sending the reader on. */
const EXCERPT = 10;

function Content({
  e,
  kids,
  jobId,
}: {
  e: Element;
  kids: Element[];
  jobId: string;
}) {
  switch (e.kind) {
    case "section": {
      // Title and heading paragraphs repeat the section's own heading.
      const body = kids.filter(
        (k) =>
          k.kind === "paragraph" &&
          k.role !== "title" &&
          k.role !== "sectionHeading",
      );
      const count = (kind: Element["kind"]) =>
        kids.filter((k) => k.kind === kind).length;
      const rest = (
        [
          [body.length - EXCERPT, "more paragraph"],
          [count("table"), "table"],
          [count("figure"), "figure"],
          [count("section"), "subsection"],
        ] as const
      )
        .filter(([n]) => n > 0)
        .map(([n, word]) => plural(n, word));
      return (
        <div className="flex flex-col gap-2">
          <div className="relative flex max-h-[460px] flex-col gap-3 overflow-hidden rounded-sm bg-muted p-4 text-body leading-relaxed text-pretty">
            <p className="font-display font-bold">{e.heading ?? "Untitled"}</p>
            {body
              .slice(0, EXCERPT)
              .map((p) => p.kind === "paragraph" && <p key={p.id}>{p.text}</p>)}
            {rest.length > 0 && (
              <div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-b from-transparent to-muted" />
            )}
          </div>
          {rest.length > 0 && (
            <Link
              href={`/jobs/${jobId}/parse#${anchor(e.id)}`}
              className="text-sm text-primary hover:text-action-hover"
            >
              Continue in reader · {rest.join(", ")}
            </Link>
          )}
        </div>
      );
    }
    case "paragraph":
      return (
        <p className="rounded-sm bg-muted p-4 text-body leading-relaxed text-pretty">
          {e.text}
        </p>
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
    <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
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
