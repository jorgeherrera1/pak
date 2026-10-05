import { createAzure } from "@ai-sdk/azure";
import type { ParsedDocument } from "@dark-factory/parse";
import { Output, generateText } from "ai";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { anchors, chunk } from "./chunk.ts";
import {
  classificationSchema,
  ground,
  type ClassificationRow,
} from "./ground.ts";
import prompt from "./prompt.ts";
import type { AnnotateResult } from "./types.ts";

/** Azure AI Foundry deployment name. */
const MODEL = "gpt-4o";

/** One chunk of document text in, the model's rows out. Calls the model every time. */
export async function runAnnotate(text: string): Promise<ClassificationRow[]> {
  // Read per call, not at import: the integration test loads .env after importing this module.
  const baseURL = process.env.AZURE_FOUNDRY_ENDPOINT;
  if (!baseURL) throw new Error("AZURE_FOUNDRY_ENDPOINT is not set");
  const { output } = await generateText({
    model: createAzure({ baseURL })(MODEL),
    output: Output.array({ element: classificationSchema }),
    temperature: 0,
    instructions: prompt,
    prompt: text,
  });
  return output;
}

/**
 * ParsedDocument in, grounded classifications out. Every run calls the model;
 * nothing is reused between runs. Everything lands in `<outDir>/<sha256>/`:
 * one model call per chunk, raw responses in `annotate/<i>.json`, the
 * grounded result in `annotate.json`.
 */
export async function annotate(
  doc: ParsedDocument,
  outDir: string,
): Promise<AnnotateResult> {
  const dir = join(outDir, doc.source.sha256);
  await mkdir(join(dir, "annotate"), { recursive: true });
  // ponytail: all chunks in flight at once; add a concurrency cap if Azure rate limits bite.
  const outputs = await Promise.all(
    chunk(doc).map(async (text, i) => {
      const rows = await runAnnotate(text);
      await writeFile(
        join(dir, "annotate", `${i}.json`),
        JSON.stringify(rows, null, 2),
      );
      return rows;
    }),
  );
  const result = ground(outputs.flat(), anchors(doc), doc.content);
  await writeFile(join(dir, "annotate.json"), JSON.stringify(result, null, 2));
  return result;
}
