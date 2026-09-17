import type { Cell, Element, ParsedDocument } from "@dark-factory/parse";
import type { ReactNode } from "react";

/** "sections/3" → "sections-3", usable as a DOM id and fragment. */
const anchor = (id: string) => id.replace("/", "-");
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
          <Elements doc={doc} figureBase={figureBase} />
        </article>
      </div>
    </div>
  );
}

function Elements({
  doc,
  figureBase,
}: {
  doc: ParsedDocument;
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
      out.push(
        <div
          key={`page-${p}`}
          className="flex items-center gap-3 pt-4 font-display text-xs font-bold tracking-eyebrow text-muted-foreground uppercase"
        >
          Page {p}
          <span className="h-px flex-1 bg-border" />
        </div>,
      );
    }
    out.push(
      <Row key={e.id} e={e}>
        <Body e={e} figureBase={figureBase} />
      </Row>,
    );
  }
  return out;
}

/** Content on the left, the element id and role in a muted margin on the right. */
function Row({ e, children }: { e: Element; children: ReactNode }) {
  const meta = e.kind === "paragraph" && e.role ? `${e.id} · ${e.role}` : e.id;
  return (
    <div id={anchor(e.id)} className="grid grid-cols-[1fr_150px] gap-4">
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
      return <Table rows={e.rows} cols={e.cols} cells={e.cells} />;
    case "figure":
      return (
        <figure className="flex flex-col gap-2">
          {e.image && (
            // eslint-disable-next-line @next/next/no-img-element -- blob-served png, size unknown
            <img
              src={figureBase + e.image}
              alt={e.caption ?? e.id}
              className="max-w-full rounded-sm border"
            />
          )}
          {e.caption && (
            <figcaption className="text-sm text-muted-foreground">
              {e.caption}
            </figcaption>
          )}
        </figure>
      );
  }
}

function Table({
  rows,
  cols,
  cells,
}: {
  rows: number;
  cols: number;
  cells: Cell[];
}) {
  const grid: (Cell | undefined)[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }),
  );
  for (const c of cells) grid[c.row]![c.col] = c;
  return (
    <table className="w-full border-collapse text-sm">
      <tbody>
        {grid.map((row, r) => (
          <tr key={r}>
            {row.map((c, i) => {
              if (!c) return null;
              const Tag = c.kind === "columnHeader" ? "th" : "td";
              return (
                <Tag
                  key={i}
                  rowSpan={c.rowSpan}
                  colSpan={c.colSpan}
                  className="border px-2 py-1 text-left align-top"
                >
                  {c.text}
                </Tag>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
