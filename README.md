# Pak

Pak (`@dark-factory/*`) is a software factory. A requirements PDF goes in, and verified software comes out, with every fact traced through a knowledge graph stored in Apache AGE on Postgres. The station that exists today is requirements engineering: parse the document, annotate what each span is, then resolve the things it names.

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
- `pnpm run test:integration` — integration tests (Azure and Postgres)
- `pnpm run parse <file.pdf> <outDir>`
- `pnpm run annotate <parsed.json> <outDir>`
- `pnpm run resolve <parsed.json> <annotate.json> <outDir>`
- `pnpm run pipeline <file.pdf> <outDir>` — parse, then annotate, then resolve
- `pnpm --filter web db:migrate` — apply SQL migrations

Packages: `packages/contracts`, `packages/parse`, `packages/annotate`, `packages/resolve`, `packages/knowledge-graph`, and `apps/web`. Steps share data through `packages/contracts` and export TypeScript source, so the commands above run without a prior build.
