import type { ParsedDocument } from "@dark-factory/parse";

export type Rect = { x: number; y: number; width: number; height: number };
export type Box = Rect & { id: string; marked: boolean };
export type Outline = { page: number; frame: Rect; boxes: Box[] };

/** The axis-aligned box around a region's polygon. */
export const bounds = (polygon: number[]): Rect => {
  const xs = polygon.filter((_, i) => i % 2 === 0);
  const ys = polygon.filter((_, i) => i % 2 === 1);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

/**
 * Every page a `marked` element sits on, drawn as the box of each paragraph,
 * table and figure on that page. The parse keeps no page size, so the frame
 * is those boxes' extent plus a small margin, not the sheet.
 */
export function pageOutlines(
  doc: ParsedDocument,
  marked: ReadonlySet<string>,
): Outline[] {
  const boxes = new Map<number, Box[]>();
  const pages = new Set<number>();
  for (const e of doc.elements) {
    if (e.kind === "section") continue;
    for (const r of e.region) {
      const box = { id: e.id, marked: marked.has(e.id), ...bounds(r.polygon) };
      boxes.set(r.page, [...(boxes.get(r.page) ?? []), box]);
      if (box.marked) pages.add(r.page);
    }
  }
  return [...pages]
    .sort((a, b) => a - b)
    .map((page) => {
      const onPage = boxes.get(page)!;
      const x = Math.min(...onPage.map((b) => b.x));
      const y = Math.min(...onPage.map((b) => b.y));
      const width = Math.max(...onPage.map((b) => b.x + b.width)) - x;
      const height = Math.max(...onPage.map((b) => b.y + b.height)) - y;
      const margin = Math.max(width, height) * 0.04;
      return {
        page,
        frame: {
          x: x - margin,
          y: y - margin,
          width: width + 2 * margin,
          height: height + 2 * margin,
        },
        boxes: onPage,
      };
    });
}
