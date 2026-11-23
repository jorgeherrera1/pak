import type { ParsedDocument } from "@dark-factory/parse";
import { GraphError } from "./errors.ts";
import { CONTENT_KINDS } from "./vocabulary.ts";

export type DocElement = {
  id: string;
  kind: string;
  parent: string | null;
  text: string;
  role?: string;
  row?: number;
  col?: number;
};

/** Reading order. A table is followed by its cells, which are the citable units. */
export function flatten(doc: ParsedDocument): DocElement[] {
  const out: DocElement[] = [];
  for (const el of doc.elements) {
    if (el.kind === "section") {
      out.push({
        id: el.id,
        kind: el.kind,
        parent: el.parent,
        text: el.heading ?? "",
      });
    } else if (el.kind === "paragraph") {
      out.push({
        id: el.id,
        kind: el.kind,
        parent: el.parent,
        text: el.text,
        ...(el.role ? { role: el.role } : {}),
      });
    } else if (el.kind === "figure") {
      out.push({
        id: el.id,
        kind: el.kind,
        parent: el.parent,
        text: el.caption ?? "",
      });
    } else {
      out.push({ id: el.id, kind: el.kind, parent: el.parent, text: "" });
      for (const cell of el.cells) {
        out.push({
          id: cell.id,
          kind: "cell",
          parent: cell.parent ?? el.id,
          text: cell.text,
          row: cell.row,
          col: cell.col,
        });
      }
    }
  }
  return out;
}

export function elementIds(doc: ParsedDocument): Set<string> {
  return new Set(flatten(doc).map((el) => el.id));
}

export function contentIds(doc: ParsedDocument): string[] {
  return flatten(doc)
    .filter((el) => (CONTENT_KINDS as readonly string[]).includes(el.kind))
    .map((el) => el.id);
}

export function page(
  doc: ParsedDocument,
  from: string | undefined,
  limit: number,
): { elements: DocElement[]; nextFromElementId: string | null } {
  const all = flatten(doc);
  let start = 0;
  if (from) {
    start = all.findIndex((el) => el.id === from);
    if (start < 0) throw new GraphError("UNKNOWN_ELEMENT", from);
  }
  const elements = all.slice(start, start + limit);
  const next = all[start + limit];
  return { elements, nextFromElementId: next?.id ?? null };
}

export function findText(
  doc: ParsedDocument,
  text: string,
): { elementId: string; kind: string; text: string }[] {
  const needle = text.toLowerCase();
  const hits: { elementId: string; kind: string; text: string }[] = [];
  for (const el of flatten(doc)) {
    if (!el.text.toLowerCase().includes(needle)) continue;
    hits.push({ elementId: el.id, kind: el.kind, text: el.text });
    if (hits.length === 40) break;
  }
  return hits;
}
