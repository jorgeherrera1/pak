import type { Element, ParsedDocument } from "@dark-factory/parse";

/** The Document node's id; element ids all contain a "/", so it cannot clash. */
export const DOCUMENT = "document";

export const CARD = { width: 264, height: 60 };
const COLUMN = CARD.width + 72;
const ROW = CARD.height + 12;

export type TreeNodeData = {
  kind: "document" | Element["kind"];
  /** Heading, text or caption: the card's first line. */
  label: string;
  /** Id and what it holds: the card's second line. */
  caption: string;
  /** Has paragraphs, tables or figures that show only once it is open. */
  openable: boolean;
  open: boolean;
};
export type TreeNode = {
  id: string;
  type: "element";
  position: { x: number; y: number };
  data: TreeNodeData;
};
/** An IN edge: from the child to the element (or Document) it sits in. */
export type TreeEdge = { id: string; source: string; target: string };

export const plural = (n: number, word: string) =>
  `${n} ${word}${n === 1 ? "" : "s"}`;

/** "4 paragraphs · 1 table" for what an element holds, sections left out: they are always drawn. */
export function holds(children: Element[]): string {
  const counts = new Map<string, number>();
  for (const c of children)
    if (c.kind !== "section") counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
  return [...counts].map(([kind, n]) => plural(n, kind)).join(" · ");
}

export function label(e: Element): string {
  switch (e.kind) {
    case "section":
      return e.heading ?? "Untitled";
    case "paragraph":
      return e.text;
    case "table":
      return `Table ${e.rows} × ${e.cols}`;
    case "figure":
      return e.caption ?? "Figure";
  }
}

/** Children of every element, and of the Document under DOCUMENT, in reading order. */
export function childrenOf(doc: ParsedDocument): Map<string, Element[]> {
  const out = new Map<string, Element[]>();
  for (const e of doc.elements) {
    const parent = e.parent ?? DOCUMENT;
    const kids = out.get(parent);
    if (kids) kids.push(e);
    else out.set(parent, [e]);
  }
  return out;
}

/**
 * The parse graph as a left-to-right tree: one column per depth, Document first.
 * Sections are always drawn; an element's paragraphs, tables and figures only
 * when its id is in `open`. Table cells are never drawn: the table holds them.
 *
 * Visible leaves stack top to bottom in reading order and each parent centres on
 * its first and last child. With every card the same height, that keeps cards in
 * a column at least one ROW apart.
 */
export function toTree(
  doc: ParsedDocument,
  open: ReadonlySet<string>,
): { nodes: TreeNode[]; edges: TreeEdge[] } {
  const children = childrenOf(doc);
  const nodes: TreeNode[] = [];
  const edges: TreeEdge[] = [];
  let next = 0;

  /** Places `id` and its visible subtree; returns the y of its centre. */
  const place = (id: string, depth: number, data: TreeNodeData): number => {
    const kids = (children.get(id) ?? []).filter(
      (c) => c.kind === "section" || open.has(id),
    );
    const centres = kids.map((c) => {
      edges.push({ id: `${c.id}->${id}`, source: c.id, target: id });
      return place(c.id, depth + 1, elementData(c));
    });
    const centre = centres.length
      ? (centres[0]! + centres.at(-1)!) / 2
      : next++ * ROW + CARD.height / 2;
    nodes.push({
      id,
      type: "element",
      position: { x: depth * COLUMN, y: centre - CARD.height / 2 },
      data,
    });
    return centre;
  };

  const elementData = (e: Element): TreeNodeData => {
    const inside = holds(children.get(e.id) ?? []);
    const role = e.kind === "paragraph" && e.role ? ` · ${e.role}` : "";
    return {
      kind: e.kind,
      label: label(e),
      caption: [e.id + role, inside].filter(Boolean).join(" · "),
      openable: inside !== "",
      open: open.has(e.id),
    };
  };

  const inside = holds(children.get(DOCUMENT) ?? []);
  place(DOCUMENT, 0, {
    kind: "document",
    label: "Document",
    caption: [plural(doc.source.pages, "page"), inside]
      .filter(Boolean)
      .join(" · "),
    openable: inside !== "",
    open: open.has(DOCUMENT),
  });
  return { nodes, edges };
}
