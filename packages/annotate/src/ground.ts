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

export const mentionSchema = z.object({
  elementId: z.string(),
  quote: z.string(),
  name: z.string(),
});
export const outputSchema = z.object({
  classifications: z.array(classificationSchema),
  mentions: z.array(mentionSchema),
});
export type ModelOutput = z.infer<typeof outputSchema>;

const wordChar = /[\p{L}\p{N}]/u;
/**
 * Model output in, grounded classifications and mentions out. A row survives only
 * if its element exists and its quote is found verbatim, on word boundaries,
 * inside that element's text; everything else becomes a warning. This is the
 * step boundary AI output must cross.
 */
export function ground(
  { classifications, mentions }: ModelOutput,
  anchors: Map<string, Span[]>,
  content: string,
): AnnotateResult {
  const result: AnnotateResult = {
    classifications: [],
    mentions: [],
    warnings: [],
  };

  /** Offset of `quote` inside element `elementId`, or -1 after pushing a warning. */
  const locate = (elementId: string, quote: string): number => {
    const spans = anchors.get(elementId);
    if (!spans) {
      result.warnings.push(`${elementId}: unknown element`);
      return -1;
    }
    for (const s of spans) {
      const end = s.offset + s.length;
      for (
        let i = content.indexOf(quote, s.offset);
        i >= 0 && i + quote.length <= end;
        i = content.indexOf(quote, i + 1)
      ) {
        const before = content[i - 1] ?? "";
        const after = content[i + quote.length] ?? "";
        if (!wordChar.test(before) && !wordChar.test(after)) return i;
      }
    }
    result.warnings.push(
      `${elementId}: quote not found: ${JSON.stringify(quote)}`,
    );
    return -1;
  };

  for (const row of classifications) {
    const offset = locate(row.elementId, row.quote);
    if (offset < 0) continue;
    result.classifications.push({
      id: `a${result.classifications.length + 1}`,
      type: row.type,
      elementId: row.elementId,
      span: { offset, length: row.quote.length },
      text: row.quote,
      ...(row.category && { category: row.category }),
    });
  }
  for (const m of mentions) {
    const offset = locate(m.elementId, m.quote);
    if (offset < 0) continue;
    result.mentions.push({
      id: `m${result.mentions.length + 1}`,
      elementId: m.elementId,
      span: { offset, length: m.quote.length },
      text: m.quote,
      name: m.name.trim() || m.quote,
    });
  }
  return result;
}
