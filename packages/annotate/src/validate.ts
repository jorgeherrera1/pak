import type { Span } from "@dark-factory/parse";
import { z } from "zod";
import { CATEGORIES, TYPES, type AnnotateResult } from "./types.ts";

/** What the model returns, one row per finding. Quotes, never offsets. */
export const rowSchema = z.object({
  elementId: z.string(),
  quote: z.string(),
  type: z.enum(TYPES),
  category: z.enum(CATEGORIES).nullable(),
});
export type Row = z.infer<typeof rowSchema>;

/**
 * Model rows in, grounded annotations out. A row survives only if its element
 * exists and its quote is found verbatim inside that element's text; everything
 * else becomes a warning. This is the step boundary AI output must cross.
 */
export function validate(
  rows: Row[],
  anchors: Map<string, Span[]>,
  content: string,
): AnnotateResult {
  const result: AnnotateResult = { annotations: [], warnings: [] };
  for (const row of rows) {
    const spans = anchors.get(row.elementId);
    if (!spans) {
      result.warnings.push(`${row.elementId}: unknown element`);
      continue;
    }
    let offset = -1;
    for (const s of spans) {
      const i = content.indexOf(row.quote, s.offset);
      if (i >= 0 && i + row.quote.length <= s.offset + s.length) {
        offset = i;
        break;
      }
    }
    if (offset < 0) {
      result.warnings.push(
        `${row.elementId}: quote not found: ${JSON.stringify(row.quote)}`,
      );
      continue;
    }
    result.annotations.push({
      id: `a${result.annotations.length + 1}`,
      type: row.type,
      elementId: row.elementId,
      span: { offset, length: row.quote.length },
      text: row.quote,
      ...(row.category && { category: row.category }),
    });
  }
  return result;
}
