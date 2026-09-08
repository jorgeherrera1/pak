import type { ParsedDocument } from "@dark-factory/parse";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { annotate, cacheKey } from "./annotate.ts";
import type { AnnotateResult } from "./types.ts";

export type * from "./types.ts";
export { annotate, validate } from "./annotate.ts";
export { anchors, chunk } from "./chunk.ts";

/**
 * Annotate a parsed document and write the result next to it: raw model
 * responses under `<outDir>/<sha256>/annotate/<cacheKey>/responses/` and the
 * validated annotations in `<outDir>/<sha256>/annotations.json`.
 */
export async function run(
  doc: ParsedDocument,
  outDir: string,
): Promise<AnnotateResult> {
  const dir = join(outDir, doc.source.sha256);
  const result = await annotate(
    doc,
    join(dir, "annotate", cacheKey(), "responses"),
  );
  await writeFile(
    join(dir, "annotations.json"),
    JSON.stringify(result, null, 2),
  );
  return result;
}

if (import.meta.main) {
  const [parsedPath, outDir] = process.argv.slice(2);
  if (!parsedPath || !outDir) {
    console.error("usage: node src/index.ts <parsed.json> <outDir>");
    process.exit(1);
  }
  const doc: ParsedDocument = JSON.parse(await readFile(parsedPath, "utf8"));
  const { annotations, warnings } = await run(doc, outDir);
  console.log(`${annotations.length} annotations, ${warnings.length} warnings`);
}
