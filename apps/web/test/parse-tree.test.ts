import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import type { AnnotateResult } from "@dark-factory/annotate";
import type { ParsedDocument } from "@dark-factory/parse";
import { CARD, DOCUMENT, toTree } from "@/lib/parse-tree";

const parsed: ParsedDocument = JSON.parse(
  readFileSync(
    new URL(
      "../../../packages/parse/test/fixtures/parsed.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
/** The fixture plus a page footer: page furniture sits in no section, so its parent is null. */
const doc: ParsedDocument = {
  ...parsed,
  elements: [
    ...parsed.elements,
    {
      id: "paragraphs/999",
      parent: null,
      kind: "paragraph",
      role: "pageFooter",
      text: "Page 1",
      region: [],
      span: [],
    },
  ],
};
const { classifications: requirements }: AnnotateResult = JSON.parse(
  readFileSync(
    new URL(
      "../../../packages/annotate/test/fixtures/annotate.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const byId = new Map(doc.elements.map((e) => [e.id, e]));
const sections = doc.elements.filter((e) => e.kind === "section");

test("closed, the tree is the Document and every section, each IN edge pointing at its parent", () => {
  const { nodes, edges } = toTree(doc, new Set());
  expect(nodes.map((n) => n.id).sort()).toEqual(
    [DOCUMENT, ...sections.map((s) => s.id)].sort(),
  );
  for (const e of edges)
    expect(e.target).toBe(byId.get(e.source)!.parent ?? DOCUMENT);
  expect(edges).toHaveLength(sections.length);
});

test("a card says what its section holds, and only sections holding content open", () => {
  const { nodes } = toTree(doc, new Set());
  const data = (id: string) => nodes.find((n) => n.id === id)!.data;
  expect(data("sections/9")).toMatchObject({
    label: "THE SCREEN WE ARE REPLACING",
    caption: "sections/9 · 2 paragraphs · 1 table",
    openable: true,
  });
  expect(data("sections/0")).toMatchObject({
    label: "Untitled",
    caption: "sections/0",
    openable: false,
  });
});

test("the Document holds what no section reached, shown once it is open", () => {
  const closed = toTree(doc, new Set());
  expect(closed.nodes.map((n) => n.id)).not.toContain("paragraphs/999");
  expect(closed.nodes.find((n) => n.id === DOCUMENT)!.data).toMatchObject({
    caption: "5 pages · 1 paragraph",
    openable: true,
  });
  const { edges } = toTree(doc, new Set([DOCUMENT]));
  expect(edges).toContainEqual({
    id: `paragraphs/999->${DOCUMENT}`,
    source: "paragraphs/999",
    target: DOCUMENT,
  });
});

test("opening a section shows what it holds, top to bottom in reading order", () => {
  const { nodes, edges } = toTree(doc, new Set(["sections/3"]));
  const inside = edges.filter((e) => e.target === "sections/3");
  expect(inside.map((e) => e.source)).toEqual([
    "paragraphs/3",
    "paragraphs/4",
    "paragraphs/5",
    "paragraphs/6",
  ]);
  const y = (id: string) => nodes.find((n) => n.id === id)!.position.y;
  const ys = inside.map((e) => y(e.source));
  expect(ys).toEqual([...ys].sort((a, b) => a - b));
  expect(nodes.find((n) => n.id === "sections/3")).toMatchObject({
    data: { open: true },
  });
});

test("with everything open, no two cards in a column overlap and each parent sits between its children", () => {
  const open = new Set([DOCUMENT, ...doc.elements.map((e) => e.id)]);
  const { nodes, edges } = toTree(doc, open);
  expect(nodes).toHaveLength(doc.elements.length + 1);
  for (const x of new Set(nodes.map((n) => n.position.x))) {
    const ys = nodes
      .filter((n) => n.position.x === x)
      .map((n) => n.position.y)
      .sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++)
      expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(CARD.height);
  }
  const y = new Map(nodes.map((n) => [n.id, n.position.y]));
  for (const parent of new Set(edges.map((e) => e.target))) {
    const kidYs = edges
      .filter((e) => e.target === parent)
      .map((e) => y.get(e.source)!);
    expect(y.get(parent)!).toBeGreaterThanOrEqual(Math.min(...kidYs));
    expect(y.get(parent)!).toBeLessThanOrEqual(Math.max(...kidYs));
  }
});

test("with requirements, an opened section shows only the elements an annotation quotes, each annotation hanging off it by a FROM edge", () => {
  const { nodes, edges } = toTree(doc, new Set(["sections/3"]), requirements);
  expect(
    edges.filter((e) => e.target === "sections/3").map((e) => e.source),
  ).toEqual(["paragraphs/4", "paragraphs/6"]);
  expect(edges).toContainEqual({
    id: "a2->paragraphs/4",
    source: "a2",
    target: "paragraphs/4",
  });
  expect(edges).toContainEqual({
    id: "a3->paragraphs/6",
    source: "a3",
    target: "paragraphs/6",
  });
  expect(nodes.find((n) => n.id === "a2")).toMatchObject({
    type: "requirement",
    data: { type: "business-goal", elementId: "paragraphs/4" },
  });
});

test("an annotation on a table cell hangs off its table", () => {
  const { nodes, edges } = toTree(doc, new Set(["sections/15"]), requirements);
  expect(
    edges.filter((e) => e.target === "tables/2").map((e) => e.source),
  ).toEqual(["a33", "a34", "a35", "a36", "a37", "a38", "a39", "a40", "a41"]);
  expect(nodes.map((n) => n.id)).not.toContain("tables/2/cells/3");
});

test("with requirements, a section counts its annotations and how much of what it holds they quote", () => {
  const { nodes } = toTree(doc, new Set(), requirements);
  const data = (id: string) => nodes.find((n) => n.id === id)!.data;
  expect(data("sections/3")).toMatchObject({
    caption: "sections/3 · 2 annotations · 2 of 4 paragraphs",
    openable: true,
  });
  expect(data("sections/15")).toMatchObject({
    caption: "sections/15 · 9 annotations · 0 of 1 paragraph · 1 of 1 table",
    openable: true,
  });
  expect(data("sections/9")).toMatchObject({
    caption: "sections/9 · 0 annotations · 0 of 2 paragraphs · 0 of 1 table",
    openable: false,
  });
});

test("with requirements and everything open, no two cards in a column overlap", () => {
  const open = new Set([DOCUMENT, ...doc.elements.map((e) => e.id)]);
  const { nodes } = toTree(doc, open, requirements);
  expect(nodes.filter((n) => n.type === "requirement")).toHaveLength(
    requirements.length,
  );
  for (const x of new Set(nodes.map((n) => n.position.x))) {
    const ys = nodes
      .filter((n) => n.position.x === x)
      .map((n) => n.position.y)
      .sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++)
      expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(CARD.height);
  }
});
