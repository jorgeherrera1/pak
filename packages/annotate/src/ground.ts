import {
  type AnnotateResult,
  CATEGORIES,
  find,
  fold,
  type Span,
  TYPES,
} from "@dark-factory/contracts";
import { z } from "zod";

/** What the model returns. Quotes, never offsets. */
export const classificationSchema = z.object({
  elementId: z.string(),
  quote: z.string(),
  type: z.enum(TYPES),
  category: z.enum(CATEGORIES).nullable(),
});
export type ClassificationRow = z.infer<typeof classificationSchema>;

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
