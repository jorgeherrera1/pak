import { hash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ParsedDocument } from "@dark-factory/contracts";
import { analyze } from "./analyze.ts";
import { toParsedDocument } from "./toParsedDocument.ts";

export { type Analysis, analyze } from "./analyze.ts";
export { toParsedDocument } from "./toParsedDocument.ts";

/**
 * PDF in, ParsedDocument out. Every run calls Azure; nothing is reused between
 * runs. Everything lands in `<outDir>/<sha256 of the pdf>/`: figures/ first,
 * then analysis.json, then parsed.json, so a half-finished run never looks complete.
 */
export async function parse(
  pdfPath: string,
  outDir: string,
): Promise<ParsedDocument> {
  const pdf = await readFile(pdfPath);
  const sha256 = hash("sha256", pdf);
  const dir = join(outDir, sha256);
  const { result, figures } = await analyze(pdf);
  await mkdir(join(dir, "figures"), { recursive: true });
  for (const { id, png } of figures)
    await writeFile(join(dir, "figures", `${id}.png`), png);
  await writeFile(join(dir, "analysis.json"), JSON.stringify(result, null, 2));
  const doc = toParsedDocument(result, sha256);
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
