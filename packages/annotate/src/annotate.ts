import { createAzure } from "@ai-sdk/azure";
import type { ParsedDocument } from "@dark-factory/parse";
import { Output, generateText } from "ai";
import { hash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { anchors, chunk } from "./chunk.ts";
import type { AnnotateResult } from "./types.ts";
import { rowSchema, validate, type Row } from "./validate.ts";

const PROMPT = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
/** Azure AI Foundry deployment name. */
const MODEL = "gpt-4o";
/** Recorded responses are only valid for the prompt and model that produced them. */
export const cacheKey = hash("sha256", PROMPT + MODEL).slice(0, 12);

const azure = createAzure({
  baseURL: "https://aif-motivus.services.ai.azure.com/openai/v1",
});

/**
 * ParsedDocument in, grounded annotations out. Everything lands in
 * `<outDir>/<sha256>/`: one model call per chunk, its raw response written to
 * `annotate/<cacheKey>/<i>.json` and reused on later runs; the validated
 * result in `annotations.json`.
 */
export async function annotate(
  doc: ParsedDocument,
  outDir: string,
): Promise<AnnotateResult> {
  const dir = join(outDir, doc.source.sha256);
  const responses = join(dir, "annotate", cacheKey);
  await mkdir(responses, { recursive: true });
  // ponytail: all chunks in flight at once; add a concurrency cap if Azure rate limits bite.
  const rows = await Promise.all(
    chunk(doc).map(async (text, i): Promise<Row[]> => {
      const file = join(responses, `${i}.json`);
      if (existsSync(file)) return JSON.parse(await readFile(file, "utf8"));
      const { output } = await generateText({
        model: azure(MODEL),
        output: Output.array({ element: rowSchema }),
        temperature: 0,
        instructions: PROMPT,
        prompt: text,
      });
      await writeFile(file, JSON.stringify(output, null, 2));
      return output;
    }),
  );
  const result = validate(rows.flat(), anchors(doc), doc.content);
  await writeFile(
    join(dir, "annotations.json"),
    JSON.stringify(result, null, 2),
  );
  return result;
}
