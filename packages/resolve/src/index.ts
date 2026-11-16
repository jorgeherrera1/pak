import { readFile } from "node:fs/promises";
import type { AnnotateResult, ParsedDocument } from "@dark-factory/contracts";
import { resolve } from "./resolve.ts";

export { link, resolve, resolveEntities } from "./resolve.ts";

if (import.meta.main) {
  const [parsedPath, annotatePath, outDir] = process.argv.slice(2);
  if (!parsedPath || !annotatePath || !outDir) {
    console.error(
      "usage: node src/index.ts <parsed.json> <annotate.json> <outDir>",
    );
    process.exit(1);
  }
  const doc: ParsedDocument = JSON.parse(await readFile(parsedPath, "utf8"));
  const { classifications }: AnnotateResult = JSON.parse(
    await readFile(annotatePath, "utf8"),
  );
  const { entities, links, warnings } = await resolve(
    doc,
    classifications,
    outDir,
  );
  console.log(
    `${entities.length} entities, ${links.length} links, ${warnings.length} warnings`,
  );
}
