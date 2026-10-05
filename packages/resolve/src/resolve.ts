import { createAzure } from "@ai-sdk/azure";
import { anchors, type Classification } from "@dark-factory/annotate";
import type { ParsedDocument } from "@dark-factory/parse";
import { Output, generateText } from "ai";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import {
  entitySchema,
  groundEntities,
  groundLinks,
  linkSchema,
  type EntityRow,
  type LinkRow,
} from "./ground.ts";
import { linkInputs, resolveInput } from "./inputs.ts";
import { linkPrompt, resolvePrompt } from "./prompts.ts";
import type { Link, ResolveResult } from "./types.ts";

/** Azure AI Foundry deployment name. */
const MODEL = "gpt-4o";

async function run<T>(
  instructions: string,
  text: string,
  element: z.ZodType<T>,
): Promise<T[]> {
  // Read per call, not at import: the integration test loads .env after importing this module.
  const baseURL = process.env.AZURE_FOUNDRY_ENDPOINT;
  if (!baseURL) throw new Error("AZURE_FOUNDRY_ENDPOINT is not set");
  const { output } = await generateText({
    model: createAzure({ baseURL })(MODEL),
    output: Output.array({ element }),
    temperature: 0,
    instructions,
    prompt: text,
  });
  return output;
}

/** The whole document in, the model's entity rows out. Calls the model every time. */
export const runResolve = (text: string): Promise<EntityRow[]> =>
  run(resolvePrompt, text, entitySchema);

/** One link input in, the model's link rows out. Calls the model every time. */
export const runLink = (text: string): Promise<LinkRow[]> =>
  run(linkPrompt, text, linkSchema);

/**
 * ParsedDocument and its classifications in, entities and links out. Every
 * run calls the model; nothing is reused between runs. Everything lands in
 * `<outDir>/<sha256>/`: the raw responses in `resolve/entities.json` and
 * `resolve/link/<i>.json`, the grounded result in `resolve.json`.
 */
export async function resolve(
  doc: ParsedDocument,
  classifications: Classification[],
  outDir: string,
): Promise<ResolveResult & { links: Link[] }> {
  const dir = join(outDir, doc.source.sha256);
  await mkdir(join(dir, "resolve", "link"), { recursive: true });
  const rows = await runResolve(resolveInput(doc));
  await writeFile(
    join(dir, "resolve", "entities.json"),
    JSON.stringify(rows, null, 2),
  );
  const { entities, possiblySameAs, warnings } = groundEntities(
    rows,
    anchors(doc),
    doc.content,
  );
  // ponytail: all chunks in flight at once; add a concurrency cap if Azure rate limits bite.
  const answers = await Promise.all(
    linkInputs(doc, classifications, entities).map(
      async ({ asked, text }, i) => {
        const rows = await runLink(text);
        await writeFile(
          join(dir, "resolve", "link", `${i}.json`),
          JSON.stringify(rows, null, 2),
        );
        return { asked, rows };
      },
    ),
  );
  const linked = groundLinks(answers, entities);
  const result = {
    entities,
    possiblySameAs,
    links: linked.links,
    warnings: [...warnings, ...linked.warnings],
  };
  await writeFile(join(dir, "resolve.json"), JSON.stringify(result, null, 2));
  return result;
}
