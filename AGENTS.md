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

The current contents (`apps/web`, `packages/ui`, and the Tailwind/ESLint/TS config packages) are scaffold inherited from the Turborepo starter. They will be repurposed or removed as the factory takes shape — do not invest effort in them beyond keeping the build green.

## Commands

Run from the repo root:

- `npm install` — install dependencies
- `npm run dev` — run dev servers (via turbo)
- `npm run build` — build all workspaces
- `npm run lint` — lint all workspaces
- `npm run check-types` — typecheck all workspaces
- `npm run format` — format with Prettier

## Definition of done

Work is not complete until all of these pass:

1. `npm run check-types`
2. `npm run lint`
3. `npm run build`
4. Tests for the behavior you added or changed. If the package you touched has no test setup yet, standing one up is part of your task — not a reason to skip tests.

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
