import type { AnalyzeResultOutput } from "@azure-rest/ai-document-intelligence";
import { hash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { analyze } from "./analyze.ts";
import { normalize } from "./normalize.ts";
import type { ParsedDocument } from "./types.ts";

export type * from "./types.ts";
export { normalize } from "./normalize.ts";

/**
 * PDF in, ParsedDocument out. Everything lands in `<outDir>/<sha256 of the pdf>/`:
 * analysis.json and figures/ are written once and never modified; parsed.json is
 * re-derived from analysis.json on every run.
 */
export async function parse(
  pdfPath: string,
  outDir: string,
): Promise<ParsedDocument> {
  const pdf = await readFile(pdfPath);
  const sha256 = hash("sha256", pdf);
  const dir = join(outDir, sha256);
  const cached = join(dir, "analysis.json");
  const analysis: AnalyzeResultOutput = existsSync(cached)
    ? JSON.parse(await readFile(cached, "utf8"))
    : await analyze(pdf, dir);
  const doc = normalize(analysis, sha256);
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
