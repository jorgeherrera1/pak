import { createAzure } from "@ai-sdk/azure";
import type { ParsedDocument, Span } from "@dark-factory/parse";
import { generateObject } from "ai";
import { hash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { anchors, chunk } from "./chunk.ts";
import { CATEGORIES, TYPES, type AnnotateResult } from "./types.ts";

/** What the model returns, one row per finding. Quotes, never offsets. */
export const rowSchema = z.object({
  elementId: z.string(),
  quote: z.string(),
  type: z.enum(TYPES),
  category: z.enum(CATEGORIES).optional(),
});
export type Row = z.infer<typeof rowSchema>;

export const PROMPT = readFileSync(
  new URL("./prompt.md", import.meta.url),
  "utf8",
);
/** Azure AI Foundry deployment name. */
export const MODEL = process.env.ANNOTATE_MODEL ?? "gpt-4o";
/** Recorded responses are only valid for the prompt and model that produced them. */
export const cacheKey = () => hash("sha256", PROMPT + MODEL).slice(0, 12);

const azure = createAzure({
  baseURL:
    process.env.AZURE_OPENAI_BASE_URL ??
    "https://aif-motivus.services.ai.azure.com/openai/v1",
});

/**
 * ParsedDocument in, grounded annotations out. One model call per chunk; the
 * raw response is written to `<responsesDir>/<i>.json` before validation and
 * replayed from there on later runs, so tests never touch the network.
 */
export async function annotate(
  doc: ParsedDocument,
  responsesDir: string,
): Promise<AnnotateResult> {
  await mkdir(responsesDir, { recursive: true });
  const rows: Row[] = [];
  for (const [i, text] of chunk(doc).entries()) {
    const file = join(responsesDir, `${i}.json`);
    if (!existsSync(file)) {
      const { object } = await generateObject({
        model: azure(MODEL),
        output: "array",
        schema: rowSchema,
        system: PROMPT,
        prompt: text,
      });
      await writeFile(file, JSON.stringify(object, null, 2));
    }
    rows.push(...JSON.parse(await readFile(file, "utf8")));
  }
  return validate(rows, anchors(doc), doc.content);
}

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
    const hit = spans
      .map((s) => ({
        s,
        i: content.slice(s.offset, s.offset + s.length).indexOf(row.quote),
      }))
      .find(({ i }) => i >= 0);
    if (!hit) {
      result.warnings.push(
        `${row.elementId}: quote not found: ${JSON.stringify(row.quote)}`,
      );
      continue;
    }
    result.annotations.push({
      id: `a${result.annotations.length + 1}`,
      type: row.type,
      elementId: row.elementId,
      span: { offset: hit.s.offset + hit.i, length: row.quote.length },
      text: row.quote,
      ...(row.category && { category: row.category }),
    });
  }
  return result;
}
