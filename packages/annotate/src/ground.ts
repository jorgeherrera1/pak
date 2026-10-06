import type { Span } from "@dark-factory/parse";
import { z } from "zod";
import { CATEGORIES, TYPES, type AnnotateResult } from "./types.ts";

/** What the model returns. Quotes, never offsets. */
export const classificationSchema = z.object({
  elementId: z.string(),
  quote: z.string(),
  type: z.enum(TYPES),
  category: z.enum(CATEGORIES).nullable(),
});
export type ClassificationRow = z.infer<typeof classificationSchema>;

const wordChar = /[\p{L}\p{N}]/u;
/** How Azure Document Intelligence writes a checkbox-like glyph into the text. */
const MARK = /:(?:un)?selected:/y;
const PUNCT: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
};

/**
 * `text` folded for comparison: lower case, whitespace runs and selection
 * marks as one space, typographic quotes and dashes as ASCII. `at[i]` is the
 * offset in `content` of the source character behind `folded[i]`.
 */
export function fold(text: string, base = 0): { folded: string; at: number[] } {
  let folded = "";
  const at: number[] = [];
  for (let i = 0; i < text.length;) {
    MARK.lastIndex = i;
    const mark = MARK.exec(text)?.[0];
    const ch = text[i]!;
    const out = mark || /\s/.test(ch) ? " " : (PUNCT[ch] ?? ch).toLowerCase();
    if (!(out === " " && folded.endsWith(" "))) {
      folded += out;
      for (let k = 0; k < out.length; k++) at.push(base + i);
    }
    i += mark ? mark.length : 1;
  }
  return { folded, at };
}

/** First occurrence of `needle` in `hay[from, end)` that sits on word boundaries, or -1. */
export function find(
  hay: string,
  needle: string,
  from = 0,
  end = hay.length,
): number {
  for (
    let i = hay.indexOf(needle, from);
    i >= 0 && i + needle.length <= end;
    i = hay.indexOf(needle, i + 1)
  ) {
    const before = hay[i - 1] ?? "";
    const after = hay[i + needle.length] ?? "";
    if (!wordChar.test(before) && !wordChar.test(after)) return i;
  }
  return -1;
}

/**
 * Model rows in, grounded classifications out. Each quote is aligned to its
 * element's text: verbatim first, then folded, and when it cannot be located
 * the classification covers the whole element and a warning says so. A row is
 * dropped only when its element does not exist. The stored text is always the
 * source's, never the model's. This is the step boundary AI output must cross.
 */
export function ground(
  rows: ClassificationRow[],
  anchors: Map<string, Span[]>,
  content: string,
): AnnotateResult {
  const result: AnnotateResult = { classifications: [], warnings: [] };
  const seen = new Set<string>();

  const locate = (spans: Span[], quote: string): Span | undefined => {
    if (!quote.trim()) return undefined;
    for (const s of spans) {
      const i = find(content, quote, s.offset, s.offset + s.length);
      if (i >= 0) return { offset: i, length: quote.length };
    }
    const needle = fold(quote).folded.trim();
    for (const s of spans) {
      const { folded, at } = fold(
        content.slice(s.offset, s.offset + s.length),
        s.offset,
      );
      const i = find(folded, needle);
      if (i < 0) continue;
      const offset = at[i]!;
      return { offset, length: at[i + needle.length - 1]! + 1 - offset };
    }
  };

  for (const row of rows) {
    const spans = anchors.get(row.elementId);
    if (!spans) {
      result.warnings.push(`${row.elementId}: unknown element`);
      continue;
    }
    let span = locate(spans, row.quote);
    if (!span) {
      // ponytail: an element with several spans is labeled on its first; widen Classification.span to Span[] if that loses text that matters.
      span = spans[0]!;
      result.warnings.push(
        `${row.elementId}: quote not located, labeled the whole element: ${JSON.stringify(row.quote)}`,
      );
    }
    const key = `${row.elementId}|${row.type}|${span.offset}|${span.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.classifications.push({
      id: `a${result.classifications.length + 1}`,
      type: row.type,
      elementId: row.elementId,
      span,
      text: content.slice(span.offset, span.offset + span.length),
      ...(row.category && { category: row.category }),
    });
  }
  return result;
}
