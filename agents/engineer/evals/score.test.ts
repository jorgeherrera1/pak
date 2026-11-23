import { expect, test } from "vitest";
import { scoreGraphs, type ScoreGraph } from "./score.ts";

const gold: ScoreGraph = {
  statements: [
    {
      id: "FEAT-01",
      type: "feature",
      parentId: "product",
      elementIds: ["paragraphs/1"],
    },
    {
      id: "FR-001",
      type: "functional-requirement",
      parentId: "FEAT-01",
      elementIds: ["paragraphs/2"],
    },
  ],
  entities: [
    {
      id: "ENT-01",
      type: "data-entity",
      elementIds: ["paragraphs/3"],
    },
  ],
  relations: [
    { fromId: "FR-001", relation: "DEPENDS_ON", toId: "ENT-01" },
  ],
};

test("recall, precision, structure and relations follow the cited elements", () => {
  const actual: ScoreGraph = {
    statements: [
      {
        id: "FEAT-09",
        type: "feature",
        parentId: "product",
        elementIds: ["paragraphs/1"],
      },
      {
        id: "FR-004",
        type: "functional-requirement",
        parentId: "FEAT-09",
        elementIds: ["paragraphs/2", "paragraphs/8"],
      },
      {
        id: "FR-005",
        type: "functional-requirement",
        parentId: "product",
        elementIds: ["paragraphs/9"],
      },
    ],
    entities: [
      {
        id: "ENT-03",
        type: "data-entity",
        elementIds: ["paragraphs/3"],
      },
    ],
    relations: [
      { fromId: "FR-004", relation: "DEPENDS_ON", toId: "ENT-03" },
      { fromId: "FR-005", relation: "DEPENDS_ON", toId: "ENT-03" },
    ],
  };
  expect(scoreGraphs(gold, actual)).toEqual({
    statementRecall: 1,
    statementPrecision: 2 / 3,
    structure: 1,
    entityRecall: 1,
    entityPrecision: 1,
    relationRecall: 1,
    relationPrecision: 0.5,
  });
});

test("a requirement under the wrong parent lowers structure only", () => {
  const actual: ScoreGraph = {
    ...gold,
    statements: gold.statements.map((node) =>
      node.id === "FR-001" ? { ...node, parentId: "product" } : node,
    ),
  };
  const scores = scoreGraphs(gold, actual);
  expect(scores.statementRecall).toBe(1);
  expect(scores.structure).toBe(0.5);
});
