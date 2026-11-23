/**
 * Needs local Postgres with AGE preloaded and the `knowledge_graph` graph
 * (apps/web's migration). Reads WORKFLOW_POSTGRES_URL from the repo-root .env.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import type { ParsedDocument } from "@dark-factory/parse";
import {
  addEntity,
  addStatement,
  emptyGraph,
  relate,
} from "@dark-factory/srs";
import {
  readDocument,
  readGraph,
  readLatestGraph,
  writeDocument,
  writeGraph,
} from "../src/index.ts";

const env = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);

const packages = new URL("../../", import.meta.url);
const doc: ParsedDocument = JSON.parse(
  readFileSync(new URL("parse/test/fixtures/parsed.json", packages), "utf8"),
);
const jobId = "fixture-round-trip";
const escapes: ParsedDocument = {
  source: { sha256: "x", pages: 1 },
  content: "$$ 'q' \"r\"\nend",
  elements: [
    {
      id: "paragraphs/0",
      parent: null,
      kind: "paragraph",
      text: "$$ 'q' \"r\"",
      region: [],
      span: [{ offset: 0, length: 10 }],
    },
  ],
  warnings: ["w"],
};

test("the recorded document survives a round trip", async () => {
  await writeDocument(jobId, doc);
  await writeDocument(jobId, doc);
  expect(await readDocument(jobId)).toEqual(doc);

  await writeDocument("fixture-escapes", escapes);
  expect(await readDocument("fixture-escapes")).toEqual(escapes);

  expect(await readDocument("no-such-job")).toBeNull();
});

test("a run survives a round trip and a repeat does not duplicate it", async () => {
  const known = new Set(["paragraphs/0"]);
  const quote = {
    elementIds: ["paragraphs/0"],
    sourceText: "$$ 'q' \"r\"",
  };
  const statement = addStatement(emptyGraph("run-graph"), known, {
    type: "in-scope",
    parentId: "product",
    ...quote,
    fields: { item: "recording" },
  });
  const claim = addEntity(statement.graph, known, {
    type: "data-entity",
    name: "Claim",
    ...quote,
  });
  const person = addEntity(claim.graph, known, {
    type: "data-entity",
    name: "Person",
    ...quote,
  });
  const graph = relate(person.graph, {
    fromId: claim.id,
    relation: "RELATES_TO",
    toId: person.id,
    label: "records",
    cardinality: "one to many",
  });
  await writeDocument("fixture-graph", escapes);
  await writeGraph("fixture-graph", graph, "2026-01-01T00:00:00.000Z");
  await writeGraph("fixture-graph", graph, "2026-01-01T00:00:00.000Z");
  expect(await readGraph(graph.runId)).toEqual(graph);
  expect(await readLatestGraph("fixture-graph")).toEqual(graph);
});
