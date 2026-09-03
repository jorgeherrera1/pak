import type { AnalyzeResultOutput } from "@azure-rest/ai-document-intelligence";
import { expect, test } from "vitest";
import { normalize } from "../src/normalize.ts";

// ponytail: hand-built fixture typed against the SDK; swap for a trimmed real analysis.json once an RFP has been analyzed.
const content =
  "1 Scope\nThe system shall log in.\n1.1 Detail\nID\tPrio\nR-1\tMust\nLogin\nStray footer\nPage 1\nOK";
const at = (text: string) => [
  { offset: content.indexOf(text), length: text.length },
];
const on = (page: number) => [
  { pageNumber: page, polygon: [0, 0, 1, 0, 1, 1, 0, 1] },
];

const analysis: AnalyzeResultOutput = {
  apiVersion: "2024-11-30",
  modelId: "prebuilt-layout",
  stringIndexType: "utf16CodeUnit",
  content,
  pages: [{ pageNumber: 1 }, { pageNumber: 2 }],
  paragraphs: [
    {
      role: "sectionHeading",
      content: "1 Scope",
      spans: at("1 Scope"),
      boundingRegions: on(1),
    },
    {
      content: "The system shall log in.",
      spans: at("The system shall log in."),
      boundingRegions: on(1),
    },
    {
      role: "sectionHeading",
      content: "1.1 Detail",
      spans: at("1.1 Detail"),
      boundingRegions: on(1),
    },
    { content: "Login", spans: at("Login"), boundingRegions: on(2) },
    {
      content: "Stray footer",
      spans: at("Stray footer"),
      boundingRegions: on(2),
    },
    { content: "R-1", spans: at("R-1"), boundingRegions: on(1) },
    {
      role: "pageFooter",
      content: "Page 1",
      spans: at("Page 1"),
      boundingRegions: on(1),
    },
    { content: "OK", spans: at("OK"), boundingRegions: on(2) },
  ],
  tables: [
    {
      rowCount: 2,
      columnCount: 2,
      spans: at("ID\tPrio\nR-1\tMust"),
      boundingRegions: on(1),
      cells: [
        {
          kind: "columnHeader",
          rowIndex: 0,
          columnIndex: 0,
          content: "ID",
          spans: at("ID"),
        },
        {
          kind: "columnHeader",
          rowIndex: 0,
          columnIndex: 1,
          content: "Prio",
          spans: at("Prio"),
        },
        {
          rowIndex: 1,
          columnIndex: 0,
          content: "R-1",
          spans: at("R-1"),
          elements: ["/paragraphs/5"],
        },
        { rowIndex: 1, columnIndex: 1, content: "Must", spans: at("Must") },
      ],
    },
  ],
  figures: [
    {
      id: "2.1",
      spans: at("Login"),
      boundingRegions: on(2),
      elements: ["/paragraphs/3"],
      caption: { content: "Figure 1", spans: [] },
    },
    // Not in any section, but a section lists the text inside it. Seen in the real RFP.
    {
      id: "2.2",
      spans: at("OK"),
      boundingRegions: on(2),
      elements: ["/paragraphs/7"],
    },
  ],
  sections: [
    { spans: at(content), elements: ["/sections/1"] },
    {
      spans: at(content),
      elements: ["/paragraphs/0", "/paragraphs/1", "/sections/2"],
    },
    {
      spans: at("1.1 Detail"),
      elements: ["/paragraphs/2", "/tables/0", "/figures/0"],
    },
  ],
};

const doc = normalize(analysis, "abc");
const byId = Object.fromEntries(doc.elements.map((e) => [e.id, e]));
const textOf = (id: string) =>
  doc.content.slice(
    byId[id]!.span[0]!.offset,
    byId[id]!.span[0]!.offset + byId[id]!.span[0]!.length,
  );

test("sections nest and take their heading from the first heading paragraph", () => {
  expect(byId["sections/0"]).toMatchObject({ parent: null, kind: "section" });
  expect(byId["sections/1"]).toMatchObject({
    parent: "sections/0",
    heading: "1 Scope",
  });
  expect(byId["sections/2"]).toMatchObject({
    parent: "sections/1",
    heading: "1.1 Detail",
  });
  expect(byId["paragraphs/1"]).toMatchObject({
    parent: "sections/1",
    text: "The system shall log in.",
  });
});

test("reading order is a depth-first walk", () => {
  expect(doc.elements.map((e) => e.id)).toEqual([
    "sections/0",
    "sections/1",
    "paragraphs/0",
    "paragraphs/1",
    "sections/2",
    "paragraphs/2",
    "tables/0",
    "figures/0",
    "paragraphs/3",
    "paragraphs/4",
    "paragraphs/6",
    "figures/1",
    "paragraphs/7",
  ]);
});

test("spans point at the text they claim", () => {
  expect(textOf("paragraphs/1")).toBe("The system shall log in.");
  expect(textOf("paragraphs/3")).toBe("Login");
  expect(byId["paragraphs/3"]!.region).toEqual([
    { page: 2, polygon: [0, 0, 1, 0, 1, 1, 0, 1] },
  ]);
});

test("tables keep the cell grid; cell paragraphs are not separate nodes", () => {
  const t = byId["tables/0"]!;
  expect(t.kind === "table" && t.cells[2]).toMatchObject({
    id: "tables/0/cells/2",
    row: 1,
    col: 0,
    rowSpan: 1,
    colSpan: 1,
    kind: "content",
    text: "R-1",
  });
  expect(byId["paragraphs/5"]).toBeUndefined();
});

test("figures keep caption, image path, and the text inside them", () => {
  expect(byId["figures/0"]).toMatchObject({
    parent: "sections/2",
    caption: "Figure 1",
    image: "figures/2.1.png",
  });
  expect(byId["paragraphs/3"]!.parent).toBe("figures/0");
});

test("text inside a figure belongs to the figure even when a section lists it too", () => {
  expect(byId["figures/1"]).toMatchObject({
    parent: null,
    image: "figures/2.2.png",
  });
  expect(byId["paragraphs/7"]!.parent).toBe("figures/1");
});

test("elements outside any section are kept and flagged", () => {
  expect(byId["paragraphs/4"]!.parent).toBeNull();
  expect(byId["paragraphs/6"]).toMatchObject({
    parent: null,
    role: "pageFooter",
  });
  expect(doc.warnings).toEqual([
    "paragraphs/4 is not inside any section",
    "figures/1 is not inside any section",
  ]);
  expect(doc.source).toEqual({ sha256: "abc", pages: 2 });
});
