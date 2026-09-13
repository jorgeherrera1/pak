import type { Span } from "@dark-factory/parse";
import { z } from "zod";
import { CATEGORIES, NOUN_TYPES, TYPES, type AnnotateResult } from "./types.ts";

/** What the model returns. Quotes, never offsets. */
export const rowSchema = z.object({
  elementId: z.string(),
  quote: z.string(),
  type: z.enum(TYPES),
  category: z.enum(CATEGORIES).nullable(),
});
export type Row = z.infer<typeof rowSchema>;

export const mentionSchema = z.object({
  elementId: z.string(),
  quote: z.string(),
  name: z.string(),
  kind: z.enum(NOUN_TYPES),
});
export const outputSchema = z.object({
  annotations: z.array(rowSchema),
  mentions: z.array(mentionSchema),
});
export type ModelOutput = z.infer<typeof outputSchema>;

const wordChar = /[\p{L}\p{N}]/u;

/**
 * Model output in, grounded annotations and mentions out. A row survives only
 * if its element exists and its quote is found verbatim, on word boundaries,
 * inside that element's text; everything else becomes a warning. This is the
 * step boundary AI output must cross.
 */
export function validate(
  { annotations, mentions }: ModelOutput,
  anchors: Map<string, Span[]>,
  content: string,
): AnnotateResult {
  const result: AnnotateResult = {
    annotations: [],
    mentions: [],
    warnings: [],
  };
  const seen = new Set<string>();

  /** Offset of `quote` inside element `elementId`, or -1 after pushing a warning. */
  const ground = (elementId: string, quote: string, key: string): number => {
    const spans = anchors.get(elementId);
    if (!spans) {
      result.warnings.push(`${elementId}: unknown element`);
      return -1;
    }
    if (seen.has(`${elementId}\0${quote}\0${key}`)) {
      result.warnings.push(
        `${elementId}: duplicate ${key} ${JSON.stringify(quote)}`,
      );
      return -1;
    }
    seen.add(`${elementId}\0${quote}\0${key}`);
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

  for (const row of annotations) {
    const offset = ground(row.elementId, row.quote, row.type);
    if (offset < 0) continue;
    result.annotations.push({
      id: `a${result.annotations.length + 1}`,
      type: row.type,
      elementId: row.elementId,
      span: { offset, length: row.quote.length },
      text: row.quote,
      ...(row.category && { category: row.category }),
    });
  }
  for (const m of mentions) {
    const offset = ground(m.elementId, m.quote, m.kind);
    if (offset < 0) continue;
    result.mentions.push({
      id: `m${result.mentions.length + 1}`,
      elementId: m.elementId,
      span: { offset, length: m.quote.length },
      text: m.quote,
      name: m.name.trim() || m.quote,
      kind: m.kind,
    });
  }
  return result;
}
