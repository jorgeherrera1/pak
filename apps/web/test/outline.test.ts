import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import type { AnnotateResult, ParsedDocument } from "@dark-factory/contracts";
import { ROW, toOutline } from "@/lib/outline";
import { DOCUMENT } from "@/lib/parse-tree";

const fixture = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const doc: ParsedDocument = fixture(
  "../../../packages/parse/test/fixtures/parsed.json",
);
const { classifications }: AnnotateResult = fixture(
  "../../../packages/annotate/test/fixtures/annotate.json",
);
const sections = Array.from({ length: 18 }, (_, i) => `sections/${i}`);
const everything = new Set([DOCUMENT, ...sections]);
const none = new Set<string>();

test("the rows are the Document, then every section in reading order, each indented under its parent", () => {
  const { rows } = toOutline(doc, classifications, everything, none);
  expect(rows.map((r) => r.id)).toEqual([DOCUMENT, ...sections]);
  const x = (id: string) => rows.find((r) => r.id === id)!.x;
  expect(x("sections/7")).toBeGreaterThan(x("sections/6"));
  expect(x("sections/6")).toBe(x("sections/2"));
});

test("each classification sits beside the section holding what it quotes, a cell's beside its table's", () => {
  const { rows, cards } = toOutline(doc, classifications, everything, none);
  expect(cards).toHaveLength(49);
  const beside = (id: string) =>
    cards.filter((c) => c.section === id).map((c) => c.r.id);
  expect(beside("sections/3")).toEqual(["a2", "a3"]);
  expect(beside("sections/15")).toEqual([
    "a33",
    "a34",
    "a35",
    "a36",
    "a37",
    "a38",
    "a39",
    "a40",
    "a41",
  ]);
  // A section's first card is level with it, the rest stack below before the next row.
  for (const c of cards) {
    const at = rows.findIndex((r) => r.id === c.section);
    expect(c.y).toBeGreaterThanOrEqual(rows[at]!.y);
    expect(c.y).toBeLessThan(rows[at + 1]?.y ?? Infinity);
  }
  expect(cards.find((c) => c.r.id === "a2")!.y).toBe(
    rows.find((r) => r.id === "sections/3")!.y,
  );
});

test("a folded section keeps its count, draws no cards and takes one line", () => {
  const open = new Set([...everything].filter((id) => id !== "sections/3"));
  const { rows, cards } = toOutline(doc, classifications, open, none);
  const row = (id: string) => rows.find((r) => r.id === id)!;
  expect(row("sections/3")).toMatchObject({ count: 2, open: false });
  expect(cards.map((c) => c.r.id)).not.toContain("a2");
  expect(row("sections/4").y - row("sections/3").y).toBe(ROW);
  // Nothing to show: never open.
  expect(row("sections/9")).toMatchObject({ count: 0, open: false });
});

test("a hidden type leaves both the cards and the counts", () => {
  const { rows, cards } = toOutline(
    doc,
    classifications,
    everything,
    new Set(["business-goal"]),
  );
  expect(rows.find((r) => r.id === "sections/3")!.count).toBe(1);
  expect(cards.map((c) => c.r.id)).not.toContain("a2");
  expect(cards.map((c) => c.r.id)).toContain("a3");
});

test("a card names the headed sections above what it quotes, top down", () => {
  const { cards } = toOutline(doc, classifications, everything, none);
  const path = (id: string) => cards.find((c) => c.r.id === id)!.path;
  expect(path("a23")).toBe("HOW IT BEHAVES");
  expect(path("a13")).toBe(
    "PRODUCT REQUIREMENTS . INTERNAL TOOLS › What changes",
  );
});
