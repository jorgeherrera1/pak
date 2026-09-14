# Parse job backend

Design for what happens after a user uploads one requirements PDF on the intake
screen and clicks Start. Covers Station 1 (Requirements engineering), step 1
(Parse) only. Annotate and the frontend are out of scope.

## Vocabulary

Sticky terms, used in code, tables, routes, and prose. They match AGENTS.md.

- **Assembly line**: the whole factory, requirements in, software out.
- **Station**: a group of steps. Station 1 is Requirements engineering.
- **Step**: one transformation inside a station. Parse, Annotate, Resolve.
- **Operation**: one unit of work inside a step. Parse has four: upload,
  analyze, build, publish.
- **Job**: the thing moving down the line. One job is one source document plus
  everything the stations produce from it.

## Decisions

| Topic           | Decision                                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Host            | `apps/web` (Next.js), deployed to Azure App Service. Not Vercel.                                                                             |
| Durable runtime | Vercel Workflow SDK, latest, with `@workflow/world-postgres` embedded in the Next.js server.                                                 |
| Database        | Postgres. Holds the SDK's own tables and two of ours, via Drizzle (already a dependency of the Postgres world).                              |
| Files           | Azure Blob Storage, one container. Local dev uses the real storage account through `.env`, same as Document Intelligence today.              |
| Unit of work    | One PDF, one job. No batches.                                                                                                                |
| Re-uploads      | Every upload is a new job. Azure is always called. Nothing is cached or deduplicated. The sha256 is recorded so identical bytes are visible. |
| Provenance      | Postgres rows plus Blob artifacts keyed by job id. No graph store until Resolve needs one.                                                   |
| Progress        | Operation-level: each operation writes its own status row. No streaming.                                                                     |
| API             | Plain route handlers returning JSON. No Server Actions, no SAS URLs.                                                                         |

## Contract

Three route handlers in `apps/web/app/api/`:

- `POST /api/jobs`, multipart with one `file` field. Validates the upload
  (PDF magic bytes `%PDF-`, size cap of 50 MB), writes `source.pdf` to Blob,
  inserts the job with four pending operations, marks `upload` done, starts
  the workflow with the job id, and returns `{ id }` with status 202.
  Invalid uploads return 400 with `{ error }`.
- `GET /api/jobs/:id`. Returns the job row and its operations ordered by
  position. 404 if unknown.
- `GET /api/jobs/:id/artifacts/*path`. Streams the named blob with its
  content type. Valid paths are `source.pdf`, `analysis.json`, `parsed.json`,
  and `figures/<id>.png`. 404 if the blob does not exist. Only the job's own
  prefix is reachable.

## Data

Two Drizzle tables in `apps/web/lib/db/schema.ts`. Operations carry their
step name so Annotate can append its own operations to the same job later.

```
jobs
  id              uuid primary key
  filename        text
  size            integer
  sha256          text
  status          text   queued | running | done | failed
  error           text   null unless failed
  workflow_run_id text   null until the SDK run is started
  created_at      timestamptz
  finished_at     timestamptz null

operations
  id           uuid primary key
  job_id       uuid references jobs on delete cascade
  step         text   parse
  name         text   upload | analyze | build | publish
  position     integer
  status       text   pending | running | done | failed
  error        text   null unless failed
  started_at   timestamptz null
  finished_at  timestamptz null
  unique (job_id, step, name)
```

Blob layout, one container named `jobs`:

```
<jobId>/source.pdf
<jobId>/analysis.json
<jobId>/parsed.json
<jobId>/figures/<id>.png
```

Keyed by job id, never by sha256, so re-uploads cannot collide.

## Workflow

`apps/web/workflows/parse.ts` exports one `"use workflow"` function
`parseJob(jobId)`. It calls three `"use step"` functions in order, one per
operation:

1. `analyze`: read `source.pdf` from Blob, call Document Intelligence through
   `packages/parse`, write `analysis.json` and every figure PNG to Blob.
   Returns nothing; the result is too large to be a step return value.
2. `build`: read `analysis.json` from Blob, run `toParsedDocument`, write
   `parsed.json` to Blob. Returns element and warning counts.
3. `publish`: set the job status to done and `finished_at`.

`upload` is the fourth operation. The route handler performs it before the run
starts and records it as done so the operation list is complete.

Note on words: the SDK calls its durable units "steps". In this codebase they
implement operations; the word step is reserved for Parse, Annotate, Resolve.

A helper `runOperation(jobId, name, fn)` wraps each operation body: it sets the
row to running with `started_at`, runs `fn`, then sets done with
`finished_at`, or failed with the error message and rethrows. The workflow
function sets the job to running when it begins and to failed with the error
message if any operation throws after the SDK's retries are exhausted. A job
is done only after publish.

### Change to `packages/parse`

`analyze(pdf)` stops writing to disk. It returns
`{ result: AnalyzeResultOutput, figures: { id: string; png: Uint8Array }[] }`.
The package exports `analyze` alongside `toParsedDocument`. The CLI in
`index.ts` keeps writing `analysis.json`, `figures/`, and `parsed.json` under
`<outDir>/<sha256>/` exactly as today, so the fixture recording flow and the
existing tests are unchanged.

## Configuration

Added to the gitignored root `.env` and to App Service settings:

```
WORKFLOW_TARGET_WORLD         @workflow/world-postgres (run state in Postgres, not local files)
WORKFLOW_POSTGRES_URL         postgres connection string, read by the SDK and by Drizzle
AZURE_STORAGE_CONNECTION_STRING
```

The Postgres world dispatches work back into the app over HTTP on
`/.well-known/workflow/v1/flow`. The worker detects the app's own port, so no base URL is configured. App Service must allow the app to call itself, which the
default configuration does.

One-time setup: the SDK's `bootstrap` command creates its tables, and
`drizzle-kit push` creates ours. Both are documented in `apps/web/README.md`.

## Errors

- Upload validation failures never create a job.
- Blob or database failures in the route handler return 500 and leave no job
  row; the handler writes the blob first and inserts the row last.
- Transient Azure or Blob failures inside an operation use the SDK's default
  retries. Errors that cannot succeed on retry, such as a rejected PDF, throw
  `FatalError` so the run fails immediately.
- After a failure the job keeps its `source.pdf` and any artifacts written so
  far; nothing is cleaned up, since the user re-uploads to retry.

## Testing

- `packages/parse`: existing unit tests pass unchanged. The integration test
  keeps comparing the live result with the recorded fixture.
- `apps/web` unit tests, no network: upload validation (magic bytes, size cap,
  missing file) and `runOperation` (marks running, done, failed with message,
  and rethrows). The database is not mocked; these tests exercise the helper
  with an injected update function.
- `apps/web` integration test, `npm run test:integration`, needs credentials
  and a local Postgres: posts the fixture PDF to the create handler, polls the
  read handler until done or failed, asserts all four operations are done,
  downloads `parsed.json` through the artifact handler, and asserts its
  `content` and element count equal `packages/parse/test/fixtures/parsed.json`
  (Azure output is not byte-stable, so the parse integration test compares the
  same way). Runs locally, reported in the PR.

## Deferred on purpose

Graph store, dedupe by sha256, multiple files per job, streaming progress,
SAS URLs, a storage abstraction over Blob, a separate worker process,
artifact cleanup, authentication.
