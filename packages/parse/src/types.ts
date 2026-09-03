/** Output shape of the parse module. Nothing here references the vendor. */

export type Region = { page: number; polygon: number[] };
/** Character range into ParsedDocument.content. */
export type Span = { offset: number; length: number };

type Base = {
  /** Vendor element path with the leading slash removed, e.g. "paragraphs/12". Stable per analysis. */
  id: string;
  parent: string | null;
  region: Region[];
  span: Span[];
};

export type Cell = Base & {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  kind: string;
  text: string;
};

export type Element = Base &
  (
    | { kind: "section"; heading?: string }
    | { kind: "paragraph"; role?: string; text: string }
    | { kind: "table"; rows: number; cols: number; cells: Cell[] }
    | { kind: "figure"; caption?: string; image?: string }
  );

export type ParsedDocument = {
  source: { sha256: string; pages: number };
  /** The single text rendering every span indexes into. */
  content: string;
  /** Reading order. Containment via `parent` is the only relationship. */
  elements: Element[];
  warnings: string[];
};
