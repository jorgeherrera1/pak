import { expect, test } from "vitest";
import { ground } from "../src/ground.ts";

const content = "intro\nThe system shall log in users. Typing is slow.\nfooter";
const anchors = new Map([["paragraphs/1", [{ offset: 6, length: 46 }]]]);

test("a verbatim quote becomes a classification with a content span", () => {
  const { classifications, warnings } = ground(
    [
      {
        elementId: "paragraphs/1",
        quote: "shall log in users",
        type: "functional-requirement",
        category: null,
      },
    ],
    anchors,
    content,
  );
  expect(warnings).toEqual([]);
  const [a] = classifications;
  expect(a).toMatchObject({
    id: "a1",
    type: "functional-requirement",
    elementId: "paragraphs/1",
  });
  expect(content.slice(a!.span.offset, a!.span.offset + a!.span.length)).toBe(
    a!.text,
  );
});

test("unknown element and non-verbatim quote become warnings", () => {
  const { classifications, warnings } = ground(
    [
      {
        elementId: "paragraphs/9",
        quote: "shall",
        type: "feature",
        category: null,
      },
      {
        elementId: "paragraphs/1",
        quote: "shall login users",
        type: "feature",
        category: null,
      },
    ],
    anchors,
    content,
  );
  expect(classifications).toEqual([]);
  expect(warnings).toHaveLength(2);
});

test("a quote only matches on word boundaries", () => {
  const { classifications, warnings } = ground(
    [
      {
        elementId: "paragraphs/1",
        quote: "Typ",
        type: "glossary-term",
        category: null,
      },
      {
        elementId: "paragraphs/1",
        quote: "in",
        type: "glossary-term",
        category: null,
      },
    ],
    anchors,
    content,
  );
  // "Typ" only occurs inside "Typing"; "in" occurs standalone in "log in".
  expect(warnings).toEqual(['paragraphs/1: quote not found: "Typ"']);
  expect(classifications).toHaveLength(1);
  const [a] = classifications;
  expect(content.slice(a!.span.offset - 1, a!.span.offset + 3)).toBe(" in ");
});
