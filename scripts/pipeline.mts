import { annotate } from "../packages/annotate/src/index.ts";
import { parse } from "../packages/parse/src/index.ts";

const [pdfPath, outDir] = process.argv.slice(2);
if (!pdfPath || !outDir) {
  console.error("usage: node scripts/pipeline.mts <file.pdf> <outDir>");
  process.exit(1);
}
const doc = await parse(pdfPath, outDir);
console.log(
  `parse: ${doc.elements.length} elements, ${doc.warnings.length} warnings`,
);
const { classifications, mentions, warnings } = await annotate(doc, outDir);
console.log(
  `annotate: ${classifications.length} classifications, ${mentions.length} mentions, ${warnings.length} warnings`,
);
