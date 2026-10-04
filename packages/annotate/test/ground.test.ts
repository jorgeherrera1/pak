import { expect, test } from "vitest";
import { ground, type ClassificationRow } from "../src/ground.ts";

const content =
  'intro\nThe system shall log in users. Typing is slow.\nx no "who :selected: knows X", no exports\nThe İSTANBUL depot ships daily.\nfooter';
const span = (text: string) => [
  { offset: content.indexOf(text), length: text.length },
];
const anchors = new Map([
  ["paragraphs/1", span("The system shall log in users. Typing is slow.")],
  ["paragraphs/2", span('x no "who :selected: knows X", no exports')],
  ["paragraphs/3", span("The İSTANBUL depot ships daily.")],
]);
const row = (
  elementId: string,
  quote: string,
  type: ClassificationRow["type"] = "functional-requirement",
): ClassificationRow => ({ elementId, quote, type, category: null });
const slice = (a: { span: { offset: number; length: number } }) =>
  content.slice(a.span.offset, a.span.offset + a.span.length);

test("a verbatim quote becomes a classification with a content span", () => {
  const { classifications, warnings } = ground(
    [row("paragraphs/1", "shall log in users")],
    anchors,
    content,
  );
  expect(warnings).toEqual([]);
  expect(classifications).toEqual([
    {
      id: "a1",
      type: "functional-requirement",
      elementId: "paragraphs/1",
      span: { offset: 17, length: 18 },
      text: "shall log in users",
    },
  ]);
});

test("a quote only matches on word boundaries", () => {
  const { classifications } = ground(
    [row("paragraphs/1", "in", "glossary-term")],
    anchors,
    content,
  );
  // "in" also occurs inside "Typing"; the match is the standalone word in "log in".
  const [a] = classifications;
  expect(content.slice(a!.span.offset - 1, a!.span.offset + 3)).toBe(" in ");
});

test("a quote that differs in case, spacing or quote characters is located, and the stored text is the source's", () => {
  const { classifications, warnings } = ground(
    [
      row("paragraphs/1", "the  System shall log in users"),
      row("paragraphs/2", "No “who knows X”, no exports", "out-of-scope"),
      row("paragraphs/3", "Depot Ships Daily"),
    ],
    anchors,
    content,
  );
  expect(warnings).toEqual([]);
  expect(classifications.map((a) => a.text)).toEqual([
    "The system shall log in users",
    'no "who :selected: knows X", no exports',
    "depot ships daily",
  ]);
  for (const a of classifications) expect(slice(a)).toBe(a.text);
});

test("a quote that cannot be located labels the whole element instead of being dropped", () => {
  const { classifications, warnings } = ground(
    [
      row("paragraphs/1", "Users must be able to sign in"),
      // Present in the document, but in another element than the one cited.
      row("paragraphs/1", "depot ships daily"),
      row("paragraphs/3", ""),
    ],
    anchors,
    content,
  );
  expect(classifications.map((a) => [a.elementId, a.text])).toEqual([
    ["paragraphs/1", "The system shall log in users. Typing is slow."],
    ["paragraphs/3", "The İSTANBUL depot ships daily."],
  ]);
  expect(warnings).toEqual([
    'paragraphs/1: quote not located, labeled the whole element: "Users must be able to sign in"',
    'paragraphs/1: quote not located, labeled the whole element: "depot ships daily"',
    'paragraphs/3: quote not located, labeled the whole element: ""',
  ]);
});

test("an element with several spans falls back to its first span", () => {
  const two = new Map([
    ["paragraphs/9", [...span("Typing is slow."), ...span("footer")]],
  ]);
  const { classifications } = ground(
    [row("paragraphs/9", "nowhere to be found")],
    two,
    content,
  );
  expect(classifications.map((a) => a.text)).toEqual(["Typing is slow."]);
});

test("an unknown element is dropped with a warning", () => {
  const { classifications, warnings } = ground(
    [row("paragraphs/99", "shall")],
    anchors,
    content,
  );
  expect(classifications).toEqual([]);
  expect(warnings).toEqual(["paragraphs/99: unknown element"]);
});

test("the same finding returned twice is stored once", () => {
  const { classifications } = ground(
    [
      row("paragraphs/1", "shall log in users"),
      row("paragraphs/1", "shall log in users"),
      row("paragraphs/1", "Shall log in users"),
      row("paragraphs/1", "shall log in users", "feature"),
    ],
    anchors,
    content,
  );
  expect(classifications.map((a) => [a.id, a.type])).toEqual([
    ["a1", "functional-requirement"],
    ["a2", "feature"],
  ]);
});
