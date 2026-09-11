import type { ParsedDocument } from "@dark-factory/parse";
import { readFile } from "node:fs/promises";
import { annotate } from "./annotate.ts";

export type * from "./types.ts";
export { annotate } from "./annotate.ts";
export { validate } from "./validate.ts";

if (import.meta.main) {
  const [parsedPath, outDir] = process.argv.slice(2);
  if (!parsedPath || !outDir) {
    console.error("usage: node src/index.ts <parsed.json> <outDir>");
    process.exit(1);
  }
  const doc: ParsedDocument = JSON.parse(await readFile(parsedPath, "utf8"));
  const { annotations, warnings } = await annotate(doc, outDir);
  console.log(`${annotations.length} annotations, ${warnings.length} warnings`);
}
