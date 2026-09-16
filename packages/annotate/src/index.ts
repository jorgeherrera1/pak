import type { ParsedDocument } from "@dark-factory/parse";
import { readFile } from "node:fs/promises";
import { annotate } from "./annotate.ts";

export type * from "./types.ts";
export { annotate, runClassify, runMentions } from "./annotate.ts";
export { anchors, chunk } from "./chunk.ts";
export { validate, type ModelOutput } from "./validate.ts";

if (import.meta.main) {
  const [parsedPath, outDir] = process.argv.slice(2);
  if (!parsedPath || !outDir) {
    console.error("usage: node src/index.ts <parsed.json> <outDir>");
    process.exit(1);
  }
  const doc: ParsedDocument = JSON.parse(await readFile(parsedPath, "utf8"));
  const { classifications, mentions, warnings } = await annotate(doc, outDir);
  console.log(
    `${classifications.length} classifications, ${mentions.length} mentions, ${warnings.length} warnings`,
  );
}
