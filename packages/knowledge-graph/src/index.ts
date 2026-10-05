// The vocabulary alone: the package's entry loads the model SDK.
import {
  isEntityKind,
  type Classification,
  type ClassificationType,
  type EntityKind,
} from "@dark-factory/annotate/types";
import type { Cell, Element, ParsedDocument, Span } from "@dark-factory/parse";
import type { Entity, Link, ResolveResult } from "@dark-factory/resolve";
import pg from "pg";

/** The one AGE graph; created by apps/web's migration. */
const GRAPH = "knowledge_graph";

let pool: pg.Pool | undefined;
// Opened on first use, not at import: tests load .env after importing this module.
const db = () =>
  (pool ??= new pg.Pool({
    connectionString: process.env.WORKFLOW_POSTGRES_URL,
  }));

type Row = Record<string, unknown>;

/**
 * Runs one Cypher query whose `$name` parameters come from `params` and
 * returns each row as the listed columns, decoded from agtype. Maps, lists,
 * strings and numbers print as JSON, so JSON.parse is the whole decoder.
 */
async function cypher<T extends unknown[]>(
  client: pg.ClientBase,
  query: string,
  params: Row,
  columns: string[] = ["v"],
): Promise<T[]> {
  // Quoted, or Postgres lowercases the alias and the row key no longer matches.
  const shape = columns.map((c) => `"${c}" agtype`).join(", ");
  const { rows } = await client.query<Record<string, string | null>>(
    `SELECT * FROM cypher('${GRAPH}', $$ ${query} $$, $1) AS (${shape})`,
    [JSON.stringify(params)],
  );
  return rows.map(
    (r) => columns.map((c) => (r[c] === null ? null : JSON.parse(r[c]!))) as T,
  );
}

async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Element kind to node label, and back. */
const LABEL = {
  section: "Section",
  paragraph: "Paragraph",
  table: "Table",
  figure: "Figure",
} as const;
const KIND = Object.fromEntries(
  Object.entries(LABEL).map(([kind, label]) => [label, kind]),
) as Record<string, keyof typeof LABEL>;

/** An element's node: its fields minus `parent`, `kind` (the label) and `cells`, plus `jobId` and its `position` in reading order. */
function elementProps(jobId: string, position: number, el: Element): Row {
  const row: Row = { ...el, jobId, position };
  delete row.parent;
  delete row.kind;
  delete row.cells;
  return row;
}

/** A cell's node: its fields minus `parent`, plus `jobId` and its `position` in the table's cell list. `kind` stays: for a cell it is data. */
function cellProps(jobId: string, position: number, cell: Cell): Row {
  const row: Row = { ...cell, jobId, position };
  delete row.parent;
  return row;
}

/** Replaces everything the graph holds for `jobId` with `doc`: the Document, one node per element and cell, IN edges up to the Document. */
export async function writeDocument(
  jobId: string,
  doc: ParsedDocument,
): Promise<void> {
  const nodes = new Map<string, Row[]>();
  const add = (label: string, row: Row) =>
    nodes.set(label, [...(nodes.get(label) ?? []), row]);
  const roots: string[] = [];
  const edges: { child: string; parent: string }[] = [];
  doc.elements.forEach((el, i) => {
    add(LABEL[el.kind], elementProps(jobId, i, el));
    if (el.parent === null) roots.push(el.id);
    else edges.push({ child: el.id, parent: el.parent });
    if (el.kind === "table")
      el.cells.forEach((cell, j) => {
        add("Cell", cellProps(jobId, j, cell));
        edges.push({ child: cell.id, parent: cell.parent ?? el.id });
      });
  });

  await transaction(async (client) => {
    await cypher(client, `MATCH (n {jobId: $jobId}) DETACH DELETE n`, {
      jobId,
    });
    await cypher(
      client,
      `CREATE (:Document {jobId: $jobId, sha256: $sha256, pages: $pages, content: $content, warnings: $warnings})`,
      { jobId, ...doc.source, content: doc.content, warnings: doc.warnings },
    );
    for (const [label, rows] of nodes)
      await cypher(client, `UNWIND $rows AS r CREATE (n:${label}) SET n = r`, {
        rows,
      });
    // Lookups by row are WHERE equalities, never property maps: a map compiles to a containment test, which
    // Postgres can only check row by row against every vertex; an equality lets it hash join the rows to one scan.
    // ponytail: that one scan reads every job's vertices; index jobId and id when many jobs make it slow.
    await cypher(
      client,
      `MATCH (d:Document {jobId: $jobId}) UNWIND $roots AS r MATCH (c) WHERE c.jobId = $jobId AND c.id = r CREATE (c)-[:IN]->(d)`,
      { jobId, roots },
    );
    await cypher(
      client,
      `UNWIND $edges AS e MATCH (c), (p) WHERE c.jobId = $jobId AND c.id = e.child AND p.jobId = $jobId AND p.id = e.parent CREATE (c)-[:IN]->(p)`,
      { jobId, edges },
    );
  });
}

/** The inverse of writeDocument, or null when the job has no Document. */
export async function readDocument(
  jobId: string,
): Promise<ParsedDocument | null> {
  return transaction(async (client) => {
    const [head] = await cypher<[Row]>(
      client,
      `MATCH (d:Document {jobId: $jobId}) RETURN properties(d)`,
      { jobId },
    );
    if (!head) return null;
    const { sha256, pages, content, warnings } = head[0] as {
      sha256: string;
      pages: number;
      content: string;
      warnings: string[];
    };
    const rows = await cypher<[string, Row, string, string | null]>(
      client,
      `MATCH (e {jobId: $jobId})-[:IN]->(p) RETURN label(e), properties(e), label(p), p.id`,
      { jobId },
      ["label", "props", "parentLabel", "parentId"],
    );
    const elements: Element[] = [];
    const cells = new Map<string, Cell[]>();
    for (const [label, props, parentLabel, parentId] of rows) {
      const { position, ...rest } = props as Row & { position: number };
      delete rest.jobId;
      const parent = parentLabel === "Document" ? null : parentId;
      if (label === "Cell") {
        const list = cells.get(parent!) ?? [];
        list[position] = { ...rest, parent } as Cell;
        cells.set(parent!, list);
      } else {
        const kind = KIND[label]!;
        elements[position] = { ...rest, parent, kind } as Element;
      }
    }
    for (const el of elements)
      if (el.kind === "table") el.cells = cells.get(el.id) ?? [];
    return { source: { sha256, pages }, content, elements, warnings };
  });
}

/** "non-functional-requirement" → "NonFunctionalRequirement", and back. The ontology names the labels. */
const toLabel = (type: string) =>
  type.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase());
const toType = (label: string) =>
  label
    .replace(/(?<!^)[A-Z]/g, (c) => `-${c}`)
    .toLowerCase() as ClassificationType;

/** Replaces the job's requirement nodes: one node per row with a FROM edge to the element it was quoted from, labeled by its type, or `Description` when the type is an entity kind. */
export async function writeRequirements(
  jobId: string,
  rows: Classification[],
): Promise<void> {
  const byLabel = new Map<string, Row[]>();
  for (const c of rows) {
    // A sentence about an entity is a Description; the kind's own label belongs to the entity.
    const describes = isEntityKind(c.type);
    const label = describes ? "Description" : toLabel(c.type);
    // Flat, with the element id alongside the node's own properties: AGE's SET takes a whole map, not a nested one.
    const row: Row = {
      elementId: c.elementId,
      jobId,
      id: c.id,
      text: c.text,
      span: c.span,
    };
    if (describes) row.kind = c.type;
    if (c.category) row.category = c.category;
    byLabel.set(label, [...(byLabel.get(label) ?? []), row]);
  }
  await transaction(async (client) => {
    await cypher(
      client,
      `MATCH (r {jobId: $jobId})-[:FROM]->() DETACH DELETE r`,
      { jobId },
    );
    for (const [label, list] of byLabel)
      await cypher(
        client,
        `UNWIND $rows AS r MATCH (e) WHERE e.jobId = $jobId AND e.id = r.elementId CREATE (n:${label})-[:FROM]->(e) SET n = r REMOVE n.elementId`,
        { jobId, rows: list },
      );
  });
}

/** The job's requirements in reading order, each with the id of the element it came FROM. */
export async function readRequirements(
  jobId: string,
): Promise<Classification[]> {
  const rows = await transaction((client) =>
    cypher<[string, Row, string]>(
      client,
      `MATCH (r {jobId: $jobId})-[:FROM]->(e) RETURN label(r), properties(r), e.id`,
      { jobId },
      ["label", "props", "elementId"],
    ),
  );
  return rows
    .map(([label, props, elementId]) => {
      const { id, text, span, category, kind } = props as Pick<
        Classification,
        "id" | "text" | "span" | "category"
      > & { kind?: ClassificationType };
      return {
        id,
        // A Description carries its type as `kind`; every other label is the type.
        type: kind ?? toType(label),
        elementId,
        span,
        text,
        ...(category && { category }),
      };
    })
    .sort((a, b) => a.span.offset - b.span.offset);
}

/** What Resolve stores about a job's entities. */
type Entities = Pick<ResolveResult, "entities" | "possiblySameAs">;

/** Replaces the job's entities: one node per entity labeled by its kind, a MENTIONED_IN edge per mention to the element it sits in, a POSSIBLY_SAME_AS edge per pair. Entities and pairs keep their `position` in the lists. Deleting an entity takes its ABOUT edges with it. */
export async function writeEntities(
  jobId: string,
  { entities, possiblySameAs }: Entities,
): Promise<void> {
  const byLabel = new Map<string, Row[]>();
  entities.forEach((e, position) => {
    const label = toLabel(e.kind);
    const row: Row = { jobId, id: e.id, name: e.name, position };
    byLabel.set(label, [...(byLabel.get(label) ?? []), row]);
  });
  const mentions = entities.flatMap((e) =>
    e.mentions.map((m) => ({ entityId: e.id, ...m })),
  );
  await transaction(async (client) => {
    await cypher(
      client,
      `MATCH (e {jobId: $jobId})-[:MENTIONED_IN]->() DETACH DELETE e`,
      { jobId },
    );
    for (const [label, rows] of byLabel)
      await cypher(client, `UNWIND $rows AS r CREATE (n:${label}) SET n = r`, {
        rows,
      });
    await cypher(
      client,
      `UNWIND $rows AS r MATCH (e), (el) WHERE e.jobId = $jobId AND e.id = r.entityId AND el.jobId = $jobId AND el.id = r.elementId CREATE (e)-[:MENTIONED_IN {span: r.span, text: r.text}]->(el)`,
      { jobId, rows: mentions },
    );
    await cypher(
      client,
      `UNWIND $pairs AS p MATCH (x), (y) WHERE x.jobId = $jobId AND x.id = p.a AND y.jobId = $jobId AND y.id = p.b CREATE (x)-[:POSSIBLY_SAME_AS {position: p.position}]->(y)`,
      {
        jobId,
        pairs: possiblySameAs.map(([a, b], position) => ({ a, b, position })),
      },
    );
  });
}

/** The inverse of writeEntities: entities and pairs in the order written, each entity with its mentions in reading order. */
export async function readEntities(jobId: string): Promise<Entities> {
  return transaction(async (client) => {
    const rows = await cypher<[string, string, string, Span, string, string]>(
      client,
      `MATCH (e {jobId: $jobId})-[m:MENTIONED_IN]->(el) RETURN label(e), e.id, e.name, m.span, m.text, el.id ORDER BY e.position, m.span.offset`,
      { jobId },
      ["label", "id", "name", "span", "text", "elementId"],
    );
    const byId = new Map<string, Entity>();
    for (const [label, id, name, span, text, elementId] of rows) {
      const entity = byId.get(id) ?? {
        id,
        kind: toType(label) as EntityKind,
        name,
        mentions: [],
      };
      entity.mentions.push({ elementId, span, text });
      byId.set(id, entity);
    }
    const pairs = await cypher<[string, string]>(
      client,
      `MATCH (x {jobId: $jobId})-[p:POSSIBLY_SAME_AS]->(y) RETURN x.id, y.id ORDER BY p.position`,
      { jobId },
      ["a", "b"],
    );
    return { entities: [...byId.values()], possiblySameAs: pairs };
  });
}

/** Replaces the job's ABOUT edges: one per link, from a requirement node to an entity, with its `position` in the list. */
export async function writeLinks(jobId: string, links: Link[]): Promise<void> {
  await transaction(async (client) => {
    await cypher(client, `MATCH (c {jobId: $jobId})-[r:ABOUT]->() DELETE r`, {
      jobId,
    });
    await cypher(
      client,
      `UNWIND $rows AS r MATCH (c), (e) WHERE c.jobId = $jobId AND c.id = r.classificationId AND e.jobId = $jobId AND e.id = r.entityId CREATE (c)-[:ABOUT {position: r.position}]->(e)`,
      { jobId, rows: links.map((l, position) => ({ ...l, position })) },
    );
  });
}

/** The inverse of writeLinks, in the order written. */
export async function readLinks(jobId: string): Promise<Link[]> {
  const rows = await transaction((client) =>
    cypher<[string, string]>(
      client,
      `MATCH (c {jobId: $jobId})-[a:ABOUT]->(e) RETURN c.id, e.id ORDER BY a.position`,
      { jobId },
      ["classificationId", "entityId"],
    ),
  );
  return rows.map(([classificationId, entityId]) => ({
    classificationId,
    entityId,
  }));
}
