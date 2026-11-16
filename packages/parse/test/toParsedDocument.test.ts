import type { AnalyzeResultOutput } from "@azure-rest/ai-document-intelligence";
import { hash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { toParsedDocument } from "../src/toParsedDocument.ts";
import type { ParsedDocument, Span } from "@dark-factory/contracts";

// Inputs are a real Azure response, never hand-written. To re-record: run test:integration, then
// copy test/out/<sha256>/{analysis,parsed}.json into fixtures/ and review the diff.
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const analysis: AnalyzeResultOutput = JSON.parse(
  fixture("analysis.json").toString(),
);
const golden: ParsedDocument = JSON.parse(fixture("parsed.json").toString());

const doc = toParsedDocument(
  analysis,
  hash("sha256", fixture("prd-competencies.pdf")),
);

test("provenance: every span points at exactly its own text", () => {
  const textOf = (spans: Span[]) =>
    spans
      .map(({ offset, length }) => doc.content.slice(offset, offset + length))
      .join("\n");
  const withText = doc.elements.flatMap(
    (e): { id: string; text: string; span: Span[] }[] =>
      e.kind === "paragraph" ? [e] : e.kind === "table" ? e.cells : [],
  );
  expect(withText.length).toBeGreaterThan(0);
  for (const e of withText) expect(textOf(e.span), e.id).toBe(e.text);
});

test("completeness: every vendor element appears exactly once, nothing invented", () => {
  const inCells = new Set(
    analysis.tables!.flatMap((t) => t.cells.flatMap((c) => c.elements ?? [])),
  );
  const expected = new Set([
    ...analysis.sections!.map((_, i) => `sections/${i}`),
    ...analysis
      .paragraphs!.map((_, i) => `paragraphs/${i}`)
      .filter((id) => !inCells.has(`/${id}`)),
    ...analysis.tables!.map((_, i) => `tables/${i}`),
    ...analysis.figures!.map((_, i) => `figures/${i}`),
  ]);
  const ids = doc.elements.map((e) => e.id);
  expect(ids.length).toBe(expected.size);
  expect(new Set(ids)).toEqual(expected);
  expect(
    doc.elements.flatMap((e) => (e.kind === "table" ? e.cells : [])).length,
  ).toBe(analysis.tables!.reduce((n, t) => n + t.cells.length, 0));
});

test("golden: output equals the committed parsed.json", () => {
  expect(doc).toEqual(golden);
});
