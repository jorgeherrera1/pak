import type { Classification } from "@dark-factory/annotate";
import type { ParsedDocument } from "@dark-factory/parse";
import { childrenOf, DOCUMENT, label } from "./parse-tree";
import { owner } from "./vocabulary";

/** Every row and card is HEIGHT tall, and ROW from the next one down. */
export const HEIGHT = 44;
export const ROW = HEIGHT + 8;
const INDENT = 20;
/** The outline ends at RIGHT; the cards' column starts at CARDS. */
const RIGHT = 336;
const CARDS = 400;
const CARD_WIDTH = 560;

export type OutlineRow = {
  id: string;
  label: string;
  depth: number;
  x: number;
  y: number;
  w: number;
  /** Annotations beside it, hidden types left out. */
  count: number;
  open: boolean;
};
export type OutlineCard = {
  r: Classification;
  /** The section holding what it quotes. */
  section: string;
  /** "PRODUCT REQUIREMENTS . INTERNAL TOOLS › What changes": the headed sections down to that one. */
  path: string;
  x: number;
  y: number;
  w: number;
  /** The curve joining it to its section. */
  link: string;
};

/**
 * The Document and its sections as an outline, top to bottom in reading order and
 * indented by depth. Beside each open section, stacked from its own line down, the
 * annotations quoting what it holds: a cell's count as its table's. `tree` draws
 * the outline's elbows. A section with nothing beside it never opens.
 */
export function toOutline(
  doc: ParsedDocument,
  requirements: Classification[],
  open: ReadonlySet<string>,
  hidden: ReadonlySet<string>,
): {
  rows: OutlineRow[];
  cards: OutlineCard[];
  tree: string;
  width: number;
  height: number;
} {
  const children = childrenOf(doc);
  const byId = new Map(doc.elements.map((e) => [e.id, e]));
  /** Up from `id` through its parents: itself first, the top section last. */
  const ancestry = (id: string) => {
    const out = [];
    for (let e = byId.get(id); e; e = e.parent ? byId.get(e.parent) : undefined)
      out.push(e);
    return out;
  };
  const beside = new Map<string, Classification[]>();
  for (const r of requirements) {
    if (hidden.has(r.type)) continue;
    // Page furniture sits in no section: its annotations go beside the Document.
    const section =
      ancestry(owner(r.elementId)).find((e) => e.kind === "section")?.id ??
      DOCUMENT;
    beside.set(section, [...(beside.get(section) ?? []), r]);
  }
  const path = (id: string) =>
    ancestry(id)
      .flatMap((e) => (e.kind === "section" && e.heading ? [e.heading] : []))
      .reverse()
      .join(" › ");

  const rows: OutlineRow[] = [];
  const cards: OutlineCard[] = [];
  let tree = "";
  let y = 16;
  const visit = (
    id: string,
    name: string,
    depth: number,
    parent?: OutlineRow,
  ) => {
    const list = beside.get(id) ?? [];
    const x = 16 + depth * INDENT;
    const row: OutlineRow = {
      id,
      label: name,
      depth,
      x,
      y,
      w: RIGHT - x,
      count: list.length,
      open: open.has(id) && list.length > 0,
    };
    rows.push(row);
    const mid = y + HEIGHT / 2;
    if (parent) tree += `M${parent.x + 10} ${parent.y + HEIGHT} V${mid} H${x} `;
    if (row.open) {
      list.forEach((r, k) => {
        const top = y + k * ROW;
        const end = top + HEIGHT / 2;
        cards.push({
          r,
          section: id,
          path: path(id),
          x: CARDS,
          y: top,
          w: CARD_WIDTH,
          link: `M${RIGHT} ${mid} C${RIGHT + 36} ${mid} ${CARDS - 36} ${end} ${CARDS} ${end}`,
        });
      });
      y += list.length * ROW;
    } else y += ROW;
    for (const c of children.get(id) ?? [])
      if (c.kind === "section") visit(c.id, label(c), depth + 1, row);
  };
  visit(DOCUMENT, "Document", 0);
  return { rows, cards, tree, width: CARDS + CARD_WIDTH + 16, height: y + 16 };
}
