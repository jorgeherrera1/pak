# Parse run backend

Design for what happens after a user uploads one requirements PDF on the intake
screen and clicks Start run. Covers station 1, step 1 (Parse) only. Annotate and
the frontend are out of scope.

## Decisions

| Topic | Decision |
|---|---|
| Host | `apps/web` (Next.js), deployed to Azure App Service. Not Vercel. |
| Durable runtime | Vercel Workflow SDK, latest, with `@workflow/world-postgres` embedded in the Next.js server. |
| Database | Postgres. Holds the SDK's own tables and two of ours, via Drizzle (already a dependency of the Postgres world). |
| Files | Azure Blob Storage, one container. Local dev uses the real storage account through `.env`, same as Document Intelligence today. |
| Unit of work | One PDF, one document, one run. No batches. |
| Re-uploads | Every upload is a new document and a new run. Azure is always called. Nothing is cached or deduplicated. The sha256 is recorded so identical bytes are visible. |
| Provenance | Postgres rows plus Blob artifacts keyed by document id. No graph store until Resolve needs one. |
| Progress | Step-level: each step writes its own status row. No streaming. |
| API | Plain route handlers returning JSON. No Server Actions, no SAS URLs. |

## Contract

Three route handlers in `apps/web/app/api/`:

- `POST /api/documents`, multipart with one `file` field. Validates the upload
  (PDF magic bytes `%PDF-`, size cap of 50 MB), writes `source.pdf` to Blob,
  inserts the document with four pending steps, marks `upload` done, starts the
  workflow with the document id, and returns `{ id }` with status 202.
  Invalid uploads return 400 with `{ error }`.
- `GET /api/documents/:id`. Returns the document row and its steps ordered by
  position. 404 if unknown.
- `GET /api/documents/:id/artifacts/*path`. Streams the named blob with its
  content type. Valid paths are `source.pdf`, `analysis.json`, `parsed.json`,
  and `figures/<id>.png`. 404 if the blob does not exist. Only the document's
  own prefix is reachable.

## Data

Two Drizzle tables in `apps/web/lib/db/schema.ts`. Document and run are one
table because they are one to one and Annotate will append steps to the same
pipeline rather than start a second run.

```
documents
  id              uuid primary key
  filename        text
  size            integer
  sha256          text
  status          text   queued | running | done | failed
  error           text   null unless failed
  workflow_run_id text   null until the SDK run is started
  created_at      timestamptz
  finished_at     timestamptz null

steps
  id           uuid primary key
  document_id  uuid references documents on delete cascade
  name         text   upload | analyze | build | publish
  position     integer
  status       text   pending | running | done | failed
  error        text   null unless failed
  started_at   timestamptz null
  finished_at  timestamptz null
  unique (document_id, name)
```

Blob layout, one container named by `AZURE_STORAGE_CONTAINER`:

```
<documentId>/source.pdf
<documentId>/analysis.json
<documentId>/parsed.json
<documentId>/figures/<id>.png
```

Keyed by document id, never by sha256, so re-uploads cannot collide.

## Workflow

`apps/web/workflows/parse.ts` exports one `"use workflow"` function taking the
document id. It calls three `"use step"` functions in order:

1. `analyze`: read `source.pdf` from Blob, call Document Intelligence through
   `packages/parse`, write `analysis.json` and every figure PNG to Blob.
   Returns nothing; the result is too large to be a step return value.
2. `build`: read `analysis.json` from Blob, run `toParsedDocument`, write
   `parsed.json` to Blob. Returns element and warning counts.
3. `publish`: set the document status to done and `finished_at`.

`upload` is the fourth step name. The route handler performs it before the run
starts and records it as done so the step list is complete.

A helper `runStep(documentId, name, fn)` wraps each step body: it sets the step
row to running with `started_at`, runs `fn`, then sets done with `finished_at`,
or failed with the error message and rethrows. The workflow function sets the
document to running when it begins and to failed with the error message if any
step throws after the SDK's retries are exhausted. A document is done only
after publish.

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
DATABASE_URL                  postgres connection string, used by Drizzle
WORKFLOW_TARGET_WORLD         @workflow/world-postgres
WORKFLOW_POSTGRES_URL         same connection string, used by the SDK
AZURE_STORAGE_CONNECTION_STRING
AZURE_STORAGE_CONTAINER       documents
```

The Postgres world dispatches steps back into the app over HTTP on
`/.well-known/workflow/v1/flow`. The setting that tells it the app's own base
URL is confirmed during implementation from the installed package's docs and
added to this list. App Service must allow the app to call itself, which the
default configuration does.

One-time setup: the SDK's `bootstrap` command creates its tables, and
`drizzle-kit push` creates ours. Both are documented in `apps/web/README.md`.

## Errors

- Upload validation failures never create a document.
- Blob or database failures in the route handler return 500 and leave no
  document row; the handler writes the blob first and inserts the row last.
- Transient Azure or Blob failures inside a step use the SDK's default step
  retries. Errors that cannot succeed on retry, such as a rejected PDF, throw
  `FatalError` so the run fails immediately.
- After a failure the document keeps its `source.pdf` and any artifacts written
  so far; nothing is cleaned up, since the user re-uploads to retry.

## Testing

- `packages/parse`: existing unit tests pass unchanged. The integration test
  keeps comparing the live result with the recorded fixture.
- `apps/web` unit tests, no network: upload validation (magic bytes, size cap,
  missing file) and `runStep` (marks running, done, failed with message, and
  rethrows). The database is not mocked; these tests exercise the helper with
  an injected update function.
- `apps/web` integration test, `npm run test:integration`, needs credentials
  and a local Postgres: posts the fixture PDF to the create handler, polls the
  read handler until done or failed, asserts all four steps are done, downloads
  `parsed.json` through the artifact handler, and asserts it deep-equals
  `packages/parse/test/fixtures/parsed.json` ignoring `source.sha256` only if
  the fixture PDF differs. Runs locally, reported in the PR.

## Deferred on purpose

Graph store, dedupe by sha256, multiple files per run, streaming progress,
SAS URLs, a storage abstraction over Blob, a separate worker process,
artifact cleanup, authentication.
