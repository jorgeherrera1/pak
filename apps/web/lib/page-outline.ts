import type { ParsedDocument, Region } from "@dark-factory/parse";

export type Rect = { x: number; y: number; width: number; height: number };
/** One element (or table cell) where it sits on its page, with what to draw inside it. */
export type Box = Rect & {
  id: string;
  marked: boolean;
  text: string;
  /** Largest font size, in page units, at which `text` wraps inside the box. */
  fontSize: number;
  heading: boolean;
  /** A figure's image, relative to the job's artifacts. */
  image?: string;
};
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
 * The font size at which `text` fills `box` without spilling: a character is
 * about 0.55 em wide, lines sit 1.2 em apart, a fifth of the area goes to
 * ragged line ends, and the longest word must fit on one line.
 */
export function fit(text: string, { width, height }: Rect): number {
  if (!text) return 0;
  const longest = Math.max(...text.split(/\s+/).map((w) => w.length));
  return Math.min(
    height / 1.2,
    Math.sqrt((0.8 * width * height) / (0.55 * 1.2 * text.length)),
    width / (0.55 * longest),
  );
}

const median = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** A box and what sets its font size: body text sets the page's size, a title is exempt from it. */
type Draft = { box: Box; body: boolean; title: boolean };

/**
 * Every page a `marked` element sits on, rebuilt from the parse: each
 * paragraph's text, each table cell's text and each figure's image, drawn in
 * the box the parse recorded for it. A table also gets a box of its own, so a
 * marked table is outlined once, not cell by cell. No text is set larger than
 * the page's median body paragraph, except the document's title: a short line
 * in a wide box would otherwise fill it. The parse keeps no page size, so the
 * frame is the boxes' extent plus a small margin, not the sheet.
 */
export function pageOutlines(
  doc: ParsedDocument,
  marked: ReadonlySet<string>,
): Outline[] {
  const drafts = new Map<number, Draft[]>();
  const pages = new Set<number>();
  const add = (
    regions: Region[],
    box: Omit<Box, keyof Rect | "fontSize">,
    { body = false, title = false } = {},
  ) => {
    for (const r of regions) {
      const rect = bounds(r.polygon);
      drafts.set(r.page, [
        ...(drafts.get(r.page) ?? []),
        {
          box: { ...box, ...rect, fontSize: fit(box.text, rect) },
          body,
          title,
        },
      ]);
      if (box.marked) pages.add(r.page);
    }
  };
  const byId = new Map(doc.elements.map((e) => [e.id, e]));
  for (const e of doc.elements) {
    const isMarked = marked.has(e.id);
    switch (e.kind) {
      case "section":
        break;
      case "paragraph": {
        // Text inside a figure is already in its image; draw only its box.
        const inImage = byId.get(e.parent ?? "")?.kind === "figure";
        add(
          e.region,
          {
            id: e.id,
            marked: isMarked,
            text: inImage ? "" : e.text,
            heading: e.role === "title" || e.role === "sectionHeading",
          },
          { body: !inImage && !e.role, title: e.role === "title" },
        );
        break;
      }
      case "table":
        for (const c of e.cells)
          add(c.region, {
            id: c.id,
            marked: false,
            text: c.text,
            heading: c.kind === "columnHeader",
          });
        add(e.region, { id: e.id, marked: isMarked, text: "", heading: false });
        break;
      case "figure":
        add(e.region, {
          id: e.id,
          marked: isMarked,
          text: e.image ? "" : (e.caption ?? ""),
          heading: false,
          ...(e.image && { image: e.image }),
        });
    }
  }
  return [...pages]
    .sort((a, b) => a - b)
    .map((page) => {
      const onPage = drafts.get(page)!;
      const cap =
        median(onPage.filter((d) => d.body).map((d) => d.box.fontSize)) ??
        Infinity;
      const boxes = onPage.map(({ box, title }) => ({
        ...box,
        fontSize: title ? box.fontSize : Math.min(box.fontSize, cap),
      }));
      const x = Math.min(...boxes.map((b) => b.x));
      const y = Math.min(...boxes.map((b) => b.y));
      const width = Math.max(...boxes.map((b) => b.x + b.width)) - x;
      const height = Math.max(...boxes.map((b) => b.y + b.height)) - y;
      const margin = Math.max(width, height) * 0.04;
      return {
        page,
        frame: {
          x: x - margin,
          y: y - margin,
          width: width + 2 * margin,
          height: height + 2 * margin,
        },
        boxes,
      };
    });
}
