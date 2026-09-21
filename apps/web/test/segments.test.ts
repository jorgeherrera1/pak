import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import type { AnnotateResult } from "@dark-factory/annotate";
import type { ParsedDocument } from "@dark-factory/parse";
import { context, segments } from "@/lib/segments";

const mark = (id: string, offset: number, length: number) => ({
  id,
  span: { offset, length },
});
const ids = (s: { text: string; marks: { id: string }[] }) =>
  [s.text, s.marks.map((m) => m.id).join()] as const;

test("a mention nested inside a classification becomes three runs", () => {
  // "xx the app works" sits at offset 100; a covers "the app works", m covers "app".
  const out = segments("xx the app works", 100, [
    mark("a", 103, 13),
    mark("m", 107, 3),
  ]);
  expect(out.map(ids)).toEqual([
    ["xx ", ""],
    ["the ", "a"],
    ["app", "a,m"],
    [" works", "a"],
  ]);
});

test("no marks gives the text back whole", () => {
  expect(segments("plain", 0, []).map(ids)).toEqual([["plain", ""]]);
});

// The real question of the spike: does every recorded annotation land on its own quote?
test("every fixture annotation is recovered verbatim from its element", () => {
  const load = (p: string) =>
    JSON.parse(
      readFileSync(new URL(`../../../packages/${p}`, import.meta.url), "utf8"),
    );
  const doc: ParsedDocument = load("parse/test/fixtures/parsed.json");
  const ann: AnnotateResult = load("annotate/test/fixtures/annotate.json");
  const all = [...ann.classifications, ...ann.mentions];
  const missed: string[] = [];
  for (const a of all) {
    const [kind, n, , c] = a.elementId.split("/");
    const el = doc.elements.find((e) => e.id === `${kind}/${n}`);
    const host =
      el?.kind === "table" && c !== undefined
        ? el.cells.find((x) => x.id === a.elementId)
        : el;
    const span = host?.span[0];
    // Figures have no `text`; their words live only in `content`.
    const text =
      host && "text" in host
        ? host.text
        : span && doc.content.slice(span.offset, span.offset + span.length);
    const got =
      text !== undefined && span
        ? segments(text, span.offset, [a])
            .filter((s) => s.marks.length)
            .map((s) => s.text)
            .join("")
        : undefined;
    if (got !== a.text) missed.push(`${a.id} ${a.elementId}`);
  }
  expect(missed).toEqual([]);
  expect(all.length).toBeGreaterThan(0);
});

test("context cuts at word boundaries and flattens newlines", () => {
  const content = "alpha beta gamma\nthe catalogue keeps growing every day";
  const at = content.indexOf("catalogue");
  expect(context(content, { offset: at, length: 9 }, 12)).toEqual({
    pre: "gamma the ",
    hit: "catalogue",
    post: " keeps",
  });
});

test("context keeps everything when the document edge is inside the window", () => {
  expect(context("the app works", { offset: 4, length: 3 })).toEqual({
    pre: "the ",
    hit: "app",
    post: " works",
  });
});
