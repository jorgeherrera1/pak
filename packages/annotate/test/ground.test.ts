import { expect, test } from "vitest";
import { ground } from "../src/ground.ts";

const content = "intro\nThe system shall log in users. Typing is slow.\nfooter";
const anchors = new Map([["paragraphs/1", [{ offset: 6, length: 46 }]]]);
const none = { classifications: [], mentions: [] };

test("a verbatim quote becomes an annotation with a content span", () => {
  const { classifications, warnings } = ground(
    {
      ...none,
      classifications: [
        {
          elementId: "paragraphs/1",
          quote: "shall log in users",
          type: "functional-requirement",
          category: null,
        },
      ],
    },
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
    {
      ...none,
      classifications: [
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
    },
    anchors,
    content,
  );
  expect(classifications).toEqual([]);
  expect(warnings).toHaveLength(2);
});

test("a mention grounds like an annotation and keeps its name", () => {
  const { mentions, warnings } = ground(
    {
      ...none,
      mentions: [
        {
          elementId: "paragraphs/1",
          quote: "users",
          name: "User",
        },
        {
          elementId: "paragraphs/1",
          quote: "system",
          name: "  ",
        },
      ],
    },
    anchors,
    content,
  );
  expect(warnings).toEqual([]);
  expect(mentions).toMatchObject([
    { id: "m1", text: "users", name: "User" },
    { id: "m2", text: "system", name: "system" },
  ]);
  for (const m of mentions)
    expect(content.slice(m.span.offset, m.span.offset + m.span.length)).toBe(
      m.text,
    );
});

test("a quote only matches on word boundaries", () => {
  const { mentions, warnings } = ground(
    {
      ...none,
      mentions: [
        {
          elementId: "paragraphs/1",
          quote: "Typ",
          name: "Typ",
        },
        { elementId: "paragraphs/1", quote: "in", name: "in" },
      ],
    },
    anchors,
    content,
  );
  // "Typ" only occurs inside "Typing"; "in" occurs standalone in "log in".
  expect(warnings).toEqual(['paragraphs/1: quote not found: "Typ"']);
  expect(mentions).toHaveLength(1);
  expect(
    content.slice(mentions[0]!.span.offset - 1, mentions[0]!.span.offset + 3),
  ).toBe(" in ");
});
