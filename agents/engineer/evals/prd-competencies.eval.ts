import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type ScoreGraph, type SrsGraph, scoreGraphs } from "@dark-factory/srs";
import { defineEval } from "@grok/agent-sdk/evals";
import { parse } from "yaml";

const doc = readFileSync(
  fileURLToPath(
    new URL(
      "../../../packages/parse/test/fixtures/parsed.json",
      import.meta.url,
    ),
  ),
  "utf8",
);
const gold = parse(
  readFileSync(
    fileURLToPath(
      new URL("./fixtures/prd-competencies.gold.yaml", import.meta.url),
    ),
    "utf8",
  ),
) as SrsGraph;

const asScore = (graph: SrsGraph): ScoreGraph => ({
  statements: graph.statements.map((node) => ({
    id: node.id,
    type: node.type,
    parentId: node.parentId,
    elementIds: node.elementIds,
  })),
  entities: graph.entities.map((node) => ({
    id: node.id,
    type: node.type,
    elementIds: node.elementIds,
  })),
  relations: graph.relations.map((edge) => ({
    fromId: edge.fromId,
    relation: edge.relation,
    toId: edge.toId,
  })),
});

const TASK = `Build the requirements graph for the document in this workspace.
Walk it with read_document. Record only what the source states.
Cite element ids the tools return, and skip every paragraph, cell, and figure that states no requirement.
Call finish. If it reports failures, fix them and call finish again.`;

export default defineEval({
  tags: ["gold"],
  timeoutMs: 1_200_000,
  async test(t) {
    await t.send(TASK, {
      workspaceFiles: {
        "document.json": doc,
        "run.json": JSON.stringify({ runId: "prd-competencies" }),
      },
    });
    t.succeeded();
    t.taggedArtifact("srs-graph");
    const tagged = [...t.events]
      .reverse()
      .find((event) => event.type === "artifact.tagged");
    const graph =
      tagged?.type === "artifact.tagged"
        ? (tagged.data.data as SrsGraph)
        : undefined;
    const scores = graph
      ? scoreGraphs(asScore(gold), asScore(graph))
      : {
          statementRecall: 0,
          statementPrecision: 0,
          structure: 0,
          entityRecall: 0,
          entityPrecision: 0,
          relationRecall: 0,
          relationPrecision: 0,
        };
    t.score("statement-recall", scores.statementRecall);
    t.score("statement-precision", scores.statementPrecision);
    t.score("structure", scores.structure);
    t.score("entity-recall", scores.entityRecall);
    t.score("entity-precision", scores.entityPrecision);
    t.score("relation-recall", scores.relationRecall);
    t.score("relation-precision", scores.relationPrecision);
  },
});
