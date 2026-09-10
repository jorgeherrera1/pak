import { hash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { analyze } from "./analyze.ts";
import { toParsedDocument } from "./toParsedDocument.ts";
import type { ParsedDocument } from "./types.ts";

export type * from "./types.ts";
export { toParsedDocument } from "./toParsedDocument.ts";

/**
 * PDF in, ParsedDocument out. Every run calls Azure; nothing is reused between
 * runs. Everything lands in `<outDir>/<sha256 of the pdf>/`: analysis.json and
 * figures/ as the service returned them, parsed.json derived from analysis.json.
 */
export async function parse(
  pdfPath: string,
  outDir: string,
): Promise<ParsedDocument> {
  const pdf = await readFile(pdfPath);
  const sha256 = hash("sha256", pdf);
  const dir = join(outDir, sha256);
  const analysis = await analyze(pdf, dir);
  const doc = toParsedDocument(analysis, sha256);
  await writeFile(join(dir, "parsed.json"), JSON.stringify(doc, null, 2));
  return doc;
}

if (import.meta.main) {
  const [pdfPath, outDir] = process.argv.slice(2);
  if (!pdfPath || !outDir) {
    console.error("usage: node src/index.ts <file.pdf> <outDir>");
    process.exit(1);
  }
  const doc = await parse(pdfPath, outDir);
  console.log(
    `${doc.source.pages} pages, ${doc.elements.length} elements, ${doc.warnings.length} warnings`,
  );
}
