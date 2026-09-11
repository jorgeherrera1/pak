/**
 * Live run against Azure AI Foundry, plus the eval: precision and recall per
 * type against `fixtures/expected.json`, which is written by a human, never
 * generated. Needs AZURE_API_KEY in the repo-root .env.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { annotate } from "../src/annotate.ts";
import type { Annotation, AnnotationType } from "../src/types.ts";
import { doc } from "./doc.ts";

const env = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);

const out = fileURLToPath(new URL("./out/", import.meta.url));
const expectedFile = new URL("./fixtures/expected.json", import.meta.url);

type Expected = { elementId: string; type: AnnotationType }[];

/** Exact (elementId, type) match per type. */
function score(annotations: Annotation[], expected: Expected) {
  const key = (x: { elementId: string; type: AnnotationType }) =>
    `${x.elementId}|${x.type}`;
  const got = new Set(annotations.map(key));
  const want = new Set(expected.map(key));
  const table: Record<
    string,
    { tp: number; fp: number; fn: number; precision: number; recall: number }
  > = {};
  for (const type of new Set(
    [...annotations, ...expected].map((x) => x.type),
  )) {
    const g = [...got].filter((k) => k.endsWith(`|${type}`));
    const w = [...want].filter((k) => k.endsWith(`|${type}`));
    const tp = g.filter((k) => want.has(k)).length;
    const fp = g.length - tp;
    const fn = w.length - tp;
    table[type] = {
      tp,
      fp,
      fn,
      precision: tp / (tp + fp || 1),
      recall: tp / (tp + fn || 1),
    };
  }
  return table;
}

// Raised by a human after reading the first run. 0 means "record, don't gate yet".
const FLOOR = 0;

test("live annotate and eval", { timeout: 300_000 }, async () => {
  rmSync(out, { recursive: true, force: true });
  const { annotations, warnings } = await annotate(doc, out);
  console.log(`${annotations.length} annotations, ${warnings.length} warnings`);
  for (const w of warnings) console.log(`  ${w}`);
  if (!existsSync(expectedFile)) {
    console.log("fixtures/expected.json missing: recorded, not scored");
    return;
  }
  const table = score(
    annotations,
    JSON.parse(readFileSync(expectedFile, "utf8")),
  );
  console.table(table);
  for (const [type, { precision, recall }] of Object.entries(table)) {
    expect(precision, `${type} precision`).toBeGreaterThanOrEqual(FLOOR);
    expect(recall, `${type} recall`).toBeGreaterThanOrEqual(FLOOR);
  }
});
