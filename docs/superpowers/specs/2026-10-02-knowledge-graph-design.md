# Knowledge graph

Design for storing a job's results in a knowledge graph (Apache AGE on
Postgres) instead of JSON files in Blob, starting at Parse. Reverses the
"no graph store until Resolve needs one" decision of
`2026-09-13-parse-job-backend-design.md`. Also removes mention detection and
the Resolve step, which this graph would otherwise have to model.

## Vocabulary

One station, two steps, three operations. Every name below appears identically
in code, the canvas, URLs and prose.

| Concept              | Name                     | Code                                                    | Frontend                                             |
| -------------------- | ------------------------ | ------------------------------------------------------- | ---------------------------------------------------- |
| Station 1            | Requirements engineering | `apps/web`                                              | the whole app                                        |
| Step 1               | Parse                    | `packages/parse`                                        | first node on the canvas, page `/jobs/:id/parse`     |
| Step 2               | Engineer                 | `agents/engineer`, `packages/srs`                       | second node on the canvas                            |
| Parse's operations   | `upload`, `parse`        | `OPERATIONS.parse`                                      | rows inside the Parse node                           |
| Engineer's operations | `engineer`, `check`     | `OPERATIONS.engineer`                                   | rows inside the Engineer node                        |
| The knowledge graph  | the knowledge graph      | `packages/knowledge-graph`, AGE graph `knowledge_graph` | not shown yet                                        |
| Canvas layout        | the canvas               | `apps/web/lib/canvas.ts` (today `graph.ts`)             | `/jobs/:id`                                          |

The knowledge graph is not a step. Steps compute; the knowledge-graph package
stores, the way Blob does today. Each step's main operation carries the step's
name; vendor verbs (Azure's `analyze`) stay internal to the package. A step's
page shows that step's result to a human.

## Decisions

| Topic             | Decision                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| System of record  | The knowledge graph. No `analysis.json`, `parsed.json` or annotate JSON in Blob. Blob keeps only binary content: `source.pdf` and `figures/<id>.png`.                          |
| Caches            | None. A retry calls Azure again. Cost is optimized later.                                                                                                                      |
| In-memory form    | `ParsedDocument` is already a graph (ids, `parent`, order, spans into `content`). It stays the in-memory form; the package maps it to AGE and back. No second graph type.      |
| Node labels       | The SRS template's types, never the process that produced a node.                                                                                                              |
| Provenance        | Every statement and entity has a `CITES` edge to an element and carries `sourceText`. Elements have `IN` edges up to the `Document`.                                            |
| Graph layout      | One AGE graph `knowledge_graph`; one `(:Document {jobId})` roots each job's subgraph. No per-job graphs.                                                                       |
| AGE loading       | Belongs to the database, never to app code: `shared_preload_libraries = 'age'` on the server and `search_path` set on the database. The package runs plain `cypher()` SQL.     |
| Engineer          | The agent returns an `srs-graph` artifact. The check step validates it and then `writeGraph` stores it. The agent never opens Postgres.                                         |
| Package           | New `packages/knowledge-graph`, not `packages/parse`. Parse's contract stays "PDF in, `ParsedDocument` out, no I/O".                                                           |

## Sequencing

The document tree landed first. The SRS graph is written by the check step
after the engineer returns an artifact. There is no separate classification
store.

## `packages/knowledge-graph`

Depends on `pg`, `@dark-factory/parse` (types) and `@dark-factory/srs`.
Opens one `pg` pool on `WORKFLOW_POSTGRES_URL`.
No new environment variable, no session setup.

### Labels and edges

Structure, from `ParsedDocument`:

| ParsedDocument                  | AGE                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `source`, `content`, `warnings` | `(:Document {jobId, sha256, pages, content, warnings})`                                                                        |
| `Element` by `kind`             | `(:Section)`, `(:Paragraph)`, `(:Table)`, `(:Figure)`                                                                          |
| `Cell`                          | `(:Cell)`                                                                                                                      |
| element and cell fields         | properties, minus `parent` and `kind`, plus `jobId` and `position` (index in reading order; `order` is a Cypher reserved word) |
| `parent`                        | `(child)-[:IN]->(parent)`; root elements `-[:IN]->(:Document)`                                                                 |
| cell in table                   | `(cell)-[:IN]->(table)`                                                                                                        |

The SRS graph, from one accepted run. Labels come from `packages/srs`. A run hangs off the document with `(:Run)-[:OF]->(:Document)` and `(:Product)-[:PRODUCED_BY]->(:Run)`. Children use `PART_OF`. Citations use `CITES`. Template relations keep their names (`DEPENDS_ON`, `DERIVES`, and the rest). `(:Run)-[:SKIPPED {reason}]->(element)` marks a content element that states no requirement.

### API

```ts
writeDocument(jobId: string, doc: ParsedDocument): Promise<void>
readDocument(jobId: string): Promise<ParsedDocument | null>
writeGraph(jobId: string, graph: SrsGraph, createdAt?: string): Promise<void>
readGraph(runId: string): Promise<SrsGraph | null>
readLatestGraph(jobId: string): Promise<SrsGraph | null>
```

- Writes are parameterized `UNWIND $rows` Cypher in one transaction.
- Each write first deletes the job's existing nodes of its layer
  (`DETACH DELETE`), so a Workflow retry cannot duplicate.
- `readDocument` returns elements ordered by `position`, `parent` from the `IN`
  edge, cells nested in their table, and is the inverse of `writeDocument`:
  write then read yields a deep-equal `ParsedDocument`.
- `readGraph` is the inverse of `writeGraph` for one run. `readLatestGraph` returns the newest run for a job.

### Database setup

One-time, documented in the web README Setup, both local and Azure:

1. `shared_preload_libraries = 'age'` on the server (Azure already has it).
2. `ALTER DATABASE motivus_dev SET search_path = ag_catalog, "$user", public;`

One hand-written Drizzle migration: `SELECT create_graph('knowledge_graph');`.
The extension already exists on both servers; the migration does not create it.

## Workflow and operations

```
OPERATIONS = { parse: ["upload", "parse"], engineer: ["engineer", "check"] }
```

- `parse`: read `source.pdf` from Blob, call Document Intelligence, write
  figure PNGs to Blob, `toParsedDocument`, `writeDocument`.
- `engineer`: hand the parsed document to the agent and wait until its turn
  finishes. The agent does not write the database.
- `check`: read the `srs-graph` artifact, run the completeness check, and on
  success `writeGraph`. One follow-up is allowed. A second failure rejects the
  run.
- `runJob`: running → `parse` → `engineer` → `check` → done. The graph is the
  only thing that crosses a step boundary.

The create handler is unchanged except that `initialOperations` yields four
rows. `pnpm run parse` still writes local JSON and never touches the graph.

## Pages and API

- The canvas shows Parse and Engineer. Neither links to a result page.
- Artifact route allowlist: `source.pdf` and `figures/<id>.png` only.
- `GET /api/jobs/:id` returns the job and its operations.
- Accepted graphs are also stored in Blob at `<jobId>/runs/<runId>/graph.json`.

## Errors

- Missing `source.pdf` or missing `Document` for the job: `FatalError`.
- Azure, the agent, and Postgres failures: plain errors, the workflow retries.
  `writeDocument` and `writeGraph` replace the job's document or that run, so a
  retry does not duplicate.
- A check that still fails after one follow-up is `FatalError`. The gaps stay
  on the check operation.

## Testing

Critical tests only.

- `packages/knowledge-graph` integration test writes the recorded parse
  fixture and a small SRS graph, reads them back, and expects deep equality.
  Needs Postgres, so not a CI gate.
- The web integration test posts the competencies PDF and expects parse,
  engineer, and check to finish, with the parsed structure matching the
  fixture.

## Docs

Web README and AGENTS.md describe parse, then engineer and check.

## Deferred on purpose

Indexes on `jobId` and element `id`, a page that shows the graph, and deleting
a job's subgraph when a job is deleted.
