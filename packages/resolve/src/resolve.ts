import { anchors, runModel, type Classification } from "@dark-factory/annotate";
import type { ParsedDocument } from "@dark-factory/parse";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  entitySchema,
  groundEntities,
  groundLinks,
  linkSchema,
  type EntityRow,
  type LinkAnswer,
} from "./ground.ts";
import { linkInputs, resolveInput } from "./inputs.ts";
import { linkPrompt, resolvePrompt } from "./prompts.ts";
import type { Entity, Link, LinkResult, ResolveResult } from "./types.ts";

/** Operation `resolve`: the document in, grounded entities out, with the model's raw rows. */
export async function resolveEntities(
  doc: ParsedDocument,
): Promise<ResolveResult & { rows: EntityRow[] }> {
  const rows = await runModel(resolvePrompt, resolveInput(doc), entitySchema);
  return { rows, ...groundEntities(rows, anchors(doc), doc.content) };
}

/** Operation `link`: classifications and entities in, grounded links out, with the model's raw answers. */
export async function link(
  doc: ParsedDocument,
  classifications: Classification[],
  entities: Entity[],
): Promise<LinkResult & { answers: LinkAnswer[] }> {
  // ponytail: all chunks in flight at once; add a concurrency cap if Azure rate limits bite.
  const answers = await Promise.all(
    linkInputs(doc, classifications, entities).map(async ({ asked, text }) => ({
      asked,
      rows: await runModel(linkPrompt, text, linkSchema),
    })),
  );
  return { answers, ...groundLinks(answers, entities) };
}

/**
 * ParsedDocument and its classifications in, entities and links out: both
 * operations, as a job runs them. Every run calls the model; nothing is
 * reused between runs. Everything lands in `<outDir>/<sha256>/`: the raw
 * responses in `resolve/entities.json` and `resolve/link/<i>.json`, the
 * grounded result in `resolve.json`.
 */
export async function resolve(
  doc: ParsedDocument,
  classifications: Classification[],
  outDir: string,
): Promise<ResolveResult & { links: Link[] }> {
  const dir = join(outDir, doc.source.sha256);
  await mkdir(join(dir, "resolve", "link"), { recursive: true });
  const { rows, entities, possiblySameAs, warnings } =
    await resolveEntities(doc);
  await writeFile(
    join(dir, "resolve", "entities.json"),
    JSON.stringify(rows, null, 2),
  );
  const linked = await link(doc, classifications, entities);
  await Promise.all(
    linked.answers.map(({ rows }, i) =>
      writeFile(
        join(dir, "resolve", "link", `${i}.json`),
        JSON.stringify(rows, null, 2),
      ),
    ),
  );
  const result = {
    entities,
    possiblySameAs,
    links: linked.links,
    warnings: [...warnings, ...linked.warnings],
  };
  await writeFile(join(dir, "resolve.json"), JSON.stringify(result, null, 2));
  return result;
}
