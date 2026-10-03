## Vocabulary

A **job** moves through the **station** (Requirements engineering), which runs in **steps** (Parse, Annotate); each step is a sequence of **operations**: Parse: upload, parse; Annotate: annotate.

## Environment

Set these in the root `.env` (gitignored):

```
WORKFLOW_TARGET_WORLD=@workflow/world-postgres
WORKFLOW_POSTGRES_URL=postgres://localhost:5432/motivus_dev
AZURE_STORAGE_CONNECTION_STRING=<from the storage account>
AZURE_DI_ENDPOINT=https://<resource>.cognitiveservices.azure.com/
AZURE_FOUNDRY_ENDPOINT=https://<resource>.services.ai.azure.com/openai/v1
AZURE_API_KEY=<from AI Foundry>
```

`WORKFLOW_TARGET_WORLD` tells the Workflow SDK to keep run state in Postgres instead of local
files; `WORKFLOW_POSTGRES_URL` is the connection string, read by both the SDK and Drizzle. The
worker dispatches work back to the app over HTTP and finds the app's port by itself. Files go
to the `jobs` container. `AZURE_API_KEY` is the one key of the AI Foundry resource, read by
both the parse step's Document Intelligence calls and the annotate step's model calls;
`AZURE_DI_ENDPOINT` is the URL the parse step calls and `AZURE_FOUNDRY_ENDPOINT` the URL the
annotate step calls.

Next.js loads `.env` from `apps/web`, so for local dev symlink the root file:
`ln -s ../../.env apps/web/.env` (it is gitignored).

## Setup

Results live in the knowledge graph, an Apache AGE graph named `knowledge_graph` in the same
database (AGE gives it a schema of that name). AGE must be loaded by the server, not by the app:
set `shared_preload_libraries = 'age'` in `postgresql.conf` (the Azure dev server already has it)
and restart before the steps below.

```bash
createdb motivus_dev
psql motivus_dev -c 'CREATE EXTENSION IF NOT EXISTS age' -c 'ALTER DATABASE motivus_dev SET search_path = ag_catalog, "$user", public'
az storage container create --name jobs --connection-string "$AZURE_STORAGE_CONNECTION_STRING"
npx --package=@workflow/world-postgres bootstrap
npm run db:migrate -w apps/web
```

Our tables live in schema `dark_factory` of the `motivus_dev` database, created by the SQL
migrations in `apps/web/drizzle/` (after a schema change: `npm run db:generate -w apps/web`,
commit the new file, then `db:migrate`). The SDK's bootstrap creates its
own schemas there too: `workflow`, `workflow_drizzle`, and `graphile_worker`.

The migration `0001_knowledge_graph` creates the graph; it needs the extension and the
search_path from the `psql` line above.

## Run

Run `npm run build` from the repo root once first, so `@dark-factory/parse` has a `dist/` to resolve.

```bash
npm run dev -w apps/web
```

Serves on [http://localhost:3001](http://localhost:3001).

## Smoke test

With the dev server running:

```bash
curl -s -F file=@packages/parse/test/fixtures/prd-competencies.pdf http://localhost:3001/api/jobs
curl -s http://localhost:3001/api/jobs/<id> | jq '.status, [.operations[] | {name, status}]'
```

Expect 202 with an id; the job is done only once Annotate finishes too, so expect status `done` and all three operations `done` after a couple of minutes. Open `/jobs/<id>/parse` and `/jobs/<id>/annotate` to read the results.

## Integration test

`npm run test:integration -w apps/web` needs the dev server running on port 3001, plus Postgres, the storage account, and Azure credentials in `.env`; the root `npm run test:integration` now runs it too. `npm run test:integration -w packages/knowledge-graph` needs only Postgres: it round-trips the recorded fixtures through the graph.
