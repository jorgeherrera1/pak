import type { AnalyzeResultOutput } from "@azure-rest/ai-document-intelligence";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { parse } from "../src/index.ts";

// Calls the real service. Needs AZURE_DI_ENDPOINT and AZURE_DI_KEY, from the root .env or the environment.
const env = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);

const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));
// Live output lands here (gitignored) so it can be inspected and diffed against fixtures/.
// Wiped first: parse() would otherwise reuse the previous run's analysis.json and skip Azure.
const out = fileURLToPath(new URL("./out/", import.meta.url));
const recorded: AnalyzeResultOutput = JSON.parse(
  readFileSync(join(fixtures, "analysis.json"), "utf8"),
);
const counts = (a: AnalyzeResultOutput) => ({
  pages: a.pages.length,
  paragraphs: a.paragraphs?.length,
  tables: a.tables?.length,
  figures: a.figures?.length,
  sections: a.sections?.length,
});

test(
  "live Azure still returns what the recording says",
  { timeout: 120_000 },
  async () => {
    await rm(out, { recursive: true, force: true });
    const doc = await parse(
      join(fixtures, "Competency-Self-Assessment-PRD.pdf"),
      out,
    );
    const dir = join(out, doc.source.sha256);
    const live: AnalyzeResultOutput = JSON.parse(
      readFileSync(join(dir, "analysis.json"), "utf8"),
    );

    expect(live.content).toBe(recorded.content);
    expect(counts(live)).toEqual(counts(recorded));

    const figures = readdirSync(join(dir, "figures"));
    expect(figures.length).toBe(recorded.figures?.length);
    for (const f of figures)
      expect(statSync(join(dir, "figures", f)).size, f).toBeGreaterThan(0);
  },
);
