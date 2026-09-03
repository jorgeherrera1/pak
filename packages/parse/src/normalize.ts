import type {
  AnalyzeResultOutput,
  BoundingRegionOutput,
  DocumentSpanOutput,
} from "@azure-rest/ai-document-intelligence";
import type { Element, ParsedDocument, Region, Span } from "./types.ts";

const regions = (r: BoundingRegionOutput[] = []): Region[] =>
  r.map(({ pageNumber, polygon }) => ({ page: pageNumber, polygon }));
const spans = (s: DocumentSpanOutput[]): Span[] =>
  s.map(({ offset, length }) => ({ offset, length }));
const PAGE_FURNITURE = new Set(["pageHeader", "pageFooter", "pageNumber"]);
/** "/paragraphs/12" -> "paragraphs/12" */
const idOf = (path: string) => path.slice(1);

/** Pure: raw analysis in, ParsedDocument out. Every value is copied or mechanically derived. */
export function normalize(
  a: AnalyzeResultOutput,
  sha256: string,
): ParsedDocument {
  const elements: Element[] = [];
  const warnings: string[] = [];
  const emitted = new Set<string>();

  const paragraph = (i: number, parent: string | null): Element => {
    const p = a.paragraphs![i]!;
    return {
      id: `paragraphs/${i}`,
      parent,
      kind: "paragraph",
      ...(p.role && { role: p.role }),
      text: p.content,
      region: regions(p.boundingRegions),
      span: spans(p.spans),
    };
  };

  const table = (i: number, parent: string | null): Element => {
    const t = a.tables![i]!;
    return {
      id: `tables/${i}`,
      parent,
      kind: "table",
      rows: t.rowCount,
      cols: t.columnCount,
      cells: t.cells.map((c, j) => ({
        id: `tables/${i}/cells/${j}`,
        parent: `tables/${i}`,
        row: c.rowIndex,
        col: c.columnIndex,
        rowSpan: c.rowSpan ?? 1,
        colSpan: c.columnSpan ?? 1,
        kind: c.kind ?? "content",
        text: c.content,
        region: regions(c.boundingRegions),
        span: spans(c.spans),
      })),
      region: regions(t.boundingRegions),
      span: spans(t.spans),
    };
  };

  const figure = (i: number, parent: string | null): Element => {
    const f = a.figures![i]!;
    return {
      id: `figures/${i}`,
      parent,
      kind: "figure",
      ...(f.caption && { caption: f.caption.content }),
      ...(f.id && { image: `figures/${f.id}.png` }),
      region: regions(f.boundingRegions),
      span: spans(f.spans),
    };
  };

  const section = (i: number, parent: string | null): Element => {
    const s = a.sections![i]!;
    const first = s.elements?.[0]?.match(/^\/paragraphs\/(\d+)$/);
    const head = first && a.paragraphs![Number(first[1])];
    const isHeading = head?.role === "sectionHeading" || head?.role === "title";
    return {
      id: `sections/${i}`,
      parent,
      kind: "section",
      ...(isHeading && { heading: head.content }),
      region: [],
      span: spans(s.spans),
    };
  };

  const inFigure = new Set((a.figures ?? []).flatMap((f) => f.elements ?? []));

  // Depth-first walk in the vendor's reading order. Each element is emitted once,
  // under the first container that references it, except that text inside a
  // figure always belongs to the figure even when a section also lists it.
  const walk = (path: string, parent: string | null) => {
    if (emitted.has(path)) return;
    if (inFigure.has(path) && !parent?.startsWith("figures/")) return;
    emitted.add(path);
    const m = path.match(/^\/(\w+)\/(\d+)$/);
    const [, kind, index] = m ?? [];
    const i = Number(index);
    switch (kind) {
      case "sections":
        elements.push(section(i, parent));
        for (const child of a.sections![i]!.elements ?? [])
          walk(child, `sections/${i}`);
        break;
      case "paragraphs":
        elements.push(paragraph(i, parent));
        break;
      case "tables":
        elements.push(table(i, parent));
        break;
      case "figures":
        elements.push(figure(i, parent));
        for (const child of a.figures![i]!.elements ?? [])
          walk(child, `figures/${i}`);
        break;
      default:
        warnings.push(`unknown element ${path} under ${parent}`);
    }
  };

  const referenced = new Set(
    (a.sections ?? []).flatMap((s) => s.elements ?? []),
  );
  (a.sections ?? []).forEach((_, i) => {
    if (!referenced.has(`/sections/${i}`)) walk(`/sections/${i}`, null);
  });

  // Whatever no section reached. Cell text is already on the table, so it is not a node.
  // Page furniture is never inside a section by design, so it is not a warning either.
  const inCells = new Set(
    (a.tables ?? []).flatMap((t) => t.cells.flatMap((c) => c.elements ?? [])),
  );
  const orphan = (path: string, role?: string) => {
    if (emitted.has(path) || inCells.has(path) || inFigure.has(path)) return;
    if (!PAGE_FURNITURE.has(role ?? ""))
      warnings.push(`${idOf(path)} is not inside any section`);
    walk(path, null);
  };
  (a.paragraphs ?? []).forEach((p, i) => orphan(`/paragraphs/${i}`, p.role));
  (a.tables ?? []).forEach((_, i) => orphan(`/tables/${i}`));
  (a.figures ?? []).forEach((_, i) => orphan(`/figures/${i}`));

  return {
    source: { sha256, pages: a.pages.length },
    content: a.content,
    elements,
    warnings,
  };
}
