import type { AnalyzeResultOutput } from "@azure-rest/ai-document-intelligence";
import { hash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { analyze, isCurrent } from "./analyze.ts";
import { toParsedDocument } from "./toParsedDocument.ts";
import type { ParsedDocument } from "./types.ts";

export type * from "./types.ts";
export { toParsedDocument } from "./toParsedDocument.ts";

/**
 * PDF in, ParsedDocument out. Everything lands in `<outDir>/<sha256 of the pdf>/`:
 * analysis.json and figures/ are reused while they match the current request
 * (model, API version, string index type) and re-fetched when they don't;
 * parsed.json is re-derived from analysis.json on every run.
 */
export async function parse(
  pdfPath: string,
  outDir: string,
): Promise<ParsedDocument> {
  const pdf = await readFile(pdfPath);
  const sha256 = hash("sha256", pdf);
  const dir = join(outDir, sha256);
  const file = join(dir, "analysis.json");
  const cached: AnalyzeResultOutput | undefined = existsSync(file)
    ? JSON.parse(await readFile(file, "utf8"))
    : undefined;
  const analysis =
    cached && isCurrent(cached) ? cached : await analyze(pdf, dir);
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
