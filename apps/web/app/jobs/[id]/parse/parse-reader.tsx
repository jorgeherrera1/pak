import type { Element, ParsedDocument } from "@dark-factory/parse";
import type { ReactNode } from "react";
import { anchor, Figure, PageDivider, Table } from "../reader-parts";
import { FlashTarget } from "./flash-target";

const page = (e: Element) => e.region[0]?.page;

/** Depth of a section under the root, for outline indentation. */
function depth(e: Element, byId: Map<string, Element>) {
  let d = 0;
  for (let p = e.parent; p; p = byId.get(p)?.parent ?? null) d++;
  return d;
}

export function ParseReader({
  doc,
  figureBase,
}: {
  doc: ParsedDocument;
  figureBase: string;
}) {
  const byId = new Map(doc.elements.map((e) => [e.id, e]));
  const sections = doc.elements.filter(
    (e) => e.kind === "section" && e.heading,
  );
  return (
    <div className="flex flex-1">
      <nav className="sticky top-0 flex h-screen w-72 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-card p-4 text-sm">
        <span className="px-3 pb-2 font-display text-xs font-bold tracking-eyebrow text-muted-foreground uppercase">
          Outline
        </span>
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${anchor(s.id)}`}
            className="rounded-sm px-3 py-1.5 hover:bg-secondary"
            style={{ paddingLeft: `${12 + (depth(s, byId) - 1) * 12}px` }}
          >
            {s.kind === "section" && s.heading}
          </a>
        ))}
      </nav>
      <div className="flex flex-1 justify-center bg-muted px-12 py-10">
        <article className="flex w-[880px] flex-col gap-5 rounded-lg border bg-card px-14 py-12">
          {doc.warnings.length > 0 && (
            <div className="rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <span className="font-bold text-destructive">
                {doc.warnings.length} warnings
              </span>
              <ul className="mt-1 list-disc pl-5">
                {doc.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <Elements doc={doc} byId={byId} figureBase={figureBase} />
          <FlashTarget />
        </article>
      </div>
    </div>
  );
}

function Elements({
  doc,
  byId,
  figureBase,
}: {
  doc: ParsedDocument;
  byId: Map<string, Element>;
  figureBase: string;
}) {
  const out: ReactNode[] = [];
  let currentPage: number | undefined;
  for (const e of doc.elements) {
    // Sections carry their first child's page, so they would re-announce it.
    if (e.kind === "section") {
      out.push(<span key={e.id} id={anchor(e.id)} />);
      continue;
    }
    const p = page(e);
    if (p !== undefined && p > (currentPage ?? 0)) {
      currentPage = p;
      out.push(<PageDivider key={`page-${p}`} page={p} />);
    }
    out.push(
      <Row key={e.id} e={e} byId={byId}>
        <Body e={e} figureBase={figureBase} />
      </Row>,
    );
  }
  return out;
}

/**
 * Content on the left, the element id and role in a muted margin on the right.
 * `data-anchors` lists the anchors that land on it: its own and every section it sits in.
 */
function Row({
  e,
  byId,
  children,
}: {
  e: Element;
  byId: Map<string, Element>;
  children: ReactNode;
}) {
  const meta = e.kind === "paragraph" && e.role ? `${e.id} · ${e.role}` : e.id;
  const anchors = [anchor(e.id)];
  for (let p = e.parent; p; p = byId.get(p)?.parent ?? null)
    anchors.push(anchor(p));
  return (
    <div
      id={anchor(e.id)}
      data-anchors={anchors.join(" ")}
      className="grid grid-cols-[1fr_150px] gap-4"
    >
      <div className="min-w-0">{children}</div>
      <code className="pt-1 text-right text-[11px] leading-tight text-muted-foreground">
        {meta}
      </code>
    </div>
  );
}

function Body({ e, figureBase }: { e: Element; figureBase: string }) {
  switch (e.kind) {
    case "section":
      return null;
    case "paragraph":
      if (e.role === "title")
        return <h1 className="font-display text-h3">{e.text}</h1>;
      if (e.role === "sectionHeading")
        return (
          <h2 className="font-display text-eyebrow tracking-eyebrow uppercase">
            {e.text}
          </h2>
        );
      if (e.role)
        return <p className="text-xs text-muted-foreground">{e.text}</p>;
      return <p className="text-body-lg leading-relaxed">{e.text}</p>;
    case "table":
      return (
        <Table
          e={e}
          className="w-full border-collapse text-sm"
          cellClassName="border px-2 py-1 text-left align-top"
          cell={(c) => c.text}
        />
      );
    case "figure":
      return <Figure e={e} figureBase={figureBase} />;
  }
}
