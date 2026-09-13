import { createAzure } from "@ai-sdk/azure";
import type { ParsedDocument } from "@dark-factory/parse";
import { Output, generateText } from "ai";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { anchors, chunk } from "./chunk.ts";
import type { AnnotateResult } from "./types.ts";
import { outputSchema, validate, type ModelOutput } from "./validate.ts";

const PROMPT = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
/** Azure AI Foundry deployment name. */
const MODEL = "gpt-4o";

const azure = createAzure({
  baseURL: "https://aif-motivus.services.ai.azure.com/openai/v1",
});

/**
 * ParsedDocument in, grounded annotations out. Every run calls the model;
 * nothing is reused between runs. Everything lands in `<outDir>/<sha256>/`:
 * one model call per chunk, its raw response written to `annotate/<i>.json`;
 * the validated result in `annotations.json`.
 */
export async function annotate(
  doc: ParsedDocument,
  outDir: string,
): Promise<AnnotateResult> {
  const dir = join(outDir, doc.source.sha256);
  const responses = join(dir, "annotate");
  await mkdir(responses, { recursive: true });
  // ponytail: all chunks in flight at once; add a concurrency cap if Azure rate limits bite.
  const outputs = await Promise.all(
    chunk(doc).map(async (text, i): Promise<ModelOutput> => {
      const { output } = await generateText({
        model: azure(MODEL),
        output: Output.object({ schema: outputSchema }),
        temperature: 0,
        instructions: PROMPT,
        prompt: text,
      });
      await writeFile(
        join(responses, `${i}.json`),
        JSON.stringify(output, null, 2),
      );
      return output;
    }),
  );
  const result = validate(
    {
      annotations: outputs.flatMap((o) => o.annotations),
      mentions: outputs.flatMap((o) => o.mentions),
    },
    anchors(doc),
    doc.content,
  );
  await writeFile(
    join(dir, "annotations.json"),
    JSON.stringify(result, null, 2),
  );
  return result;
}
