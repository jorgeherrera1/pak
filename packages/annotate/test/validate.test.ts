import { expect, test } from "vitest";
import { validate } from "../src/annotate.ts";

const content = "intro\nThe system shall log in users.\nfooter";
const anchors = new Map([["paragraphs/1", [{ offset: 6, length: 30 }]]]);

test("a verbatim quote becomes an annotation with a content span", () => {
  const { annotations, warnings } = validate(
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
  const [a] = annotations;
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
  const { annotations, warnings } = validate(
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
  expect(annotations).toEqual([]);
  expect(warnings).toHaveLength(2);
});
