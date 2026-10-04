import type { Classification } from "@dark-factory/annotate";
import type { Element, ParsedDocument } from "@dark-factory/parse";
import { owner } from "./vocabulary";

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
export type TreeNode = { id: string; position: { x: number; y: number } } & (
  | { type: "element"; data: TreeNodeData }
  | { type: "requirement"; data: Classification }
);
/** An IN edge from the child to the element (or Document) it sits in, or a FROM edge from a requirement to the element it quotes. */
export type TreeEdge = { id: string; source: string; target: string };

export const plural = (n: number, word: string) =>
  `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * "4 paragraphs · 1 table" for what an element holds, sections left out: they are always drawn.
 * Given what the requirements quote, "2 annotations · 2 of 4 paragraphs · 0 of 1 table".
 */
export function holds(
  children: Element[],
  quoted?: ReadonlyMap<string, Classification[]>,
): string {
  const counts = new Map<string, { quoted: number; all: number }>();
  let annotations = 0;
  for (const c of children) {
    if (c.kind === "section") continue;
    const n = quoted?.get(c.id)?.length ?? 0;
    annotations += n;
    const count = counts.get(c.kind) ?? { quoted: 0, all: 0 };
    counts.set(c.kind, { quoted: count.quoted + (n && 1), all: count.all + 1 });
  }
  const parts = [...counts].map(([kind, n]) =>
    quoted ? `${n.quoted} of ${plural(n.all, kind)}` : plural(n.all, kind),
  );
  if (quoted && parts.length) parts.unshift(plural(annotations, "annotation"));
  return parts.join(" · ");
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

/** The requirements quoting each element, in the order given; a cell's belong to its table. */
function quotes(requirements: Classification[]): Map<string, Classification[]> {
  const out = new Map<string, Classification[]>();
  for (const r of requirements) {
    const id = owner(r.elementId);
    out.set(id, [...(out.get(id) ?? []), r]);
  }
  return out;
}

/**
 * The parse graph as a left-to-right tree: one column per depth, Document first.
 * Sections are always drawn; an element's paragraphs, tables and figures only
 * when its id is in `open`. Table cells are never drawn: the table holds them.
 *
 * Given `requirements`, an open element shows only what some requirement quotes,
 * and each requirement hangs off the element it quotes as a leaf: a cell's off its table.
 *
 * Visible leaves stack top to bottom in reading order and each parent centres on
 * its first and last child. With every card the same height, that keeps cards in
 * a column at least one ROW apart.
 */
export function toTree(
  doc: ParsedDocument,
  open: ReadonlySet<string>,
  requirements?: Classification[],
): { nodes: TreeNode[]; edges: TreeEdge[] } {
  const children = childrenOf(doc);
  const quoted = requirements && quotes(requirements);
  /** Shown once its parent is open: paragraphs, tables and figures, only those quoted when there are requirements. */
  const held = (e: Element) =>
    e.kind !== "section" && (!quoted || quoted.has(e.id));
  const nodes: TreeNode[] = [];
  const edges: TreeEdge[] = [];
  let next = 0;
  /** Leaves stack top to bottom; returns the y of the next one's centre. */
  const leaf = () => next++ * ROW + CARD.height / 2;

  /** Places `id` and its visible subtree; returns the y of its centre. */
  const place = (id: string, depth: number, data: TreeNodeData): number => {
    const kids = (children.get(id) ?? []).filter(
      (c) => c.kind === "section" || (open.has(id) && held(c)),
    );
    const centres = kids.map((c) => {
      edges.push({ id: `${c.id}->${id}`, source: c.id, target: id });
      return place(c.id, depth + 1, elementData(c));
    });
    for (const r of quoted?.get(id) ?? []) {
      edges.push({ id: `${r.id}->${id}`, source: r.id, target: id });
      const y = leaf();
      nodes.push({
        id: r.id,
        type: "requirement",
        position: { x: (depth + 1) * COLUMN, y: y - CARD.height / 2 },
        data: r,
      });
      centres.push(y);
    }
    const centre = centres.length
      ? (centres[0]! + centres.at(-1)!) / 2
      : leaf();
    nodes.push({
      id,
      type: "element",
      position: { x: depth * COLUMN, y: centre - CARD.height / 2 },
      data,
    });
    return centre;
  };

  const elementData = (e: Element): TreeNodeData => {
    const kids = children.get(e.id) ?? [];
    const role = e.kind === "paragraph" && e.role ? ` · ${e.role}` : "";
    return {
      kind: e.kind,
      label: label(e),
      caption: [e.id + role, holds(kids, quoted)].filter(Boolean).join(" · "),
      openable: kids.some(held),
      open: open.has(e.id),
    };
  };

  const kids = children.get(DOCUMENT) ?? [];
  place(DOCUMENT, 0, {
    kind: "document",
    label: "Document",
    caption: [plural(doc.source.pages, "page"), holds(kids, quoted)]
      .filter(Boolean)
      .join(" · "),
    openable: kids.some(held),
    open: open.has(DOCUMENT),
  });
  return { nodes, edges };
}
