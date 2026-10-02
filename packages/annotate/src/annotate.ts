import { createAzure } from "@ai-sdk/azure";
import type { ParsedDocument } from "@dark-factory/parse";
import { Output, generateText } from "ai";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import { anchors, chunk } from "./chunk.ts";
import classify from "./classify.ts";
import mentions from "./mentions.ts";
import type { AnnotateResult } from "./types.ts";
import { classificationSchema, ground, mentionSchema } from "./ground.ts";

/** Two tasks per chunk, each its own prompt and schema; they never share a call. */
const TASKS = {
  classify: { instructions: classify, schema: classificationSchema },
  mentions: { instructions: mentions, schema: mentionSchema },
} as const;
/** Azure AI Foundry deployment name. */
const MODEL = "gpt-4o";

async function run<T>(
  task: { instructions: string; schema: z.ZodType<T> },
  text: string,
): Promise<T[]> {
  // Read per call, not at import: the integration test loads .env after importing this module.
  const baseURL = process.env.AZURE_FOUNDRY_ENDPOINT;
  if (!baseURL) throw new Error("AZURE_FOUNDRY_ENDPOINT is not set");
  const { output } = await generateText({
    model: createAzure({ baseURL })(MODEL),
    output: Output.array({ element: task.schema }),
    temperature: 0,
    instructions: task.instructions,
    prompt: text,
  });
  return output;
}

/** One chunk of document text in, the model's classification rows out. Calls the model every time. */
export const runClassify = (text: string) => run(TASKS.classify, text);
/** One chunk of document text in, the model's mention rows out. Calls the model every time. */
export const runMentions = (text: string) => run(TASKS.mentions, text);

/**
 * ParsedDocument in, grounded classifications and mentions out. Every run
 * calls the model; nothing is reused between runs. Everything lands in
 * `<outDir>/<sha256>/`: two model calls per chunk, raw responses written to
 * `annotate/classify/<i>.json` and `annotate/mentions/<i>.json`; the
 * grounded result in `annotate.json`.
 */
export async function annotate(
  doc: ParsedDocument,
  outDir: string,
): Promise<AnnotateResult> {
  const dir = join(outDir, doc.source.sha256);
  for (const t of Object.keys(TASKS))
    await mkdir(join(dir, "annotate", t), { recursive: true });
  const write = (t: string, i: number, data: unknown) =>
    writeFile(
      join(dir, "annotate", t, `${i}.json`),
      JSON.stringify(data, null, 2),
    );
  // ponytail: all chunks in flight at once; add a concurrency cap if Azure rate limits bite.
  const outputs = await Promise.all(
    chunk(doc).map(async (text, i) => {
      const [classifications, mentions] = await Promise.all([
        runClassify(text),
        runMentions(text),
      ]);
      await Promise.all([
        write("classify", i, classifications),
        write("mentions", i, mentions),
      ]);
      return { classifications, mentions };
    }),
  );
  const result = ground(
    {
      classifications: outputs.flatMap((o) => o.classifications),
      mentions: outputs.flatMap((o) => o.mentions),
    },
    anchors(doc),
    doc.content,
  );
  await writeFile(join(dir, "annotate.json"), JSON.stringify(result, null, 2));
  return result;
}
