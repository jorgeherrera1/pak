import type { Cell, Element, ParsedDocument } from "@dark-factory/parse";
import { cypher, type Row, transaction } from "./db.ts";

export { readGraph, readLatestGraph, writeGraph } from "./run.ts";

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
