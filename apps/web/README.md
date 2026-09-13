## Vocabulary

A **job** moves through the **station** (Requirements engineering), which runs in **steps** (Parse, Annotate, Resolve); each step is a sequence of **operations** (upload, analyze, build, publish).

## Environment

Set these in the root `.env` (gitignored):

```
DATABASE_URL=postgres://localhost:5432/dark_factory
WORKFLOW_TARGET_WORLD=@workflow/world-postgres
WORKFLOW_POSTGRES_URL=postgres://localhost:5432/dark_factory
AZURE_STORAGE_CONNECTION_STRING=<from the storage account>
AZURE_STORAGE_CONTAINER=jobs
WORKFLOW_LOCAL_BASE_URL=http://localhost:3001
```

`DATABASE_URL` and `WORKFLOW_POSTGRES_URL` are the same connection string: Drizzle reads
`DATABASE_URL`, the Workflow SDK reads `WORKFLOW_POSTGRES_URL`. `WORKFLOW_LOCAL_BASE_URL` is the
app's own URL so the worker can dispatch work back to it; set it to `http://localhost:3001` for
local dev, leave it unset on App Service (`PORT` is set there instead).

Next.js loads `.env` from `apps/web`, so for local dev symlink the root file:
`ln -s ../../.env apps/web/.env` (it is gitignored).

## Setup

```bash
createdb dark_factory
az storage container create --name jobs --connection-string "$AZURE_STORAGE_CONNECTION_STRING"
npx --package=@workflow/world-postgres bootstrap
npm run db:push -w apps/web
```

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

Expect 202 with an id, then within about a minute status `done` and all four operations `done`.

## Integration test

`npm run test:integration -w apps/web` needs the dev server running on port 3001, plus Postgres, the storage account, and Azure credentials in `.env`; the root `npm run test:integration` now runs it too.
