# AGENTS.md

Instructions for AI coding agents working in this repository. Read this before doing anything else.

## North star

**Dark Factory** is a software **dark factory**: requirements documents (e.g. an RFP) go in one end of an assembly line and working software comes out the other, with humans supervising the factory rather than working the stations. The first station is **requirements engineering**, which turns source documents into a knowledge graph.

## The assembly line

**Station 1 — Requirements engineering** (current focus). Turns a requirements document into a knowledge graph. Two steps:

1. **Parse** _(code)_ — fully deterministic; the document becomes a structured tree: sections, tables, reading order, exact character spans. Nothing is interpreted yet.
2. **Engineer** _(AI)_ — one agent reads that tree and builds the SRS graph: product, features, requirements, entities, and the relations the template names. Code validates the graph and stores it. The check is part of this step.

Later stations (design, implementation, …) are not yet defined. Don't build for them.

## Rules for AI functionality

- Deterministic work is code, never AI. AI output is validated before it crosses a step boundary. Every graph node cites an element id that exists and carries the source text.
- **No AI functionality without evals. Period.** Eval scenarios come from the human — ask for them, never invent them. Quality over quantity: a small set of real, curated scenarios beats a large synthetic one. Evals run as merge gates, same as tests.

## Repository layout

Turborepo monorepo, pnpm workspaces (`apps/*`, `packages/*`, `agents/*`), 100% TypeScript. Node 26.x (`.nvmrc`), pnpm as package manager (`packageManager`).

`packages/parse` is station 1, step 1 (Parse): PDF in, `ParsedDocument` out, via Azure Document Intelligence. It is real code, not scaffold.

`packages/srs` is the vocabulary. `docs/srs-template.html` is the source. One file, `packages/srs/src/vocabulary.ts`, holds the node types, id prefixes, fields, which side each type is on, the allowed parent, and the allowed relations. The tool schemas, the tools, the instructions, the check, and the graph writer import it.

`agents/engineer` is the requirements engineer, a Cursor Agent SDK agent. It reads the parsed document through its own tools and returns the graph as an `srs-graph` artifact. It does not touch Postgres. The model is `grok-4.7` with reasoning effort high, and built-in tools are off.

`packages/knowledge-graph` stores results in an Apache AGE graph `knowledge_graph` in the same Postgres. `writeDocument`/`readDocument` map a `ParsedDocument` to structure nodes (`Document`, `Section`, `Paragraph`, `Table`, `Cell`, `Figure`) with `IN` edges. `writeGraph`/`readGraph` map one run of the SRS graph onto that document: a `Run`, a `Product`, statement and entity nodes labeled by their template type, `PART_OF`, `CITES`, the template relations, and `SKIPPED`. Nothing is labeled by the process that produced it. AGE is loaded by the database, never by app code.

`apps/web` is Station 1's host: the Next.js app that receives a job (one requirements PDF), runs Parse, then Engineer and Check, durably on the Vercel Workflow SDK with a Postgres world, stores the PDF and figure images in Azure Blob and the results in the knowledge graph, and exposes `/api/jobs`. The engineer step talks to the agent over HTTP (`AGENT_SDK_URL`). `packages/ui` and the Tailwind and TypeScript config packages are scaffold inherited from the Turborepo starter — do not invest effort in them beyond keeping the build green.

## Commands

Run from the repo root:

- `pnpm install` — install dependencies
- `pnpm run dev` — run dev servers (via turbo)
- `pnpm run build` — build all workspaces
- `pnpm run lint` — Biome check all workspaces
- `pnpm run check-types` — typecheck all workspaces
- `pnpm run format` — format and apply safe Biome fixes
- `pnpm test` — unit tests, no network
- `pnpm run test:integration` — parse calls live Document Intelligence, knowledge-graph needs local Postgres, and `apps/web` needs the dev server on port 3001, the agent on port 3000 (`agent-sdk dev agents/engineer --port 3000`), the storage account, and credentials in `.env`. The engineer eval is `agent-sdk eval --dir agents/engineer` and is not a CI gate
- `pnpm run parse <file.pdf> <outDir>` — run the parse step on a PDF
- `pnpm --filter web db:migrate` — apply our SQL migrations (`db:generate` after a schema change)

## Definition of done

Work is not complete until all of these pass:

1. `pnpm run check-types`
2. `pnpm run lint`
3. `pnpm run build`
4. `pnpm test`. Write tests only for behavior that carries the product's business value: parsing, the SRS graph, the check, the job pipeline. No tests for coverage's sake: env-var guards, config checks and wiring get none, and a missing one is not a review finding.
5. `pnpm run test:integration` when you changed `packages/parse`, `packages/srs`, `packages/knowledge-graph`, `agents/engineer`, or their fixtures. It needs credentials (the knowledge-graph one needs only local Postgres), so it is not a CI gate; run it locally and report the result. The engineer eval is not a CI gate; paste its score table in the PR when you run it.

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

- **This is a prototype.** No users, no data to preserve, no backward compatibility. Existing code is the current best guess, not a constraint; each iteration aims for the right design, not the smallest diff.
- **Challenge the design first.** Before planning, ask whether the current architecture is right for the problem. If a task is awkward because of an earlier decision, say so and propose changing that decision, even if it means rewriting or deleting a package. A patch that works around a wrong design is a failure, not the safe choice.
- **Plan before code.** For any non-trivial change, present a short plan and get human approval before implementing. The plan names the most radical alternative you considered and why you do or don't recommend it.
- **Replace, don't layer.** When the design changes, rewrite the affected code to the new design. No compatibility shims, no migration paths, no old code kept alongside.
- **Small commits, not small ideas.** Commits stay small and reviewable; the change itself is as big as the right design needs.
- **No speculative abstraction.** Build only what the current station needs. No frameworks-in-waiting, no "we might need this later." This limits what you build, not what you question.
- **Existing tests and fixtures are off limits.** Do not modify, rename, or delete `*.test.ts`, `*.test.tsx`, or anything under `test/fixtures/` (the golden parses). New test files are allowed. The Claude Code and Cursor preToolUse hooks deny a direct edit or delete of one that is already tracked.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
