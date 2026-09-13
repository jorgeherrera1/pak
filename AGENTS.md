# AGENTS.md

Instructions for AI coding agents working in this repository. Read this before doing anything else.

## North star

**Dark Factory** is a software **dark factory**: requirements documents (e.g. an RFP) go in one end of an assembly line and working software comes out the other, with humans supervising the factory rather than working the stations. The first station is **requirements engineering**, which turns source documents into a knowledge graph.

## The assembly line

**Station 1 — Requirements engineering** (current focus). Turns a requirements document into a knowledge graph in three steps:

1. **Parse** _(code)_ — the document becomes a structured tree: sections, tables, reading order, exact character spans. Nothing is interpreted yet.
2. **Annotate** _(AI)_ — spans get tagged with what they are (functional requirement, actor, mockup, …). Every annotation points at the exact text that produced it. Annotations are evidence, not fact.
3. **Resolve** _(code, AI for ambiguity)_ — annotations collapse into canonical entities and relations: the domain graph.

Later stations (design, implementation, …) are not yet defined. Don't build for them.

## Rules for AI functionality

- Deterministic work is code, never AI. AI output is validated before it crosses a step boundary. Every AI-produced fact stays traceable to its source span.
- **No AI functionality without evals. Period.** Eval scenarios come from the human — ask for them, never invent them. Quality over quantity: a small set of real, curated scenarios beats a large synthetic one. Evals run as merge gates, same as tests.

## Repository layout

Turborepo monorepo, npm workspaces (`apps/*`, `packages/*`), 100% TypeScript. Node >= 24, npm as package manager.

`packages/parse` is station 1, step 1 (Parse): PDF in, `ParsedDocument` out, via Azure Document Intelligence. It is real code, not scaffold.

`packages/annotate` is station 1, step 2 (Annotate): `ParsedDocument` in, grounded annotations out, via a `gpt-4o` deployment on Azure AI Foundry through the Vercel AI SDK. The vocabulary follows the IEEE 29148 SRS template. Every annotation is validated in code against the source text before it is emitted.

`apps/web` is Station 1's host: the Next.js app that receives a job (one requirements PDF), runs its Parse operations durably on the Vercel Workflow SDK with a Postgres world, stores artifacts in Azure Blob, and exposes `/api/jobs`. `packages/ui` and the Tailwind/ESLint/TS config packages are scaffold inherited from the Turborepo starter — do not invest effort in them beyond keeping the build green.

## Commands

Run from the repo root:

- `npm install` — install dependencies
- `npm run dev` — run dev servers (via turbo)
- `npm run build` — build all workspaces
- `npm run lint` — lint all workspaces
- `npm run check-types` — typecheck all workspaces
- `npm run format` — format with Prettier
- `npm test` — unit tests, no network
- `npm run test:integration` — parse the fixture PDF against live Azure and compare with the recording; `npm run test:integration -w apps/web` additionally needs the dev server running on port 3001, Postgres, the storage account, and Azure credentials in `.env`
- `npm run parse <file.pdf> <outDir>` — run the parse step on a PDF
- `npm run annotate <parsed.json> <outDir>` — run the annotate step on a parsed document
- `npm run pipeline <file.pdf> <outDir>` — parse then annotate
- `npm run db:push -w apps/web` — create or update our tables

Anything that touches Azure needs `AZURE_DI_ENDPOINT` and `AZURE_DI_KEY` (Document Intelligence) and `AZURE_API_KEY` (AI Foundry), read from a gitignored `.env` at the repo root. `apps/web` also needs `WORKFLOW_POSTGRES_URL`, `DATABASE_URL`, and `AZURE_STORAGE_CONNECTION_STRING` in the same `.env`. Never commit credentials.

`packages/parse/test/fixtures/analysis.json` and `parsed.json` are recorded Azure output. They change only by re-recording (run `test:integration`, copy `test/out/<sha256>/{analysis,parsed}.json` into `fixtures/`), never by hand, and the diff is reviewed like code. The same rule applies to `packages/annotate/test/fixtures/annotate-responses/` and `annotate.json`. `packages/annotate/test/fixtures/expected.json` is the eval ground truth and is written by a human only.

## Definition of done

Work is not complete until all of these pass:

1. `npm run check-types`
2. `npm run lint`
3. `npm run build`
4. `npm test`, including tests for the behavior you added or changed. If the package you touched has no test setup yet, standing one up is part of your task — not a reason to skip tests.
5. `npm run test:integration` when you changed `packages/parse`, `packages/annotate`, or their fixtures. It needs credentials, so it is not a CI gate; run it locally and report the result. For annotate this is also the eval: paste the precision/recall table in the PR.

Report results honestly: if a gate fails, say so and show the output.

## Git workflow

- **Never commit to `main`.** Every change starts from a fresh branch off latest `main`: `<type>/<short-slug>` (e.g. `feat/parse-tables`, `fix/span-offsets`, `chore/remove-scaffold`).
- **Commit early, commit small.** One logical change per commit, imperative mood ("Add table parser", not "Added" / "misc fixes"). The Definition of done gates apply to the branch before it's pushed, not to every intermediate commit.
- **Never rewrite pushed history.** No force-push, no amend/rebase of anything already on the remote. Rewriting local, unpushed commits is fine.
- **Push only when asked, or when opening a PR that was asked for.** Pushing publishes; it's not part of "save my work."
- **PRs go through Cursor Origin, not GitHub.** Use the `origin` CLI — see the `origin` skill (`.claude/skills/origin/SKILL.md`).
- **PRs are the unit of review.** Every PR: what changed, why, and the output of the Definition of done gates. Merging is a human decision — agents never merge, never enable auto-merge, never approve their own PRs.
- **Destructive git is off-limits without explicit human instruction:** `reset --hard` on shared branches, branch deletion, `push --force`, history filtering.

## How to work

- **Plan before code.** For any non-trivial change, present a short plan and get human approval before implementing.
- **Small, reviewable changes.** One concern per change; prefer incremental diffs over big-bang rewrites.
- **No speculative abstraction.** Build only what the current station needs. No frameworks-in-waiting, no "we might need this later."
