import type { ParsedDocument, Span } from "@dark-factory/parse";

// ponytail: fixed char budget per model call; switch to token counting if a real RFP blows it.
export const MAX = 8000;

/** Every quotable element (paragraph, table cell, figure) and where its text lives in `content`. */
export function anchors(doc: ParsedDocument): Map<string, Span[]> {
  const map = new Map<string, Span[]>();
  for (const el of doc.elements) {
    if (el.kind === "section") continue;
    if (el.kind === "table") {
      for (const c of el.cells) if (c.span.length) map.set(c.id, c.span);
    } else if (el.span.length) map.set(el.id, el.span);
  }
  return map;
}

/** One line per element, in reading order. Sections are context, everything else gets an `[id]` anchor. */
function render(doc: ParsedDocument): string[] {
  const lines: string[] = [];
  for (const el of doc.elements) {
    if (el.kind === "section") {
      if (el.heading) lines.push(`## ${el.heading}`);
    } else if (el.kind === "table") {
      for (const cells of Map.groupBy(el.cells, (c) => c.row).values())
        lines.push(cells.map((c) => `[${c.id}] ${c.text}`).join(" | "));
    } else {
      const text = el.span
        .map((s) => doc.content.slice(s.offset, s.offset + s.length))
        .join("\n");
      lines.push(`[${el.id}] ${text}`);
    }
  }
  return lines;
}

/** Greedily pack rendered lines into chunks of at most MAX chars. */
export function chunk(doc: ParsedDocument): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of render(doc)) {
    if (current && current.length + line.length > MAX) {
      chunks.push(current);
      current = "";
    }
    current += (current ? "\n" : "") + line;
  }
  if (current) chunks.push(current);
  return chunks;
}
