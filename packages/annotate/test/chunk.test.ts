import { expect, test } from "vitest";
import { MAX, anchors, chunk } from "../src/chunk.ts";
import { doc } from "./doc.ts";

const chunks = chunk(doc);
const all = chunks.join("\n");
const map = anchors(doc);

test("every anchor appears exactly once across chunks", () => {
  for (const id of map.keys()) expect(all.split(`[${id}] `)).toHaveLength(2);
});

test("chunks respect MAX unless a single line is larger", () => {
  for (const c of chunks) {
    if (c.length > MAX) expect(c).not.toContain("\n");
  }
  expect(chunks.length).toBeGreaterThan(1);
});

test("anchor text is the content slice", () => {
  for (const [id, spans] of map) {
    const first = spans[0]!;
    const slice = doc.content.slice(first.offset, first.offset + first.length);
    expect(all).toContain(`[${id}] ${slice.split("\n")[0]}`);
  }
});
