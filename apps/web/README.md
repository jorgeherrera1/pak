## Vocabulary

A **job** moves through the **station** (Requirements engineering), which runs in **steps** (Parse, Engineer); each step is a sequence of **operations**: Parse: upload, parse; Engineer: engineer, check.

## Environment

Set these in the root `.env` (gitignored):

```
WORKFLOW_TARGET_WORLD=@workflow/world-postgres
WORKFLOW_POSTGRES_URL=postgres://localhost:5432/motivus_dev
AZURE_STORAGE_CONNECTION_STRING=<from the storage account>
AZURE_DI_ENDPOINT=https://<resource>.cognitiveservices.azure.com/
AZURE_API_KEY=<from the Document Intelligence resource>
AGENT_SDK_URL=http://127.0.0.1:3000
```

`WORKFLOW_TARGET_WORLD` tells the Workflow SDK to keep run state in Postgres instead of local
files; `WORKFLOW_POSTGRES_URL` is the connection string, read by both the SDK and Drizzle. The
worker dispatches work back to the app over HTTP and finds the app's port by itself. Files go
to the `jobs` container. `AZURE_API_KEY` and `AZURE_DI_ENDPOINT` are the parse step's Document
Intelligence credentials. `AGENT_SDK_URL` is the engineer process. The engineer also needs
`CURSOR_API_KEY` in the environment of `agent-sdk dev`.

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
pnpm dlx @workflow/world-postgres bootstrap
pnpm --filter web db:migrate
```

Our tables live in schema `dark_factory` of the `motivus_dev` database, created by the SQL
migrations in `apps/web/drizzle/` (after a schema change: `pnpm --filter web db:generate`,
commit the new folder, then `db:migrate`). The SDK's bootstrap creates its
own schemas there too: `workflow`, `workflow_drizzle`, and `graphile_worker`.

The migration `20261003062430_knowledge_graph` creates the graph; it needs the extension and the
search_path from the `psql` line above.

## Run

Run `pnpm run build` from the repo root once first, so the workspace packages have a `dist/` to resolve.

```bash
agent-sdk dev agents/engineer --port 3000
pnpm --filter web dev
```

The app serves on [http://localhost:3001](http://localhost:3001). The engineer serves on port 3000.

## Smoke test

With the dev server running:

```bash
curl -s -F file=@packages/parse/test/fixtures/prd-competencies.pdf http://localhost:3001/api/jobs
curl -s http://localhost:3001/api/jobs/<id> | jq '.status, [.operations[] | {name, status}]'
```

Expect 202 with an id. The job is done when parse, engineer, and check are done. The graph is in AGE; there is no result page yet.

## Integration test

`pnpm --filter web test:integration` needs the dev server running on port 3001, plus Postgres, the storage account, and Azure credentials in `.env`; the root `pnpm run test:integration` now runs it too. `pnpm --filter @dark-factory/knowledge-graph test:integration` needs only Postgres: it round-trips the recorded fixtures through the graph.
