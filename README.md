# Pak

Pak (`@dark-factory/*`) is a software factory. A requirements PDF goes in, and verified software comes out, with every fact traced through a knowledge graph stored in Apache AGE on Postgres. The station that exists today is requirements engineering: parse the document, then an engineer builds the SRS graph from what the source states.

The app is hosted on Azure. The graph stays in Postgres.

## Prerequisites

- Node.js 26.13.1 (Active LTS). `.nvmrc` pins it.
- pnpm 12.21.0, pinned by `packageManager` in the root `package.json`. Node does not ship Corepack; install pnpm with `npm install -g pnpm@12.21.0`.
- Postgres with Apache AGE, and Azure credentials in `.env`, when you run the web app or the integration tests. See `apps/web/README.md`.

## Setup

```bash
pnpm install
```

## Commands

Run these from the repo root:

- `pnpm run dev` — dev servers
- `pnpm run build` — build every package
- `pnpm run lint` — Biome
- `pnpm run check-types` — TypeScript
- `pnpm test` — unit tests, no network
- `pnpm run test:integration` — integration tests (Azure, Postgres, and the local engineer)
- `pnpm run parse <file.pdf> <outDir>`
- `pnpm --filter web db:migrate` — apply SQL migrations

The web app also needs the engineer process: `agent-sdk dev agents/engineer --port 3000`.

Packages: `packages/parse`, `packages/srs`, `packages/knowledge-graph`, `agents/engineer`, and `apps/web`.
