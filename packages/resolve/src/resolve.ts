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
  type LinkRow,
} from "./ground.ts";
import { linkInputs, resolveInput } from "./inputs.ts";
import { linkPrompt, resolvePrompt } from "./prompts.ts";
import type { Link, ResolveResult } from "./types.ts";

/** The whole document in, the model's entity rows out. Calls the model every time. */
export const runResolve = (text: string): Promise<EntityRow[]> =>
  runModel(resolvePrompt, text, entitySchema);

/** One link input in, the model's link rows out. Calls the model every time. */
export const runLink = (text: string): Promise<LinkRow[]> =>
  runModel(linkPrompt, text, linkSchema);

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
