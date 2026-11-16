import { expect, test } from "vitest";
import { linkInputs } from "../src/inputs.ts";
import type { Entity } from "@dark-factory/contracts";
import { classifications, doc } from "./doc.ts";

const entity: Entity = {
  id: "e1",
  kind: "data-entity",
  name: "Thing",
  mentions: [
    {
      elementId: "paragraphs/0",
      span: { offset: 0, length: 5 },
      text: "Thing",
    },
    {
      elementId: "paragraphs/1",
      span: { offset: 9, length: 6 },
      text: "things",
    },
    {
      elementId: "paragraphs/2",
      span: { offset: 20, length: 5 },
      text: "Thing",
    },
  ],
};

test("every classification is asked about in exactly one link input, beside the entity list and its own text", () => {
  const inputs = linkInputs(doc, classifications, [entity]);
  expect(inputs.flatMap((i) => i.asked.map((c) => c.id)).sort()).toEqual(
    classifications.map((c) => c.id).sort(),
  );
  for (const { asked, text } of inputs) {
    expect(text).toContain("# Entities\ne1 | data-entity | Thing; things\n");
    for (const c of asked) {
      expect(text).toContain(`\n${c.id} | ${c.type} | [${c.elementId}] | `);
      expect(text.split("# Text\n")[1]).toContain(`[${c.elementId}] `);
    }
  }
});

test("a name found across a line break is listed on one line, once", () => {
  const wrapped: Entity = {
    ...entity,
    name: "Whole\nThing",
    mentions: [
      {
        elementId: "figures/0",
        span: { offset: 0, length: 11 },
        text: "Whole\nThing",
      },
      {
        elementId: "paragraphs/1",
        span: { offset: 20, length: 11 },
        text: "Whole Thing",
      },
    ],
  };
  const [first] = linkInputs(doc, classifications, [wrapped]);
  expect(first!.text).toContain("# Entities\ne1 | data-entity | Whole Thing\n");
});

test("a chunk with no classification, and a document with no entity, cost no model call", () => {
  expect(linkInputs(doc, classifications.slice(0, 1), [entity])).toHaveLength(
    1,
  );
  expect(linkInputs(doc, classifications, [])).toEqual([]);
  expect(linkInputs(doc, [], [entity])).toEqual([]);
});
