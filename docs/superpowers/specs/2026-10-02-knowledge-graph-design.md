# Knowledge graph

Design for storing a job's results in a knowledge graph (Apache AGE on
Postgres) instead of JSON files in Blob, starting at Parse. Reverses the
"no graph store until Resolve needs one" decision of
`2026-09-13-parse-job-backend-design.md`. Also removes mention detection and
the Resolve step, which this graph would otherwise have to model.

## Vocabulary

One station, two steps, three operations. Every name below appears identically
in code, the canvas, URLs and prose.

| Concept              | Name                     | Code                                                 | Frontend                                             |
| -------------------- | ------------------------ | ---------------------------------------------------- | ---------------------------------------------------- |
| Station 1            | Requirements engineering | `apps/web`                                           | the whole app                                        |
| Step 1               | Parse                    | `packages/parse`                                     | first node on the canvas, page `/jobs/:id/parse`     |
| Step 2               | Annotate                 | `packages/annotate`                                  | second node on the canvas, page `/jobs/:id/annotate` |
| Parse's operations   | `upload`, `parse`        | `OPERATIONS.parse`                                   | rows inside the Parse node                           |
| Annotate's operation | `annotate`               | `OPERATIONS.annotate`                                | row inside the Annotate node                         |
| The knowledge graph  | the knowledge graph      | `packages/knowledge-graph`, AGE graph `dark_factory` | not shown yet                                        |
| Canvas layout        | the canvas               | `apps/web/lib/canvas.ts` (today `graph.ts`)          | `/jobs/:id`                                          |

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
| Node labels       | The IEEE 29148 ontology, never the process that produced a node. No `Classification` or `Annotation` label.                                                                    |
| Provenance        | Every requirement node has a `FROM` edge to the element it was quoted from, with its span. Elements have `IN` edges up to the `Document`.                                      |
| Graph layout      | One AGE graph `dark_factory`; one `(:Document {jobId})` roots each job's subgraph. No per-job graphs.                                                                          |
| AGE loading       | Belongs to the database, never to app code: `shared_preload_libraries = 'age'` on the server and `search_path` set on the database. The package runs plain `cypher()` SQL.     |
| Mention detection | Deleted. Nothing consumes it. Entity resolution returns later as its own step with its own eval.                                                                               |
| Resolve step      | Deleted from the canvas and from `STEPS`.                                                                                                                                      |
| `ground`          | Folded into the `annotate` operation. It is the validation AI output must pass before crossing a step boundary; keeping it separate would persist unvalidated rows in between. |
| Package           | New `packages/knowledge-graph`, not `packages/parse`. Parse's contract stays "PDF in, `ParsedDocument` out, no I/O".                                                           |

## Sequencing

Two PRs, in order.

**PR 1, cleanup.** Pure deletion and renames, no graph code.

- `packages/annotate`: delete `mentions.ts`, `runMentions`, the `Mention`
  type, the mentions half of `ground` and its schema, the
  `annotate-responses/mentions` fixtures and the mentions tests. Rename
  `classify.ts` to `prompt.ts` (the prompt; `annotate.ts` already holds the orchestration), `runClassify` to `runAnnotate`,
  `annotate-responses/classify` to `annotate-responses/annotate`.
  `AnnotateResult` becomes `{ classifications, warnings }`.
- `apps/web`: `OPERATIONS.annotate = ["annotate"]`; the workflow runs one
  Annotate operation. Delete the mentions rendering from the Annotate page.
  Rename `lib/graph.ts` to `lib/canvas.ts`; `STEPS` loses Resolve and the
  `href` condition loses its Resolve exception.
- `scripts/pipeline.mts` and the README stop mentioning mentions.

PR 1 keeps Blob JSON. It lands first so PR 2's diff is only the graph.

**PR 2, the knowledge graph.** Everything below.

## `packages/knowledge-graph`

Depends on `pg`, `@dark-factory/parse` (types) and `@dark-factory/annotate`
(`TYPES`, `Classification`). Opens one `pg` pool on `WORKFLOW_POSTGRES_URL`.
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

Requirements, from `Classification`:

| Classification                   | AGE                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `type`                           | label: the `TYPES` entry in PascalCase (`functional-requirement` → `FunctionalRequirement`, 19 labels) |
| `id`, `text`, `span`, `category` | properties; `category` only on `NonFunctionalRequirement`                                              |
| `elementId`                      | `(req)-[:FROM]->(element)` where element `id` matches within the job's subgraph                        |

### API

```ts
writeDocument(jobId: string, doc: ParsedDocument): Promise<void>
readDocument(jobId: string): Promise<ParsedDocument | null>
writeRequirements(jobId: string, rows: Classification[]): Promise<void>
readRequirements(jobId: string): Promise<Classification[]>
```

- Writes are parameterized `UNWIND $rows` Cypher in one transaction.
- Each write first deletes the job's existing nodes of its layer
  (`DETACH DELETE`), so a Workflow retry cannot duplicate.
- `readDocument` returns elements ordered by `position`, `parent` from the `IN`
  edge, cells nested in their table, and is the inverse of `writeDocument`:
  write then read yields a deep-equal `ParsedDocument`.
- `readRequirements` maps the label back to its kebab-case `type`.

### Database setup

One-time, documented in the web README Setup, both local and Azure:

1. `shared_preload_libraries = 'age'` on the server (Azure already has it).
2. `ALTER DATABASE motivus_dev SET search_path = ag_catalog, "$user", public;`

One hand-written Drizzle migration: `SELECT create_graph('dark_factory');`.
The extension already exists on both servers; the migration does not create it.

## Workflow and operations

```
OPERATIONS = { parse: ["upload", "parse"], annotate: ["annotate"] }
```

- `parse`: read `source.pdf` from Blob, call Document Intelligence, write
  figure PNGs to Blob, `toParsedDocument`, `writeDocument`. Returns element and
  warning counts.
- `annotate`: `readDocument` (missing is a `FatalError`), `chunk`,
  `runAnnotate` on every chunk at once, `ground`, `writeRequirements`.
  Grounding warnings describe the run, not the document: they go in a new
  `warnings text[]` column on `operations`, written with the done status.
  Returns requirement and warning counts.
- `runJob`: running → `parse` → `annotate` → done. The graph is the only thing
  that crosses a step boundary; step return values are small counts.

The create handler is unchanged except that `initialOperations` yields three
rows. The parse and annotate CLIs keep writing local JSON as dev tools and
never touch the graph.

## Pages and API

- Parse page: `readDocument(id)` instead of Blob JSON; same `ParseReader`.
  The `parsed.json` link goes away.
- Annotate page: `readDocument` and `readRequirements`, warnings from the
  `annotate` operation row; same `AnnotateReader`. The `annotate.json` link
  goes away.
- Artifact route allowlist: `source.pdf` and `figures/<id>.png` only.
- `GET /api/jobs/:id` and the canvas are unchanged.

## Errors

- Missing `source.pdf` or missing `Document` for the job: `FatalError`.
- Azure, model and Postgres failures: plain errors, the SDK retries; exhausted
  retries fail the operation and the job. Both writes are delete-then-create,
  so retries are safe.
- Rows `ground` rejects become operation warnings, as before.

## Testing

Critical tests only.

- Add one: `test:integration -w packages/knowledge-graph` writes the recorded
  `packages/parse/test/fixtures/parsed.json` into the local database, reads it
  back, and expects deep equality. Needs Postgres, so not a CI gate.
- Update: the web unit test asserting six operation rows asserts three. The
  web integration test asserts three operations done, then calls
  `readDocument` and `readRequirements` and compares pages, element count and
  sha256 with the golden fixture, expecting at least one requirement.
- `packages/annotate`: PR 1 removes the mentions tests. The eval still needs
  the human-written `expected.json`, which does not exist; both PRs say so.

## Docs

Web README: vocabulary line, Setup gains the two server settings and the
migration, smoke test expects three operations. AGENTS.md: `packages/annotate`
paragraph drops mentions; a `packages/knowledge-graph` paragraph is added;
the Resolve step is removed from the assembly line description.

## Deferred on purpose

Indexes on `jobId` and element `id`, a page that shows the graph, Cypher-based
chunking, entity resolution as its own step, deleting a job's subgraph when a
job is deleted.
