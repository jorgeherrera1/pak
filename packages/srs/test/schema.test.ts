import { expect, test } from "vitest";
import {
  addStatement,
  emptyGraph,
  entityInput,
  graphSchema,
  statementInput,
} from "../src/index.ts";

const quote = {
  elementIds: ["paragraphs/0"],
  sourceText: "Consultants record a level.",
};

test("statement and entity inputs are the vocabulary, one field object per type", () => {
  const feature = statementInput.safeParse({
    type: "feature",
    parentId: "product",
    ...quote,
    fields: { feature: "Record a level" },
  });
  expect(feature.success).toBe(true);

  const entityAsStatement = statementInput.safeParse({
    type: "user-class",
    parentId: "product",
    ...quote,
    fields: {},
  });
  expect(entityAsStatement.success).toBe(false);

  const missingCategory = statementInput.safeParse({
    type: "non-functional",
    parentId: "product",
    ...quote,
    fields: {},
  });
  expect(missingCategory.success).toBe(false);

  const unknownField = statementInput.safeParse({
    type: "feature",
    parentId: "product",
    ...quote,
    fields: { feature: "Record a level", invented: "no" },
  });
  expect(unknownField.success).toBe(false);

  const statementAsEntity = entityInput.safeParse({
    type: "feature",
    name: "Record a level",
    ...quote,
    fields: {},
  });
  expect(statementAsEntity.success).toBe(false);
});

test("a graph the tools built parses, and a field outside its type does not", () => {
  const built = addStatement(emptyGraph("run"), new Set(["paragraphs/0"]), {
    type: "in-scope",
    parentId: "product",
    ...quote,
    fields: { item: "Browsing" },
  });
  expect(graphSchema.safeParse(built.graph).success).toBe(true);
  const broken = structuredClone(built.graph);
  const statement = broken.statements[0];
  if (!statement) throw new Error("missing statement");
  statement.fields.invented = "no";
  expect(graphSchema.safeParse(broken).success).toBe(false);
});
