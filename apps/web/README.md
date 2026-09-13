## Vocabulary

A **job** moves through the **station** (Requirements engineering), which runs in **steps** (Parse, Annotate, Resolve); each step is a sequence of **operations** (upload, analyze, build, publish).

## Environment

Set these in the root `.env` (gitignored):

```
DATABASE_URL=postgres://localhost:5432/dark_factory
WORKFLOW_TARGET_WORLD=@workflow/world-postgres
AZURE_STORAGE_CONNECTION_STRING=<from the storage account>
AZURE_STORAGE_CONTAINER=jobs
```

## Setup

```bash
createdb dark_factory
az storage container create --name jobs --connection-string "$AZURE_STORAGE_CONNECTION_STRING"
npx --package=@workflow/world-postgres bootstrap
npm run db:push -w apps/web
```

## Run

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
