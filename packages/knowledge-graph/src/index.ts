import type {
  Classification,
  ClassificationType,
} from "@dark-factory/annotate";
import type { Cell, Element, ParsedDocument } from "@dark-factory/parse";
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
    // ponytail: property matches with no index; add indexes on jobId and id when a write is measurably slow.
    await cypher(
      client,
      `MATCH (d:Document {jobId: $jobId}) UNWIND $roots AS r MATCH (c {jobId: $jobId, id: r}) CREATE (c)-[:IN]->(d)`,
      { jobId, roots },
    );
    await cypher(
      client,
      `UNWIND $edges AS e MATCH (c {jobId: $jobId, id: e.child}), (p {jobId: $jobId, id: e.parent}) CREATE (c)-[:IN]->(p)`,
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

/** Replaces the job's requirement nodes: one node per row, labeled by its type, with a FROM edge to the element it was quoted from. */
export async function writeRequirements(
  jobId: string,
  rows: Classification[],
): Promise<void> {
  const byLabel = new Map<string, Row[]>();
  for (const c of rows) {
    const label = toLabel(c.type);
    // Flat, with the element id alongside the node's own properties: AGE's SET takes a whole map, not a nested one.
    const row: Row = {
      elementId: c.elementId,
      jobId,
      id: c.id,
      text: c.text,
      span: c.span,
    };
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
        `UNWIND $rows AS r MATCH (e {jobId: $jobId, id: r.elementId}) CREATE (n:${label})-[:FROM]->(e) SET n = r REMOVE n.elementId`,
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
      const { id, text, span, category } = props as Pick<
        Classification,
        "id" | "text" | "span" | "category"
      >;
      return {
        id,
        type: toType(label),
        elementId,
        span,
        text,
        ...(category && { category }),
      };
    })
    .sort((a, b) => a.span.offset - b.span.offset);
}
