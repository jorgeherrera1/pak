/**
 * Live run against Azure AI Foundry, plus the eval: precision and recall per
 * classification type against `fixtures/expected.json`, which is written by a
 * human, never generated. Needs AZURE_FOUNDRY_ENDPOINT and AZURE_API_KEY in
 * the repo-root .env.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { annotate } from "../src/annotate.ts";
import type { ClassificationType } from "../src/types.ts";
import { doc } from "./doc.ts";

const env = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);

const out = fileURLToPath(new URL("./out/", import.meta.url));
const expectedFile = new URL("./fixtures/expected.json", import.meta.url);

type Expected = {
  classifications: { elementId: string; type: ClassificationType }[];
};
type Scored = { elementId: string; type: ClassificationType };

/** Exact match on element and type, scored per type. */
function score(got: Scored[], want: Scored[]) {
  const key = (x: Scored) => `${x.elementId}|${x.type}`;
  const g = new Set(got.map(key));
  const w = new Set(want.map(key));
  const table: Record<
    string,
    { tp: number; fp: number; fn: number; precision: number; recall: number }
  > = {};
  for (const [type, items] of Map.groupBy([...got, ...want], (x) => x.type)) {
    const keys = new Set(items.map(key));
    const tp = [...keys].filter((k) => g.has(k) && w.has(k)).length;
    const fp = [...keys].filter((k) => g.has(k) && !w.has(k)).length;
    const fn = [...keys].filter((k) => !g.has(k) && w.has(k)).length;
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
  const { classifications, warnings } = await annotate(doc, out);
  const whole = warnings.filter((w) =>
    w.includes(": quote not located, labeled the whole element: "),
  ).length;
  const dropped = warnings.filter((w) =>
    w.endsWith(": unknown element"),
  ).length;
  console.log(
    `${classifications.length} classifications: ${classifications.length - whole} located, ${whole} whole-element; ${dropped} rows dropped`,
  );
  for (const w of warnings) console.log(`  ${w}`);
  if (!existsSync(expectedFile)) {
    console.log("fixtures/expected.json missing: recorded, not scored");
    return;
  }
  const expected: Expected = JSON.parse(readFileSync(expectedFile, "utf8"));
  const table = score(classifications, expected.classifications);
  console.table(table);
  for (const [type, { precision, recall }] of Object.entries(table)) {
    expect(precision, `${type} precision`).toBeGreaterThanOrEqual(FLOOR);
    expect(recall, `${type} recall`).toBeGreaterThanOrEqual(FLOOR);
  }
});
