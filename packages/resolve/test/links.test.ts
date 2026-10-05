import type { Classification } from "@dark-factory/annotate";
import { expect, test } from "vitest";
import { groundLinks, type LinkAnswer } from "../src/ground.ts";
import type { Entity } from "../src/types.ts";

const entities = [
  { id: "e1", kind: "user-class", name: "account holder", mentions: [] },
  { id: "e2", kind: "data-entity", name: "account", mentions: [] },
] satisfies Entity[];
const c = (
  id: string,
  type: Classification["type"],
  elementId = "paragraphs/1",
): Classification => ({
  id,
  type,
  elementId,
  span: { offset: 0, length: 1 },
  text: "x",
});
/** Every classification was asked about in exactly one chunk. */
const ground = (answers: LinkAnswer[]) =>
  groundLinks(
    answers,
    entities,
    answers.flatMap((a) => a.asked),
  );

test("links are kept once, in order, when the classification was asked about and the entity exists", () => {
  const { links, warnings } = ground([
    {
      asked: [c("a2", "functional-requirement"), c("a1", "feature")],
      rows: [
        { classificationId: "a2", entityIds: ["e2", "e1", "e2"] },
        { classificationId: "a1", entityIds: ["e2"] },
        { classificationId: "a2", entityIds: ["e1"] },
      ],
    },
  ]);
  expect(warnings).toEqual([]);
  expect(links).toEqual([
    { classificationId: "a1", entityId: "e2" },
    { classificationId: "a2", entityId: "e1" },
    { classificationId: "a2", entityId: "e2" },
  ]);
});

test("a link to a classification of another chunk, or to an entity that does not exist, is dropped", () => {
  const { links, warnings } = ground([
    {
      asked: [c("a1", "feature")],
      // a3 is real, but this chunk was never shown it.
      rows: [{ classificationId: "a3", entityIds: ["e1"] }],
    },
    {
      asked: [c("a3", "feature", "paragraphs/3")],
      rows: [{ classificationId: "a3", entityIds: ["e9", "e2"] }],
    },
  ]);
  expect(links).toEqual([{ classificationId: "a3", entityId: "e2" }]);
  expect(warnings).toEqual([
    "a3: not a classification of this chunk, its links dropped",
    "a1: the model returned no row for it",
    "a3: unknown entity e9, link dropped",
  ]);
});

test("a sentence Annotate labeled with an entity kind but Resolve linked to no entity of that kind is reported", () => {
  const { links, warnings } = ground([
    {
      asked: [
        c("a1", "data-entity"),
        c("a2", "user-class"),
        c("a3", "standard"),
      ],
      rows: [
        { classificationId: "a1", entityIds: ["e1"] },
        { classificationId: "a2", entityIds: ["e1"] },
      ],
    },
  ]);
  expect(links).toHaveLength(2);
  expect(warnings).toEqual([
    "a3: the model returned no row for it",
    "a1: labeled data-entity, linked to no data-entity entity",
    "a3: labeled standard, linked to no standard entity",
  ]);
});

test("with no entity, every sentence Annotate labeled with an entity kind is still reported", () => {
  const { links, warnings } = groundLinks(
    [],
    [],
    [c("a1", "user-class"), c("a2", "functional-requirement")],
  );
  expect(links).toEqual([]);
  expect(warnings).toEqual([
    "a1: labeled user-class, linked to no user-class entity",
  ]);
});
