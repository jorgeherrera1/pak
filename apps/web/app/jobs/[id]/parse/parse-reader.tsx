import type {
  AnnotateResult,
  Classification,
  Mention,
} from "@dark-factory/annotate";
import type { Cell, Element, ParsedDocument } from "@dark-factory/parse";
import type { ReactNode } from "react";
import { segments } from "@/lib/segments";

// SPIKE: annotation overlay. Hex values are the mockup's light palette; no dark mode.
type Mark = Classification | Mention;
type Marks = Map<string, Mark[]>;
const FAMILY: Record<string, [tint: string, ink: string]> = Object.fromEntries(
  (
    [
      [
        "#dcebfb",
        "#134a94",
        "functional-requirement data-requirement ux-requirement non-functional-requirement operational-requirement",
      ],
      [
        "#dff1e7",
        "#1f5a3c",
        "data-entity integration feature user-class product mockup",
      ],
      [
        "#e6e8fd",
        "#343fae",
        "dependency assumption imposed-technology standard configurable-item",
      ],
      ["#eef2cf", "#525b1c", "business-goal out-of-scope glossary-term"],
    ] as const
  ).flatMap(([tint, ink, types]) =>
    types.split(" ").map((t) => [t, [tint, ink]]),
  ),
);
const kindOf = (m: Mark) => ("type" in m ? m.type : m.kind);

function Text({
  text,
  base,
  marks,
}: {
  text: string;
  base?: number;
  marks?: Mark[];
}) {
  if (!marks?.length || base === undefined) return text;
  return segments(text, base, marks).map((s, i) => {
    const cls = s.marks.find((m) => "type" in m);
    const men = s.marks.find((m) => "kind" in m);
    if (!cls && !men) return s.text;
    return (
      <span
        key={i}
        title={s.marks
          .map(
            (m) => `${m.id} ${kindOf(m)}${"name" in m ? ` · ${m.name}` : ""}`,
          )
          .join("\n")}
        style={{
          background: cls && FAMILY[kindOf(cls)]?.[0],
          borderBottom: men && `2px solid ${FAMILY[kindOf(men)]?.[1]}`,
        }}
      >
        {s.text}
      </span>
    );
  });
}

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
  annotations,
}: {
  doc: ParsedDocument;
  figureBase: string;
  annotations?: AnnotateResult;
}) {
  const marks: Marks = new Map();
  for (const m of [
    ...(annotations?.classifications ?? []),
    ...(annotations?.mentions ?? []),
  ])
    marks.set(m.elementId, [...(marks.get(m.elementId) ?? []), m]);
  const warnings = [...doc.warnings, ...(annotations?.warnings ?? [])];
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
          {warnings.length > 0 && (
            <div className="rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <span className="font-bold text-destructive">
                {warnings.length} warnings
              </span>
              <ul className="mt-1 list-disc pl-5">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <Elements doc={doc} figureBase={figureBase} marks={marks} />
        </article>
      </div>
    </div>
  );
}

function Elements({
  doc,
  figureBase,
  marks,
}: {
  doc: ParsedDocument;
  figureBase: string;
  marks: Marks;
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
      <Row key={e.id} e={e} marks={marks}>
        <Body
          e={e}
          figureBase={figureBase}
          marks={marks}
          content={doc.content}
        />
      </Row>,
    );
  }
  return out;
}

/** Content on the left, the element id and role in a muted margin on the right. */
function Row({
  e,
  marks,
  children,
}: {
  e: Element;
  marks: Marks;
  children: ReactNode;
}) {
  const meta = e.kind === "paragraph" && e.role ? `${e.id} · ${e.role}` : e.id;
  // A table's marks hang off its cells.
  const own = [...marks].flatMap(([id, ms]) =>
    id === e.id || id.startsWith(`${e.id}/`) ? ms : [],
  );
  const mentions = own.filter((m) => "kind" in m).length;
  return (
    <div id={anchor(e.id)} className="grid grid-cols-[1fr_150px] gap-4">
      <div className="min-w-0">{children}</div>
      <div className="flex flex-col items-end gap-1 pt-1 text-right text-[11px] leading-tight text-muted-foreground">
        <code>{meta}</code>
        {own.map(
          (m) =>
            "type" in m && (
              <span
                key={m.id}
                className="rounded-sm px-1.5 py-0.5 font-bold"
                style={{
                  background: FAMILY[m.type]?.[0],
                  color: FAMILY[m.type]?.[1],
                }}
              >
                {m.id} {m.type}
                {m.category && ` · ${m.category}`}
              </span>
            ),
        )}
        {mentions > 0 && <span>{mentions} mentions</span>}
      </div>
    </div>
  );
}

function Body({
  e,
  figureBase,
  marks,
  content,
}: {
  e: Element;
  figureBase: string;
  marks: Marks;
  content: string;
}) {
  const own = marks.get(e.id);
  const base = e.span[0]?.offset;
  const t = (text: string) => <Text text={text} base={base} marks={own} />;
  switch (e.kind) {
    case "section":
      return null;
    case "paragraph":
      if (e.role === "title")
        return <h1 className="font-display text-h3">{t(e.text)}</h1>;
      if (e.role === "sectionHeading")
        return (
          <h2 className="font-display text-eyebrow tracking-eyebrow uppercase">
            {t(e.text)}
          </h2>
        );
      if (e.role)
        return <p className="text-xs text-muted-foreground">{t(e.text)}</p>;
      return <p className="text-body-lg leading-relaxed">{t(e.text)}</p>;
    case "table":
      return (
        <Table rows={e.rows} cols={e.cols} cells={e.cells} marks={marks} />
      );
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
          {/* A figure has no text of its own; its words exist only in content. */}
          {own && e.span[0] && (
            <p className="text-sm whitespace-pre-line text-muted-foreground">
              {t(content.slice(base, base! + e.span[0].length))}
            </p>
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
  marks,
}: {
  rows: number;
  cols: number;
  cells: Cell[];
  marks: Marks;
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
                  <Text
                    text={c.text}
                    base={c.span[0]?.offset}
                    marks={marks.get(c.id)}
                  />
                </Tag>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
