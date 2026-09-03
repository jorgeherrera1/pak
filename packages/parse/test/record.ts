/**
 * Re-records the test fixtures from live Azure. The only way analysis.json and
 * parsed.json change; review the diff.  Run: npm run test:record -w @dark-factory/parse
 */
import { hash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { analyze } from "../src/analyze.ts";
import { toParsedDocument } from "../src/toParsedDocument.ts";

const dir = fileURLToPath(new URL("./fixtures/", import.meta.url));
const pdf = await readFile(`${dir}Competency-Self-Assessment-PRD.pdf`);
const analysis = await analyze(pdf, dir);
const doc = toParsedDocument(analysis, hash("sha256", pdf));
await writeFile(`${dir}parsed.json`, JSON.stringify(doc, null, 2));
console.log(
  `${doc.source.pages} pages, ${doc.elements.length} elements, ${doc.warnings.length} warnings`,
);
