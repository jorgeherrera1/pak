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

/** One section: its heading path as context, then its own elements as `[id]`-anchored lines. */
type Unit = { header: string; lines: string[] };

function units(doc: ParsedDocument): Unit[] {
  const byId = new Map(doc.elements.map((e) => [e.id, e]));
  const path = (id: string | null): string => {
    const headings: string[] = [];
    for (let el = id && byId.get(id); el; el = el.parent && byId.get(el.parent))
      if (el.kind === "section" && el.heading) headings.unshift(el.heading);
    return headings.join(" > ");
  };
  const out: Unit[] = [{ header: "", lines: [] }];
  for (const el of doc.elements) {
    if (el.kind === "section") {
      out.push({ header: path(el.id), lines: [] });
      continue;
    }
    const { lines } = out.at(-1)!;
    if (el.kind === "table") {
      for (const cells of Map.groupBy(el.cells, (c) => c.row).values())
        lines.push(cells.map((c) => `[${c.id}] ${c.text}`).join(" | "));
    } else {
      const text = el.span
        .map((s) => doc.content.slice(s.offset, s.offset + s.length))
        .join("\n");
      lines.push(`[${el.id}] ${text}`);
    }
  }
  return out.filter((u) => u.lines.length);
}

/**
 * Split one unit into pieces of at most MAX chars, cutting only between lines.
 * Every piece starts with the heading path so context survives the cut.
 */
function pieces({ header, lines }: Unit): string[] {
  const head = header ? `## ${header}` : "";
  const text = (body: string[]) => [head, ...body].filter(Boolean).join("\n");
  const out: string[] = [];
  let body: string[] = [];
  for (const line of lines) {
    if (body.length && text(body).length + 1 + line.length > MAX) {
      out.push(text(body));
      body = [];
    }
    body.push(line);
  }
  return [...out, text(body)];
}

/** Section-aware chunks: whole sections packed greedily under MAX; a section is split only if it alone exceeds it. */
export function chunk(doc: ParsedDocument): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const piece of units(doc).flatMap(pieces)) {
    if (current && current.length + 1 + piece.length > MAX) {
      chunks.push(current);
      current = "";
    }
    current += (current ? "\n" : "") + piece;
  }
  if (current) chunks.push(current);
  return chunks;
}
