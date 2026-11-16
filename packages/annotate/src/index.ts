import { readFile } from "node:fs/promises";
import type { ParsedDocument } from "@dark-factory/contracts";
import { annotate } from "./annotate.ts";

export { annotate, runAnnotate, runModel } from "./annotate.ts";
export { type ClassificationRow, ground } from "./ground.ts";

if (import.meta.main) {
  const [parsedPath, outDir] = process.argv.slice(2);
  if (!parsedPath || !outDir) {
    console.error("usage: node src/index.ts <parsed.json> <outDir>");
    process.exit(1);
  }
  const doc: ParsedDocument = JSON.parse(await readFile(parsedPath, "utf8"));
  const { classifications, warnings } = await annotate(doc, outDir);
  console.log(
    `${classifications.length} classifications, ${warnings.length} warnings`,
  );
}
