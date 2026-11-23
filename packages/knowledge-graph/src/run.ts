import {
  PRODUCT_ID,
  RELATIONS,
  type SrsGraph,
  type SrsRelation,
  TYPES,
} from "@dark-factory/srs";
import { cypher, type Row, transaction } from "./db.ts";

const LABEL = new Map(TYPES.map((type) => [type.slug, type.label]));
const SLUG = new Map(TYPES.map((type) => [type.label, type.slug]));
const RELATION = new Set(RELATIONS.map((relation) => relation.name));

const labelFor = (slug: string) => {
  const label = LABEL.get(slug);
  if (!label) throw new Error(`unknown type ${slug}`);
  return label;
};

const json = (value: unknown) => JSON.stringify(value);

const countersOf = (value: unknown): Record<string, number> => {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") return {};
  return parsed as Record<string, number>;
};

const record = (value: unknown): Record<string, string> => {
  if (typeof value === "string")
    return JSON.parse(value) as Record<string, string>;
  if (value && typeof value === "object")
    return value as Record<string, string>;
  return {};
};

const text = (value: unknown) => (typeof value === "string" ? value : "");

const num = (value: unknown) => (typeof value === "number" ? value : 0);

/** Writes one run beside the document tree. A repeat for the same runId replaces that run. */
export async function writeGraph(
  jobId: string,
  graph: SrsGraph,
  createdAt = new Date().toISOString(),
): Promise<void> {
  const statements = graph.statements.map((node, position) => ({
    label: labelFor(node.type),
    row: {
      id: node.id,
      runId: graph.runId,
      jobId,
      type: node.type,
      parentId: node.parentId,
      sourceText: node.sourceText,
      fields: json(node.fields),
      position,
    },
  }));
  const entities = graph.entities.map((node, position) => ({
    label: labelFor(node.type),
    row: {
      id: node.id,
      runId: graph.runId,
      jobId,
      type: node.type,
      name: node.name,
      parentId: node.parentId,
      sourceText: node.sourceText,
      fields: json(node.fields),
      position,
    },
  }));
  const byLabel = new Map<string, Row[]>();
  for (const node of [...statements, ...entities]) {
    byLabel.set(node.label, [...(byLabel.get(node.label) ?? []), node.row]);
  }
  const parts = [...graph.statements, ...graph.entities].map((node) => ({
    child: node.id,
    parent: node.parentId,
  }));
  const cites = [
    ...graph.product.elementIds.map((elementId, position) => ({
      id: PRODUCT_ID,
      elementId,
      position,
    })),
    ...graph.statements.flatMap((node) =>
      node.elementIds.map((elementId, position) => ({
        id: node.id,
        elementId,
        position,
      })),
    ),
    ...graph.entities.flatMap((node) =>
      node.elementIds.map((elementId, position) => ({
        id: node.id,
        elementId,
        position,
      })),
    ),
  ];
  const byRelation = new Map<string, Row[]>();
  graph.relations.forEach((edge, position) => {
    if (!RELATION.has(edge.relation)) {
      throw new Error(`unknown relation ${edge.relation}`);
    }
    byRelation.set(edge.relation, [
      ...(byRelation.get(edge.relation) ?? []),
      {
        fromId: edge.fromId,
        toId: edge.toId,
        position,
        label: edge.label ?? null,
        cardinality: edge.cardinality ?? null,
      },
    ]);
  });

  await transaction(async (client) => {
    await cypher(client, `MATCH (n {runId: $runId}) DETACH DELETE n`, {
      runId: graph.runId,
    });
    await cypher(
      client,
      `CREATE (:Run {id: $runId, runId: $runId, jobId: $jobId, createdAt: $createdAt, counters: $counters})`,
      {
        runId: graph.runId,
        jobId,
        createdAt,
        counters: json(graph.counters),
      },
    );
    await cypher(
      client,
      `MATCH (r:Run {runId: $runId}), (d:Document {jobId: $jobId}) CREATE (r)-[:OF]->(d)`,
      { runId: graph.runId, jobId },
    );
    await cypher(
      client,
      `UNWIND $rows AS row CREATE (p:Product) SET p = row`,
      {
        rows: [
          {
            id: PRODUCT_ID,
            runId: graph.runId,
            jobId,
            sourceText: graph.product.sourceText,
            fields: json(graph.product.fields),
          },
        ],
      },
    );
    await cypher(
      client,
      `MATCH (p:Product {runId: $runId}), (r:Run {runId: $runId}) CREATE (p)-[:PRODUCED_BY]->(r)`,
      { runId: graph.runId },
    );
    for (const [label, rows] of byLabel) {
      await cypher(
        client,
        `UNWIND $rows AS row CREATE (n:${label}) SET n = row`,
        {
          rows,
        },
      );
    }
    if (parts.length > 0) {
      await cypher(
        client,
        `UNWIND $rows AS row MATCH (c {runId: $runId}), (p {runId: $runId}) WHERE c.id = row.child AND p.id = row.parent CREATE (c)-[:PART_OF]->(p)`,
        { runId: graph.runId, rows: parts },
      );
    }
    if (cites.length > 0) {
      await cypher(
        client,
        `UNWIND $rows AS row MATCH (n {runId: $runId}), (e) WHERE n.id = row.id AND e.jobId = $jobId AND e.id = row.elementId CREATE (n)-[:CITES {position: row.position}]->(e)`,
        { runId: graph.runId, jobId, rows: cites },
      );
    }
    for (const [name, rows] of byRelation) {
      await cypher(
        client,
        `UNWIND $rows AS row MATCH (a {runId: $runId}), (b {runId: $runId}) WHERE a.id = row.fromId AND b.id = row.toId CREATE (a)-[:${name} {position: row.position, label: row.label, cardinality: row.cardinality}]->(b)`,
        { runId: graph.runId, rows },
      );
    }
    if (graph.skipped.length > 0) {
      await cypher(
        client,
        `UNWIND $rows AS row MATCH (r:Run {runId: $runId}), (e) WHERE e.jobId = $jobId AND e.id = row.elementId CREATE (r)-[:SKIPPED {reason: row.reason, position: row.position}]->(e)`,
        {
          runId: graph.runId,
          jobId,
          rows: graph.skipped.map((row, position) => ({ ...row, position })),
        },
      );
    }
  });
}

type NodeRow = Row & {
  id?: string;
  type?: string;
  name?: string;
  parentId?: string;
  sourceText?: string;
  fields?: unknown;
  counters?: unknown;
  position?: number;
  createdAt?: string;
};

export async function readGraph(runId: string): Promise<SrsGraph | null> {
  return transaction(async (client) => {
    const nodes = await cypher<[string, NodeRow]>(
      client,
      `MATCH (n {runId: $runId}) RETURN label(n), properties(n)`,
      { runId },
      ["label", "props"],
    );
    const run = nodes.find(([label]) => label === "Run");
    const product = nodes.find(([label]) => label === "Product");
    if (!run || !product) return null;
    const edges = await cypher<[string, string, Row, string | null]>(
      client,
      `MATCH (a {runId: $runId})-[r]->(b) RETURN a.id, type(r), properties(r), b.id`,
      { runId },
      ["from", "rel", "props", "to"],
    );
    const cites = new Map<string, { elementId: string; position: number }[]>();
    const relations: (SrsRelation & { position: number })[] = [];
    const skipped: { elementId: string; reason: string; position: number }[] =
      [];
    for (const [from, rel, props, to] of edges) {
      if (rel === "CITES" && to) {
        const list = cites.get(from) ?? [];
        list.push({ elementId: to, position: num(props.position) });
        cites.set(from, list);
      } else if (rel === "SKIPPED" && to) {
        skipped.push({
          elementId: to,
          reason: text(props.reason),
          position: num(props.position),
        });
      } else if (RELATION.has(rel) && to) {
        relations.push({
          fromId: from,
          relation: rel,
          toId: to,
          ...(typeof props.label === "string" ? { label: props.label } : {}),
          ...(typeof props.cardinality === "string"
            ? { cardinality: props.cardinality }
            : {}),
          position: num(props.position),
        });
      }
    }
    const idsOf = (id: string) =>
      (cites.get(id) ?? [])
        .sort((a, b) => a.position - b.position)
        .map((cite) => cite.elementId);
    const statements = nodes
      .flatMap(([label, props]) => {
        const slug = SLUG.get(label);
        if (
          !slug ||
          TYPES.find((type) => type.slug === slug)?.side !== "statement"
        ) {
          return [];
        }
        return [
          {
            id: text(props.id),
            type: slug,
            parentId: text(props.parentId),
            elementIds: idsOf(text(props.id)),
            sourceText: text(props.sourceText),
            fields: record(props.fields),
            position: num(props.position),
          },
        ];
      })
      .sort((a, b) => a.position - b.position)
      .map(({ position: _position, ...node }) => node);
    const entities = nodes
      .flatMap(([label, props]) => {
        const slug = SLUG.get(label);
        if (
          !slug ||
          TYPES.find((type) => type.slug === slug)?.side !== "entity"
        ) {
          return [];
        }
        return [
          {
            id: text(props.id),
            type: slug,
            name: text(props.name),
            parentId: text(props.parentId) || PRODUCT_ID,
            elementIds: idsOf(text(props.id)),
            sourceText: text(props.sourceText),
            fields: record(props.fields),
            position: num(props.position),
          },
        ];
      })
      .sort((a, b) => a.position - b.position)
      .map(({ position: _position, ...node }) => node);
    return {
      runId,
      counters: countersOf(run[1].counters),
      product: {
        elementIds: idsOf(PRODUCT_ID),
        sourceText: text(product[1].sourceText),
        fields: record(product[1].fields),
      },
      statements,
      entities,
      relations: relations
        .sort((a, b) => a.position - b.position)
        .map(({ position: _position, ...edge }) => edge),
      skipped: skipped
        .sort((a, b) => a.position - b.position)
        .map(({ elementId, reason }) => ({ elementId, reason })),
    };
  });
}

export async function readLatestGraph(jobId: string): Promise<SrsGraph | null> {
  const runs = await transaction((client) =>
    cypher<[string, string]>(
      client,
      `MATCH (r:Run {jobId: $jobId}) RETURN r.runId, r.createdAt`,
      { jobId },
      ["runId", "createdAt"],
    ),
  );
  runs.sort((a, b) => b[1].localeCompare(a[1]));
  const latest = runs[0];
  return latest ? readGraph(latest[0]) : null;
}
