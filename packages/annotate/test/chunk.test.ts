import {
  MAX,
  anchors,
  chunk,
  type ParsedDocument,
} from "@dark-factory/contracts";
import { expect, test } from "vitest";
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

test("every chunk starts with a heading path", () => {
  for (const c of chunks) expect(c).toMatch(/^## .+\n/);
});

test("a section is never split across chunks unless it alone exceeds MAX", () => {
  // Which chunk each anchor landed in, grouped by the section that owns it.
  const home = new Map<string, number>();
  chunks.forEach((c, i) => {
    for (const [, id] of c.matchAll(/\[([^\]]+)\] /g)) home.set(id!, i);
  });
  const owner = new Map<string, string>();
  for (const el of doc.elements) {
    if (el.kind === "table")
      for (const c of el.cells) owner.set(c.id, el.parent!);
    else owner.set(el.id, el.parent!);
  }
  for (const [section, ids] of Map.groupBy(map.keys(), (id) => owner.get(id))) {
    const homes = new Set(ids.map((id) => home.get(id)));
    if (homes.size > 1) {
      const text = ids
        .map((id) =>
          doc.content.slice(
            map.get(id)![0]!.offset,
            map.get(id)![0]!.offset + map.get(id)![0]!.length,
          ),
        )
        .join("\n");
      expect(
        text.length,
        `${section} split without needing it`,
      ).toBeGreaterThan(MAX);
    }
  }
});

test("an oversized section is split between lines with the heading repeated", () => {
  const big = "x".repeat(MAX - 100);
  const span = (offset: number, length: number) => [{ offset, length }];
  const content = big + big;
  const fake: ParsedDocument = {
    source: { sha256: "0", pages: 1 },
    content,
    warnings: [],
    elements: [
      {
        id: "sections/0",
        parent: null,
        region: [],
        span: [],
        kind: "section",
        heading: "Big",
      },
      {
        id: "paragraphs/0",
        parent: "sections/0",
        region: [],
        span: span(0, big.length),
        kind: "paragraph",
        text: big,
      },
      {
        id: "paragraphs/1",
        parent: "sections/0",
        region: [],
        span: span(big.length, big.length),
        kind: "paragraph",
        text: big,
      },
    ],
  };
  const out = chunk(fake);
  expect(out).toHaveLength(2);
  for (const c of out) expect(c.startsWith("## Big\n")).toBe(true);
  expect(out[0]).toContain("[paragraphs/0] ");
  expect(out[1]).toContain("[paragraphs/1] ");
});
