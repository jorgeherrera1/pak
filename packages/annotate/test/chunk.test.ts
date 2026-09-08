import type { ParsedDocument } from "@dark-factory/parse";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { MAX, anchors, chunk } from "../src/chunk.ts";

const doc: ParsedDocument = JSON.parse(
  readFileSync(
    new URL("../../parse/test/fixtures/parsed.json", import.meta.url),
    "utf8",
  ),
);
const chunks = chunk(doc);
const ids = [...anchors(doc).keys()];

test("every anchor appears exactly once across chunks", () => {
  const all = chunks.join("\n");
  for (const id of ids) expect(all.split(`[${id}] `)).toHaveLength(2);
});

test("chunks respect MAX unless a single line is larger", () => {
  for (const c of chunks) {
    if (c.length > MAX) expect(c).not.toContain("\n");
  }
  expect(chunks.length).toBeGreaterThan(1);
});

test("anchor text is the content slice", () => {
  const all = chunks.join("\n");
  for (const [id, spans] of anchors(doc)) {
    const first = spans[0]!;
    const slice = doc.content.slice(first.offset, first.offset + first.length);
    expect(all).toContain(`[${id}] ${slice.split("\n")[0]}`);
  }
});
