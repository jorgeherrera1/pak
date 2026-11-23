import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import type { ParsedDocument } from "@dark-factory/parse";
import { verify } from "@dark-factory/srs";
import { parse } from "yaml";

test("the competencies gold graph passes the completeness check", () => {
  const doc = JSON.parse(
    readFileSync(
      new URL(
        "../../../packages/parse/test/fixtures/parsed.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as ParsedDocument;
  const gold = parse(
    readFileSync(
      new URL("../evals/fixtures/prd-competencies.gold.yaml", import.meta.url),
      "utf8",
    ),
  );
  expect(verify(gold, doc).failures).toEqual([]);
});
