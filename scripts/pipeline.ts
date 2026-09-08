import { run } from "../packages/annotate/src/index.ts";
import { parse } from "../packages/parse/src/index.ts";

const [pdfPath, outDir] = process.argv.slice(2);
if (!pdfPath || !outDir) {
  console.error("usage: node scripts/pipeline.ts <file.pdf> <outDir>");
  process.exit(1);
}
const doc = await parse(pdfPath, outDir);
console.log(
  `parse: ${doc.elements.length} elements, ${doc.warnings.length} warnings`,
);
const { annotations, warnings } = await run(doc, outDir);
console.log(
  `annotate: ${annotations.length} annotations, ${warnings.length} warnings`,
);
