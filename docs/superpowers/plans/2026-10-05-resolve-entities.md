# Resolve Entities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Station 1's third step, Resolve, so the knowledge graph holds one node per entity the document talks about, an edge to every place it is named, and an edge from every classification to the entities it is about.

**Architecture:** Annotate is untouched. In the graph, a classification whose type is an entity kind is stored as a `Description` node, which frees the kind's label for the entity itself. A new `packages/resolve` has two operations, each one model call followed by a code check: `resolve` asks the model for the document's entities and their names and then locates every name in the text in code; `link` asks the model, chunk by chunk, which of those entities each classification is about, and code validates both ends. `packages/knowledge-graph` stores entities and links; the workflow in `apps/web` runs the two operations after Annotate.

**Tech Stack:** TypeScript, Node 24+, npm workspaces + Turborepo, Vercel AI SDK 7 with `@ai-sdk/azure` (`gpt-4o` on Azure AI Foundry), Zod 4, Vitest 5, Apache AGE on Postgres 18 through `pg`, Vercel Workflow SDK, Next.js 16.

**Spec:** `docs/superpowers/specs/2026-10-04-resolve-entities-design.md`

## Global Constraints

- Annotate's prompt, its 19 types, `AnnotateResult`, `Classification` and its fixtures do not change. `packages/parse` is untouched.
- One vocabulary: a **classification** in memory, a **requirement node** in the graph, an **entity**, a **mention**. Step **Resolve**, operations `resolve` and `link`, package `packages/resolve`. Do not introduce "statement" or any other new word in code, comments or docs.
- The entity kinds are exactly `product`, `user-class`, `data-entity`, `integration`, `imposed-technology`, `standard`, `glossary-term`.
- Graph names are exactly: node label `Description` with property `kind`; entity nodes labeled by their kind in PascalCase with properties `jobId`, `id`, `name`; edges `MENTIONED_IN {span, text}`, `POSSIBLY_SAME_AS`, `ABOUT`.
- The model never returns character offsets. Stored text is always the slice of `content` at the stored span, never the model's string. An entity exists only if at least one of its names is found in the text.
- When the model is unsure two names are one thing it reports two entities. Code never merges entities.
- No domain knowledge anywhere: prompts and unit tests use no word or example taken from the fixture document.
- The model stays `gpt-4o`, `temperature: 0`, `generateText` with `Output.array`. No agent, no retry loop, no embeddings, no vector index, no cache.
- Every graph write is delete-then-create, so a Workflow retry cannot duplicate. No migration: AGE creates labels on first use.
- AGE Cypher quirks that already bit this repo: `order` is a reserved word; an `UNWIND` variable must not share a name with a property it is matched against; `SET n = r` takes a whole flat map; `WHERE NOT p:Label` is a syntax error. Use the existing `cypher()` and `transaction()` helpers in `packages/knowledge-graph/src/index.ts`. Every query in this plan was run against local AGE 1.8.
- `expected.json`, `expected-entities.json` and `expected-links.json` are written by Jorge. Never generate them. Until they exist the evals print "recorded, not scored" and every `FLOOR` stays 0.
- Fixtures under `test/fixtures/` change only by recording a live run, never by hand.
- Tests cover business behavior only. No coverage-for-coverage tests, no tests for env guards or wiring.
- UI: the only change is the canvas's third node. No Resolve page, no new component.
- Git: never commit to `main`. Commit small, imperative mood, each commit message ending with the `Co-Authored-By` line the session provides. Do not push and do not open a PR until Jorge asks; when he does, use the `origin` skill, never `gh`.

## Review Focus

Inputs the spec implies but does not spell out. Each has a test in the task named.

1. The same characters belong to two elements, because Parse reports a figure and the paragraphs inside it: a name there is one mention, on the paragraph, not two. (Task 3)
2. The model lists the same thing twice, or the same name under two entities: the first row keeps the name and the repeated row is dropped, so the graph never holds two nodes for one name. (Task 3)
3. The model names an entity but lists no `names`, or chooses a `name` that is not in the text: the entity survives through whatever is found, and its stored name is the source's spelling. (Task 3)
4. The model returns a link for a classification id that is real but belongs to another chunk. Ids are sequential (`a1`, `a2`, ...), so an invented id is often a real one: the link is dropped. (Task 4)
5. A document where no entity is found, or a chunk with no classification: no model call is made for it and the job still finishes. (Task 5)

## Prerequisites for the executor

- The repo-root `.env` holds `AZURE_FOUNDRY_ENDPOINT`, `AZURE_API_KEY` and `WORKFLOW_POSTGRES_URL`. In a worktree it is missing: `ln -s /Users/jorge/Development/dark-factory/.env .env && ln -s ../../.env apps/web/.env` (both paths are gitignored).
- Local Postgres 18 is running with AGE preloaded and the `knowledge_graph` graph created (`apps/web/README.md`, Setup). `npm run test:integration -w packages/knowledge-graph` is the check.
- `npm --version` prints `11.19.1`, the version `package.json` pins. If npm fails with `EBADDEVENGINES`, the branch is behind `main`: merge `main` first.
- Workspace packages import each other through `dist/`. After changing a package's `src/`, run `npm run build -w packages/<name>` before testing a package that depends on it. Root commands (`npm test`, `npm run check-types`) build dependencies themselves through turbo.

---

# Part 1: `Description` nodes (PR 1)

Branch `feat/description-nodes`, cut from `feat/resolve-entities`, which holds the spec and this plan. No AI, no new package.

### Task 1: Store entity-kind classifications as `Description`

**Files:**

- Modify: `packages/annotate/src/types.ts` (add `ENTITY_KINDS`, `EntityKind`)
- Modify: `packages/annotate/src/index.ts` (export the vocabulary at runtime)
- Modify: `packages/knowledge-graph/src/index.ts` (imports, `writeRequirements`, `readRequirements`)
- Modify: `packages/knowledge-graph/test/round-trip.integration.test.ts`
- Modify: `apps/web/lib/vocabulary.ts` (one comment)
- Modify: `AGENTS.md` (one sentence)

**Interfaces:**

- Consumes: `Classification`, `ClassificationType`, `TYPES` from `packages/annotate/src/types.ts`; `cypher`, `transaction`, `toLabel`, `toType`, `Row` inside `packages/knowledge-graph/src/index.ts`.
- Produces: `ENTITY_KINDS` (readonly tuple of the seven kinds) and `EntityKind`, exported at runtime from `@dark-factory/annotate`. `writeRequirements(jobId, rows)` and `readRequirements(jobId)` keep their signatures; only the stored label changes.

- [ ] **Step 1: Branch, install, build**

```bash
git switch feat/resolve-entities
git switch -c feat/description-nodes
npm install
npm run build
```

Expected: the build passes for every workspace.

- [ ] **Step 2: Write the failing test**

In `packages/knowledge-graph/test/round-trip.integration.test.ts`, replace the import of `AnnotateResult` and add `pg`:

```ts
import pg from "pg";
import { ENTITY_KINDS, type AnnotateResult } from "@dark-factory/annotate";
```

(delete the old `import type { AnnotateResult } from "@dark-factory/annotate";` line) and append this test at the end of the file:

```ts
test("a classification of an entity kind is stored as a Description, and the kind's own label stays free", async () => {
  await writeDocument(jobId, doc);
  await writeRequirements(jobId, golden.classifications);
  const pool = new pg.Pool({
    connectionString: process.env.WORKFLOW_POSTGRES_URL,
  });
  const { rows } = await pool.query<{ label: string; kind: string | null }>(
    `SELECT * FROM cypher('knowledge_graph', $$ MATCH (r {jobId: '${jobId}'})-[:FROM]->() RETURN label(r), r.kind $$) AS (label agtype, kind agtype)`,
  );
  await pool.end();
  const stored = rows.map((r) => ({
    label: JSON.parse(r.label) as string,
    kind: r.kind === null ? null : (JSON.parse(r.kind) as string | null),
  }));

  const kinds = golden.classifications
    .map((c) => c.type)
    .filter((type) => (ENTITY_KINDS as readonly string[]).includes(type));
  expect(kinds.length).toBeGreaterThan(0);
  expect(
    stored
      .filter((s) => s.label === "Description")
      .map((s) => s.kind)
      .sort(),
  ).toEqual(kinds.sort());
  // "user-class" → "UserClass": the labels the entities themselves will carry.
  const entityLabels = ENTITY_KINDS.map((kind) =>
    kind.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase()),
  );
  expect(stored.filter((s) => entityLabels.includes(s.label))).toEqual([]);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:integration -w packages/knowledge-graph`
Expected: FAIL. `@dark-factory/annotate` has no `ENTITY_KINDS` export yet, so the file fails to load (a missing-export error) or the new test throws on `undefined`.

- [ ] **Step 4: Add the entity kinds to annotate**

In `packages/annotate/src/types.ts`, add directly after the `ClassificationType` line:

```ts
/**
 * The types that name a kind of thing the document refers to by name. The
 * other twelve name a kind of claim. A classification of one of these types
 * is a sentence about an entity, not the entity.
 */
export const ENTITY_KINDS = [
  "product",
  "user-class",
  "data-entity",
  "integration",
  "imposed-technology",
  "standard",
  "glossary-term",
] as const satisfies readonly ClassificationType[];
export type EntityKind = (typeof ENTITY_KINDS)[number];
```

In `packages/annotate/src/index.ts`, replace `export type * from "./types.ts";` with:

```ts
export * from "./types.ts";
```

Then:

```bash
npm run build -w packages/annotate
```

- [ ] **Step 5: Map entity kinds to `Description` in the graph**

In `packages/knowledge-graph/src/index.ts`, replace the first import statement (the `import type { Classification, ClassificationType } from "@dark-factory/annotate";` block) with:

```ts
import {
  ENTITY_KINDS,
  type Classification,
  type ClassificationType,
} from "@dark-factory/annotate";
```

and replace the whole of `writeRequirements` and `readRequirements`, including their doc comments, with:

```ts
/** Replaces the job's requirement nodes: one node per row with a FROM edge to the element it was quoted from, labeled by its type, or `Description` when the type is an entity kind. */
export async function writeRequirements(
  jobId: string,
  rows: Classification[],
): Promise<void> {
  const byLabel = new Map<string, Row[]>();
  for (const c of rows) {
    // A sentence about an entity is a Description; the kind's own label belongs to the entity.
    const describes = (ENTITY_KINDS as readonly string[]).includes(c.type);
    const label = describes ? "Description" : toLabel(c.type);
    // Flat, with the element id alongside the node's own properties: AGE's SET takes a whole map, not a nested one.
    const row: Row = {
      elementId: c.elementId,
      jobId,
      id: c.id,
      text: c.text,
      span: c.span,
    };
    if (describes) row.kind = c.type;
    if (c.category) row.category = c.category;
    byLabel.set(label, [...(byLabel.get(label) ?? []), row]);
  }
  await transaction(async (client) => {
    await cypher(
      client,
      `MATCH (r {jobId: $jobId})-[:FROM]->() DETACH DELETE r`,
      { jobId },
    );
    for (const [label, list] of byLabel)
      await cypher(
        client,
        `UNWIND $rows AS r MATCH (e {jobId: $jobId, id: r.elementId}) CREATE (n:${label})-[:FROM]->(e) SET n = r REMOVE n.elementId`,
        { jobId, rows: list },
      );
  });
}

/** The job's requirements in reading order, each with the id of the element it came FROM. */
export async function readRequirements(
  jobId: string,
): Promise<Classification[]> {
  const rows = await transaction((client) =>
    cypher<[string, Row, string]>(
      client,
      `MATCH (r {jobId: $jobId})-[:FROM]->(e) RETURN label(r), properties(r), e.id`,
      { jobId },
      ["label", "props", "elementId"],
    ),
  );
  return rows
    .map(([label, props, elementId]) => {
      const { id, text, span, category, kind } = props as Pick<
        Classification,
        "id" | "text" | "span" | "category"
      > & { kind?: ClassificationType };
      return {
        id,
        // A Description carries its type as `kind`; every other label is the type.
        type: kind ?? toType(label),
        elementId,
        span,
        text,
        ...(category && { category }),
      };
    })
    .sort((a, b) => a.span.offset - b.span.offset);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:integration -w packages/knowledge-graph`
Expected: PASS, 3 tests. "the recorded requirements survive a round trip" still passes, which proves `readRequirements` returns every classification with its original type.

- [ ] **Step 7: Correct the two places that describe the old behavior**

In `apps/web/lib/vocabulary.ts`, replace the comment above `ORDER`:

```ts
/** The vocabulary in its own order. Client components cannot import the package at runtime (its entry pulls in the model SDK), so the list is repeated here. */
```

In `AGENTS.md`, in the `packages/knowledge-graph` paragraph, replace

```
and `writeRequirements`/`readRequirements` map grounded classifications to nodes labeled by the IEEE 29148 type (`FunctionalRequirement`, `UserClass`, ...) with a `FROM` edge to the element they quote.
```

with

```
and `writeRequirements`/`readRequirements` map grounded classifications to nodes with a `FROM` edge to the element they quote, labeled by the IEEE 29148 type (`FunctionalRequirement`, `Assumption`, ...), or `Description` (with the type as its `kind`) when the type is one of the seven entity kinds: a sentence about a user class is not a user class.
```

- [ ] **Step 8: Commit**

```bash
git add packages/annotate/src packages/knowledge-graph apps/web/lib/vocabulary.ts AGENTS.md
git commit -m "Store entity-kind classifications as Description nodes"
```

### Task 2: Gates for PR 1

**Files:** none.

**Interfaces:**

- Consumes: everything Task 1 produced.
- Produces: a branch that passes the Definition of done, and a report.

- [ ] **Step 1: Run every gate**

```bash
npm run check-types
npm run lint
npm run build
npm test
npm run test:integration -w packages/knowledge-graph
npm run test:integration -w packages/annotate
```

Expected: all PASS. The last one is Annotate's live eval; AGENTS.md requires it because `packages/annotate` changed. It prints `fixtures/expected.json missing: recorded, not scored`. Do not copy its output into the fixtures: Annotate's fixtures do not change in this plan.

- [ ] **Step 2: Report**

Report to Jorge, without pushing: what changed (entity-kind classifications are `Description` nodes; `ENTITY_KINDS` exists), the output of each gate, and that Annotate's eval is still "recorded, not scored". Pushing and opening PR 1 happen when Jorge asks, through the `origin` skill.

---

# Part 2: Resolve (PR 2)

Branch `feat/resolve-entities`, with Part 1 in it.

### Task 3: `packages/resolve` and the entity check

**Files:**

- Modify: `packages/annotate/src/ground.ts` (export `fold` and `find`)
- Modify: `packages/annotate/src/index.ts` (export `fold`, `find`, `GUIDELINES`)
- Create: `packages/resolve/package.json`, `packages/resolve/tsconfig.json`, `packages/resolve/tsconfig.test.json`, `packages/resolve/eslint.config.mjs`
- Create: `packages/resolve/src/types.ts`
- Create: `packages/resolve/src/ground.ts`
- Test: `packages/resolve/test/ground.test.ts`

**Interfaces:**

- Consumes, from `@dark-factory/annotate`: `ENTITY_KINDS`, `EntityKind` (Task 1); `fold(text: string, base?: number): { folded: string; at: number[] }` and `find(hay: string, needle: string, from?: number, end?: number): number`, which this task exports. From `@dark-factory/parse`: `Span`.
- Produces: types `Mention`, `Entity`, `ResolveResult`, `Link`, `LinkResult` in `src/types.ts`; `entitySchema`, `EntityRow`, and `groundEntities(rows: EntityRow[], anchors: Map<string, Span[]>, content: string): ResolveResult` in `src/ground.ts`. Warning formats later tasks print but do not parse.

- [ ] **Step 1: Bring Part 1 into the branch**

```bash
git switch feat/resolve-entities
git merge --ff-only feat/description-nodes
```

If PR 1 was already merged into `main`, run `git fetch origin && git merge origin/main` instead.

- [ ] **Step 2: Export what Resolve reuses from annotate**

In `packages/annotate/src/ground.ts`, add `export` to the two helpers. `function fold(text: string, base = 0)` becomes `export function fold(text: string, base = 0)` and `function find(hay: string, needle: string, from = 0, end = hay.length)` becomes `export function find(hay: string, needle: string, from = 0, end = hay.length)`. Their bodies and comments do not change.

In `packages/annotate/src/index.ts`, replace `export { ground, type ClassificationRow } from "./ground.ts";` with:

```ts
export { find, fold, ground, type ClassificationRow } from "./ground.ts";
export { GUIDELINES } from "./guidelines.ts";
```

Then:

```bash
npm run build -w packages/annotate
```

- [ ] **Step 3: Scaffold the package**

`packages/resolve/package.json`:

```json
{
  "name": "@dark-factory/resolve",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "check-types": "tsc -p tsconfig.test.json",
    "lint": "eslint src test --max-warnings 0",
    "test": "vitest run --exclude \"**/*.integration.test.ts\"",
    "test:integration": "vitest run test/resolve.integration.test.ts --silent=false"
  },
  "dependencies": {
    "@ai-sdk/azure": "^4.0.63",
    "@dark-factory/annotate": "*",
    "@dark-factory/parse": "*",
    "ai": "^7.0.93",
    "zod": "^4.5.4"
  },
  "devDependencies": {
    "@dark-factory/eslint-config": "*",
    "@dark-factory/typescript-config": "*",
    "@types/node": "26.6.4",
    "eslint": "10.12.0",
    "typescript": "6.0.3",
    "vitest": "^5.0.0"
  }
}
```

`packages/resolve/tsconfig.json`:

```json
{
  "extends": "@dark-factory/typescript-config/base.json",
  "compilerOptions": {
    "lib": ["es2024"],
    "types": ["node"],
    "rootDir": "src",
    "outDir": "dist",
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src"]
}
```

`packages/resolve/tsconfig.test.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "rootDir": ".", "noEmit": true },
  "include": ["src", "test"]
}
```

`packages/resolve/eslint.config.mjs`:

```js
import { config } from "@dark-factory/eslint-config/base";

/** @type {import("eslint").Linter.Config} */
export default config;
```

`packages/resolve/src/types.ts`:

```ts
/** Output shape of the resolve module. The entity kinds are seven of annotate's types. */

import type { EntityKind } from "@dark-factory/annotate";
import type { Span } from "@dark-factory/parse";

/** One place an entity is named. `text` is the source's, at `span`. */
export type Mention = { elementId: string; span: Span; text: string };

/** A thing the document refers to by name. It exists only because its mentions do. */
export type Entity = {
  id: string;
  kind: EntityKind;
  /** The text of one of its mentions. */
  name: string;
  /** In reading order, never empty. */
  mentions: Mention[];
};

export type ResolveResult = {
  entities: Entity[];
  /** Pairs of entity ids that may be one thing. Doubt is stored, never guessed. */
  possiblySameAs: [string, string][];
  warnings: string[];
};

/** A classification is about an entity. */
export type Link = { classificationId: string; entityId: string };
export type LinkResult = { links: Link[]; warnings: string[] };
```

Then link the new workspace:

```bash
npm install
```

- [ ] **Step 4: Write the failing tests**

`packages/resolve/test/ground.test.ts`:

```ts
import { expect, test } from "vitest";
import { groundEntities, type EntityRow } from "../src/ground.ts";
import type { Entity } from "../src/types.ts";

const lines = [
  "Accounts",
  "The account holder opens an Account. Each account has one Account Holder.",
  "A ledger lists every account’s entries.",
  "The İZMİR branch keeps a ledger.",
  "figure: the account holder signs",
];
const content = lines.join("\n");
const span = (text: string) => [
  { offset: content.indexOf(text), length: text.length },
];
const anchors = new Map([
  ["paragraphs/0", span(lines[0]!)],
  ["paragraphs/1", span(lines[1]!)],
  ["paragraphs/2", span(lines[2]!)],
  ["paragraphs/3", span(lines[3]!)],
  // A figure covers the paragraph inside it, as Parse reports them.
  ["figures/0", span(lines[4]!)],
  ["paragraphs/4", span("the account holder signs")],
]);
const row = (
  kind: EntityRow["kind"],
  name: string,
  names: string[] = [name],
  possiblySameAs: string[] = [],
): EntityRow => ({ kind, name, names, possiblySameAs });
const holder = row("user-class", "account holder");
const account = row("data-entity", "account", ["account", "accounts"]);
const ledger = row("data-entity", "ledger");
const where = (e: Entity) => e.mentions.map((m) => [m.elementId, m.text]);

test("a name is found wherever it occurs, with the source's text and its exact span", () => {
  const { entities, warnings } = groundEntities(
    [account, row("integration", "İZMİR branch")],
    anchors,
    content,
  );
  expect(warnings).toEqual([]);
  expect(entities.map((e) => [e.id, e.kind, e.name])).toEqual([
    ["e1", "data-entity", "account"],
    ["e2", "integration", "İZMİR branch"],
  ]);
  expect(where(entities[0]!)).toEqual([
    ["paragraphs/0", "Accounts"],
    ["paragraphs/1", "account"],
    ["paragraphs/1", "Account"],
    ["paragraphs/1", "account"],
    ["paragraphs/1", "Account"],
    ["paragraphs/2", "account"],
    ["paragraphs/4", "account"],
  ]);
  for (const e of entities)
    for (const m of e.mentions)
      expect(content.slice(m.span.offset, m.span.offset + m.span.length)).toBe(
        m.text,
      );
});

test("of two overlapping names the longer takes the mention", () => {
  const { entities } = groundEntities([account, holder], anchors, content);
  expect(where(entities[1]!)).toEqual([
    ["paragraphs/1", "account holder"],
    ["paragraphs/1", "Account Holder"],
    ["paragraphs/4", "account holder"],
  ]);
  expect(where(entities[0]!)).toEqual([
    ["paragraphs/0", "Accounts"],
    ["paragraphs/1", "Account"],
    ["paragraphs/1", "account"],
    ["paragraphs/2", "account"],
  ]);
});

test("text a figure shares with the paragraph inside it is mentioned once, on the paragraph", () => {
  const { entities } = groundEntities([holder], anchors, content);
  expect(entities[0]!.mentions.map((m) => m.elementId)).toEqual([
    "paragraphs/1",
    "paragraphs/1",
    "paragraphs/4",
  ]);
});

test("a name that never occurs is dropped, and so is an entity left with no mention", () => {
  const { entities, warnings } = groundEntities(
    [
      holder,
      row("standard", "ISO 9001"),
      row("data-entity", "ledger", ["ledger", "general ledger"]),
    ],
    anchors,
    content,
  );
  expect(entities.map((e) => [e.id, e.name])).toEqual([
    ["e1", "account holder"],
    ["e2", "ledger"],
  ]);
  expect(warnings).toEqual([
    '"ISO 9001": no mention in the text, dropped from "ISO 9001"',
    '"general ledger": no mention in the text, dropped from "ledger"',
    '"ISO 9001": no mention in the text, entity dropped',
  ]);
});

test("a name two rows claim stays with the first, and a row that repeats an entity is dropped", () => {
  const { entities, warnings } = groundEntities(
    [account, ledger, row("glossary-term", "Account", ["account", "Accounts"])],
    anchors,
    content,
  );
  expect(entities.map((e) => [e.id, e.kind])).toEqual([
    ["e1", "data-entity"],
    ["e2", "data-entity"],
  ]);
  expect(warnings).toEqual([
    '"Account": already a name of "account", dropped from "Account"',
    '"account": already a name of "account", dropped from "Account"',
    '"Accounts": already a name of "account", dropped from "Account"',
    '"Account": no mention in the text, entity dropped',
  ]);
});

test("the name is the source's spelling of the model's choice, or of the most used name when the choice is not in the text", () => {
  const { entities } = groundEntities(
    [
      row("user-class", "ACCOUNT HOLDER", ["account holder"]),
      row("data-entity", "Customer Account", ["accounts", "account"]),
      // The model named the entity but listed no names.
      row("data-entity", "Ledger", []),
    ],
    anchors,
    content,
  );
  expect(entities.map((e) => e.name)).toEqual([
    "account holder",
    "Account",
    "ledger",
  ]);
});

test("possiblySameAs becomes pairs of entity ids, and a name that is not another entity is dropped", () => {
  const { possiblySameAs, warnings } = groundEntities(
    [
      row("data-entity", "ledger", ["ledger"], ["account", "nobody", "ledger"]),
      row("data-entity", "account", ["account"], ["ledger"]),
    ],
    anchors,
    content,
  );
  expect(possiblySameAs).toEqual([["e1", "e2"]]);
  expect(warnings).toEqual([
    '"ledger": possiblySameAs "nobody" is not another entity, dropped',
    '"ledger": possiblySameAs "ledger" is not another entity, dropped',
  ]);
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm test -w packages/resolve`
Expected: FAIL, the test file cannot import `../src/ground.ts`.

- [ ] **Step 6: Implement the entity check**

`packages/resolve/src/ground.ts`:

```ts
import { ENTITY_KINDS, find, fold } from "@dark-factory/annotate";
import type { Span } from "@dark-factory/parse";
import { z } from "zod";
import type { Entity, Mention, ResolveResult } from "./types.ts";

/** What the model returns for `resolve`. Names, never offsets. */
export const entitySchema = z.object({
  kind: z.enum(ENTITY_KINDS),
  name: z.string(),
  names: z.array(z.string()),
  possiblySameAs: z.array(z.string()),
});
export type EntityRow = z.infer<typeof entitySchema>;

/** Two names are the same name when they fold to the same text. */
const key = (name: string) => fold(name).folded.trim();
const quoted = (s: string) => JSON.stringify(s);
/** "e12" → 12, "a3" → 3: ids sort by their number. */
const num = (id: string) => Number(id.slice(1));

/**
 * Model rows in, grounded entities out. The model supplies names; code finds
 * every place each name occurs, and an entity exists only if one does. The
 * stored text is always the source's, never the model's. This is the step
 * boundary AI output must cross.
 */
export function groundEntities(
  rows: EntityRow[],
  anchors: Map<string, Span[]>,
  content: string,
): ResolveResult {
  const warnings: string[] = [];

  // A name belongs to the first row that lists it.
  const owner = new Map<string, { row: number; spelled: string }>();
  rows.forEach((row, i) => {
    for (const name of [row.name, ...row.names]) {
      const k = key(name);
      const first = owner.get(k)?.row;
      if (!k || first === i) continue;
      if (first === undefined) owner.set(k, { row: i, spelled: name });
      else
        warnings.push(
          `${quoted(name)}: already a name of ${quoted(rows[first]!.name)}, dropped from ${quoted(row.name)}`,
        );
    }
  });

  // Every occurrence of every name in every quotable element.
  type Hit = Mention & { row: number; name: string; size: number };
  const hits: Hit[] = [];
  for (const [elementId, spans] of anchors) {
    const size = spans.reduce((sum, s) => sum + s.length, 0);
    for (const s of spans) {
      const { folded, at } = fold(
        content.slice(s.offset, s.offset + s.length),
        s.offset,
      );
      for (const [name, { row }] of owner)
        for (
          let i = find(folded, name);
          i >= 0;
          i = find(folded, name, i + 1)
        ) {
          const offset = at[i]!;
          const length = at[i + name.length - 1]! + 1 - offset;
          const text = content.slice(offset, offset + length);
          hits.push({
            row,
            name,
            size,
            elementId,
            span: { offset, length },
            text,
          });
        }
    }
  }

  // Longest first, so "account holder" is never also a mention of "account";
  // then the smallest element, so text a figure shares with the paragraphs
  // inside it is mentioned once, on the paragraph.
  const taken = new Uint8Array(content.length);
  const kept = hits
    .toSorted(
      (a, b) =>
        b.span.length - a.span.length || a.size - b.size || a.row - b.row,
    )
    .filter(({ span }) => {
      const range = taken.subarray(span.offset, span.offset + span.length);
      if (range.some(Boolean)) return false;
      range.fill(1);
      return true;
    });

  const found = new Set(kept.map((h) => h.name));
  for (const [name, { row, spelled }] of owner)
    if (!found.has(name))
      warnings.push(
        `${quoted(spelled)}: no mention in the text, dropped from ${quoted(rows[row]!.name)}`,
      );

  const mentionsOf = Map.groupBy(kept, (h) => h.row);
  const idOf = new Map<number, string>();
  const entities: Entity[] = [];
  rows.forEach((row, i) => {
    const mine = (mentionsOf.get(i) ?? []).toSorted(
      (a, b) => a.span.offset - b.span.offset,
    );
    if (!mine.length) {
      warnings.push(
        `${quoted(row.name)}: no mention in the text, entity dropped`,
      );
      return;
    }
    // The model's choice when it survived, otherwise the name the text uses most.
    const byName = Map.groupBy(mine, (h) => h.name);
    const named =
      byName.get(key(row.name)) ??
      [...byName.values()].toSorted((a, b) => b.length - a.length)[0]!;
    const id = `e${entities.length + 1}`;
    idOf.set(i, id);
    entities.push({
      id,
      kind: row.kind,
      name: named[0]!.text,
      mentions: mine.map(({ elementId, span, text }) => ({
        elementId,
        span,
        text,
      })),
    });
  });

  const pairs = new Map<string, [string, string]>();
  rows.forEach((row, i) => {
    const a = idOf.get(i);
    if (!a) return;
    for (const other of row.possiblySameAs) {
      const b = idOf.get(owner.get(key(other))?.row ?? -1);
      if (!b || b === a) {
        warnings.push(
          `${quoted(row.name)}: possiblySameAs ${quoted(other)} is not another entity, dropped`,
        );
        continue;
      }
      const pair: [string, string] = num(a) < num(b) ? [a, b] : [b, a];
      pairs.set(pair.join("|"), pair);
    }
  });

  return {
    entities,
    possiblySameAs: [...pairs.values()].toSorted(
      (x, y) => num(x[0]) - num(y[0]) || num(x[1]) - num(y[1]),
    ),
    warnings,
  };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -w packages/resolve`
Expected: PASS, 7 tests.

- [ ] **Step 8: Typecheck, lint, commit**

```bash
npm run check-types -w packages/resolve
npm run lint -w packages/resolve
git add packages/annotate/src packages/resolve package-lock.json
git commit -m "Add packages/resolve with the entity check"
```

Expected: both commands pass before the commit.

### Task 4: The link check

**Files:**

- Modify: `packages/resolve/src/ground.ts` (two import statements, one appended block)
- Test: `packages/resolve/test/links.test.ts`

**Interfaces:**

- Consumes: `Entity`, `Link`, `LinkResult` from `src/types.ts`; `ENTITY_KINDS`, `Classification` from `@dark-factory/annotate`; the private `num` helper already in `src/ground.ts`.
- Produces: `linkSchema`, `LinkRow` (`{ classificationId: string; entityIds: string[] }`), `LinkAnswer` (`{ asked: Classification[]; rows: LinkRow[] }`, one per chunk), and `groundLinks(answers: LinkAnswer[], entities: Entity[]): LinkResult`. Links come back sorted by classification number, then entity number.

- [ ] **Step 1: Write the failing tests**

`packages/resolve/test/links.test.ts`:

```ts
import type { Classification } from "@dark-factory/annotate";
import { expect, test } from "vitest";
import { groundLinks } from "../src/ground.ts";
import type { Entity } from "../src/types.ts";

const entities = [
  { id: "e1", kind: "user-class", name: "account holder", mentions: [] },
  { id: "e2", kind: "data-entity", name: "account", mentions: [] },
] satisfies Entity[];
const c = (
  id: string,
  type: Classification["type"],
  elementId = "paragraphs/1",
): Classification => ({
  id,
  type,
  elementId,
  span: { offset: 0, length: 1 },
  text: "x",
});

test("links are kept once, in order, when the classification was asked about and the entity exists", () => {
  const { links, warnings } = groundLinks(
    [
      {
        asked: [c("a2", "functional-requirement"), c("a1", "feature")],
        rows: [
          { classificationId: "a2", entityIds: ["e2", "e1", "e2"] },
          { classificationId: "a1", entityIds: ["e2"] },
          { classificationId: "a2", entityIds: ["e1"] },
        ],
      },
    ],
    entities,
  );
  expect(warnings).toEqual([]);
  expect(links).toEqual([
    { classificationId: "a1", entityId: "e2" },
    { classificationId: "a2", entityId: "e1" },
    { classificationId: "a2", entityId: "e2" },
  ]);
});

test("a link to a classification of another chunk, or to an entity that does not exist, is dropped", () => {
  const { links, warnings } = groundLinks(
    [
      {
        asked: [c("a1", "feature")],
        // a3 is real, but this chunk was never shown it.
        rows: [{ classificationId: "a3", entityIds: ["e1"] }],
      },
      {
        asked: [c("a3", "feature", "paragraphs/3")],
        rows: [{ classificationId: "a3", entityIds: ["e9", "e2"] }],
      },
    ],
    entities,
  );
  expect(links).toEqual([{ classificationId: "a3", entityId: "e2" }]);
  expect(warnings).toEqual([
    "a3: not a classification of this chunk, its links dropped",
    "a3: unknown entity e9, link dropped",
  ]);
});

test("a sentence Annotate labeled with an entity kind but Resolve linked to no entity of that kind is reported", () => {
  const { links, warnings } = groundLinks(
    [
      {
        asked: [
          c("a1", "data-entity"),
          c("a2", "user-class"),
          c("a3", "standard"),
        ],
        rows: [
          { classificationId: "a1", entityIds: ["e1"] },
          { classificationId: "a2", entityIds: ["e1"] },
        ],
      },
    ],
    entities,
  );
  expect(links).toHaveLength(2);
  expect(warnings).toEqual([
    "a1: labeled data-entity, linked to no data-entity entity",
    "a3: labeled standard, linked to no standard entity",
  ]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w packages/resolve`
Expected: FAIL, `groundLinks` is not exported from `../src/ground.ts`.

- [ ] **Step 3: Implement the link check**

In `packages/resolve/src/ground.ts`, replace the first and the last import statement with:

```ts
import {
  ENTITY_KINDS,
  find,
  fold,
  type Classification,
} from "@dark-factory/annotate";
```

```ts
import type {
  Entity,
  Link,
  LinkResult,
  Mention,
  ResolveResult,
} from "./types.ts";
```

and append to the end of the file:

```ts
/** What the model returns for `link`. */
export const linkSchema = z.object({
  classificationId: z.string(),
  entityIds: z.array(z.string()),
});
export type LinkRow = z.infer<typeof linkSchema>;

/** One chunk's exchange with the model: the classifications it was asked about, and its answer. */
export type LinkAnswer = { asked: Classification[]; rows: LinkRow[] };

/**
 * Model rows in, links out. A link survives only when the model was asked
 * about that classification in that chunk and the entity exists: ids are
 * sequential, so an invented one is often a real one from elsewhere.
 */
export function groundLinks(
  answers: LinkAnswer[],
  entities: Entity[],
): LinkResult {
  const warnings: string[] = [];
  const kindOf = new Map<string, string>(entities.map((e) => [e.id, e.kind]));
  const seen = new Set<string>();
  const links: Link[] = [];
  for (const { asked, rows } of answers) {
    const ids = new Set(asked.map((c) => c.id));
    for (const { classificationId, entityIds } of rows) {
      if (!ids.has(classificationId)) {
        warnings.push(
          `${classificationId}: not a classification of this chunk, its links dropped`,
        );
        continue;
      }
      for (const entityId of entityIds) {
        if (!kindOf.has(entityId)) {
          warnings.push(
            `${classificationId}: unknown entity ${entityId}, link dropped`,
          );
          continue;
        }
        const k = `${classificationId}|${entityId}`;
        if (seen.has(k)) continue;
        seen.add(k);
        links.push({ classificationId, entityId });
      }
    }
    // Annotate says this sentence describes an entity of a kind; Resolve linked none of that kind.
    for (const c of asked) {
      if (!(ENTITY_KINDS as readonly string[]).includes(c.type)) continue;
      if (
        !links.some(
          (l) =>
            l.classificationId === c.id && kindOf.get(l.entityId) === c.type,
        )
      )
        warnings.push(
          `${c.id}: labeled ${c.type}, linked to no ${c.type} entity`,
        );
    }
  }
  links.sort(
    (a, b) =>
      num(a.classificationId) - num(b.classificationId) ||
      num(a.entityId) - num(b.entityId),
  );
  return { links, warnings };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w packages/resolve`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
npm run check-types -w packages/resolve
npm run lint -w packages/resolve
git add packages/resolve
git commit -m "Add the link check to resolve"
```

### Task 5: What the model reads

**Files:**

- Create: `packages/resolve/src/inputs.ts`
- Create: `packages/resolve/test/doc.ts`
- Test: `packages/resolve/test/inputs.test.ts`

**Interfaces:**

- Consumes: `chunk(doc: ParsedDocument): string[]` and `Classification` from `@dark-factory/annotate`; `Entity` from `src/types.ts`. `chunk` renders every quotable element as a line starting with `[<elementId>] `, and every anchor appears in exactly one chunk.
- Produces: `resolveInput(doc: ParsedDocument): string` and `linkInputs(doc: ParsedDocument, classifications: Classification[], entities: Entity[]): { asked: Classification[]; text: string }[]`. The test helper `test/doc.ts` exports `doc` and `classifications`, the recorded fixtures of Parse and Annotate.

- [ ] **Step 1: Add the fixture loader**

`packages/resolve/test/doc.ts`:

```ts
import type { AnnotateResult } from "@dark-factory/annotate";
import type { ParsedDocument } from "@dark-factory/parse";
import { readFileSync } from "node:fs";

const fixture = (path: string) =>
  JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));

/** Parse's and Annotate's recordings of the one fixture document. Re-record via their test:integration. */
export const doc: ParsedDocument = fixture("parse/test/fixtures/parsed.json");
export const { classifications }: AnnotateResult = fixture(
  "annotate/test/fixtures/annotate.json",
);
```

- [ ] **Step 2: Write the failing tests**

`packages/resolve/test/inputs.test.ts`:

```ts
import { expect, test } from "vitest";
import { linkInputs } from "../src/inputs.ts";
import type { Entity } from "../src/types.ts";
import { classifications, doc } from "./doc.ts";

const entity: Entity = {
  id: "e1",
  kind: "data-entity",
  name: "Thing",
  mentions: [
    {
      elementId: "paragraphs/0",
      span: { offset: 0, length: 5 },
      text: "Thing",
    },
    {
      elementId: "paragraphs/1",
      span: { offset: 9, length: 6 },
      text: "things",
    },
    {
      elementId: "paragraphs/2",
      span: { offset: 20, length: 5 },
      text: "Thing",
    },
  ],
};

test("every classification is asked about in exactly one link input, beside the entity list and its own text", () => {
  const inputs = linkInputs(doc, classifications, [entity]);
  expect(inputs.flatMap((i) => i.asked.map((c) => c.id)).sort()).toEqual(
    classifications.map((c) => c.id).sort(),
  );
  for (const { asked, text } of inputs) {
    expect(text).toContain("# Entities\ne1 | data-entity | Thing; things\n");
    for (const c of asked) {
      expect(text).toContain(`\n${c.id} | ${c.type} | [${c.elementId}] | `);
      expect(text.split("# Text\n")[1]).toContain(`[${c.elementId}] `);
    }
  }
});

test("a chunk with no classification, and a document with no entity, cost no model call", () => {
  expect(linkInputs(doc, classifications.slice(0, 1), [entity])).toHaveLength(
    1,
  );
  expect(linkInputs(doc, classifications, [])).toEqual([]);
  expect(linkInputs(doc, [], [entity])).toEqual([]);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -w packages/resolve`
Expected: FAIL, the test file cannot import `../src/inputs.ts`.

- [ ] **Step 4: Implement the inputs**

`packages/resolve/src/inputs.ts`:

```ts
import { chunk, type Classification } from "@dark-factory/annotate";
import type { ParsedDocument } from "@dark-factory/parse";
import type { Entity } from "./types.ts";

/** What `runResolve` reads: the document as the anchored lines Annotate reads, in one piece. */
// ponytail: the whole document in one model call; a per-chunk candidate pass and one merge call when a real document outgrows the context window.
export const resolveInput = (doc: ParsedDocument): string =>
  chunk(doc).join("\n");

/** What `runLink` reads, one per chunk that holds a classification: the entity list, that chunk's classifications, and the chunk. */
export function linkInputs(
  doc: ParsedDocument,
  classifications: Classification[],
  entities: Entity[],
): { asked: Classification[]; text: string }[] {
  if (!entities.length) return [];
  const list = entities.map((e) => {
    const names = new Set([e.name, ...e.mentions.map((m) => m.text)]);
    return `${e.id} | ${e.kind} | ${[...names].join("; ")}`;
  });
  return chunk(doc).flatMap((text) => {
    const asked = classifications.filter((c) =>
      text.includes(`[${c.elementId}] `),
    );
    if (!asked.length) return [];
    const lines = asked.map(
      (c) =>
        `${c.id} | ${c.type} | [${c.elementId}] | ${c.text.replace(/\s+/g, " ")}`,
    );
    return [
      {
        asked,
        text: `# Entities\n${list.join("\n")}\n\n# Classifications\n${lines.join("\n")}\n\n# Text\n${text}`,
      },
    ];
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -w packages/resolve`
Expected: PASS, 12 tests.

- [ ] **Step 6: Commit**

```bash
npm run check-types -w packages/resolve
npm run lint -w packages/resolve
git add packages/resolve
git commit -m "Build the inputs the resolve and link calls read"
```

### Task 6: Eval scoring

**Files:**

- Create: `packages/resolve/test/score.ts`
- Test: `packages/resolve/test/score.test.ts`

**Interfaces:**

- Consumes: `fold` from `@dark-factory/annotate`.
- Produces: `Named` (`{ kind: string; names: string[] }`), `WantLink` (`{ elementId: string; type: string; entity: string }`), `GotLink` (`{ elementId: string; type: string; names: string[] }`), `scoreEntities(got: Named[], want: Named[])` returning `{ found: { precision, recall }, grouped: { precision, recall }, kinds }`, and `scoreLinks(got: GotLink[], want: WantLink[], key: Named[])` returning `{ tp, fp, fn, precision, recall }`. Task 7's eval uses all of them.

The eval gates AI quality, so its arithmetic gets one hand-computed test. The names in the test are placeholders on purpose.

- [ ] **Step 1: Write the failing test**

`packages/resolve/test/score.test.ts`:

```ts
import { expect, test } from "vitest";
import { scoreEntities, scoreLinks, type Named } from "./score.ts";

const want: Named[] = [
  { kind: "user-class", names: ["alpha", "alfa"] },
  { kind: "data-entity", names: ["beta", "betas"] },
  { kind: "data-entity", names: ["gamma"] },
];

test("entities are scored on names found, names grouped and kinds", () => {
  const got: Named[] = [
    // One key entity split in two, the second with the wrong kind.
    { kind: "user-class", names: ["Alpha"] },
    { kind: "glossary-term", names: ["alfa"] },
    // Two key entities merged.
    { kind: "data-entity", names: ["beta", "betas", "gamma"] },
    // Not in the key.
    { kind: "standard", names: ["delta"] },
  ];
  const s = scoreEntities(got, want);
  expect(s.found).toEqual({ precision: 5 / 6, recall: 1 });
  // alpha 1, alfa 1, beta 2/3, betas 2/3, gamma 1/3
  expect(s.grouped.precision).toBeCloseTo((1 + 1 + 2 / 3 + 2 / 3 + 1 / 3) / 5);
  // alpha 1/2, alfa 1/2, beta 1, betas 1, gamma 1
  expect(s.grouped.recall).toBeCloseTo((0.5 + 0.5 + 1 + 1 + 1) / 5);
  expect(s.kinds).toBe(4 / 5);
  expect(scoreEntities(want, want)).toEqual({
    found: { precision: 1, recall: 1 },
    grouped: { precision: 1, recall: 1 },
    kinds: 1,
  });
});

test("links are scored as element, type and entity, the entity matched by any shared name", () => {
  const s = scoreLinks(
    [
      { elementId: "paragraphs/1", type: "feature", names: ["ALFA", "x"] },
      { elementId: "paragraphs/1", type: "feature", names: ["delta"] },
      { elementId: "paragraphs/2", type: "feature", names: ["betas"] },
    ],
    [
      { elementId: "paragraphs/1", type: "feature", entity: "alpha" },
      { elementId: "paragraphs/2", type: "feature", entity: "gamma" },
    ],
    want,
  );
  expect(s).toEqual({ tp: 1, fp: 2, fn: 1, precision: 1 / 3, recall: 1 / 2 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w packages/resolve`
Expected: FAIL, the test file cannot import `./score.ts`.

- [ ] **Step 3: Implement the scoring**

`packages/resolve/test/score.ts`:

```ts
import { fold } from "@dark-factory/annotate";

/** An entity as the answer key writes it, and as a run is reduced to for scoring. */
export type Named = { kind: string; names: string[] };

const key = (name: string) => fold(name).folded.trim();
const ratio = (a: number, b: number) => a / (b || 1);
/** name → index of the entity that has it. */
const index = (entities: Named[]) =>
  new Map(
    entities.flatMap((e, i) => e.names.map((name) => [key(name), i] as const)),
  );

/**
 * Three scores over names. `found`: did the run report the key's names.
 * `grouped`: B-cubed over the names both sides have, i.e. for each name, how
 * much of its entity on one side is its entity on the other. `kinds`: the
 * share of those names whose entity has the key's kind.
 */
export function scoreEntities(got: Named[], want: Named[]) {
  const g = index(got);
  const w = index(want);
  const shared = [...g.keys()].filter((name) => w.has(name));
  const group = (side: Map<string, number>, name: string) =>
    shared.filter((other) => side.get(other) === side.get(name));
  let precision = 0;
  let recall = 0;
  let kinds = 0;
  for (const name of shared) {
    const mine = group(g, name);
    const theirs = group(w, name);
    const both = mine.filter((other) => theirs.includes(other)).length;
    precision += both / mine.length;
    recall += both / theirs.length;
    if (got[g.get(name)!]!.kind === want[w.get(name)!]!.kind) kinds++;
  }
  return {
    found: {
      precision: ratio(shared.length, g.size),
      recall: ratio(shared.length, w.size),
    },
    grouped: {
      precision: ratio(precision, shared.length),
      recall: ratio(recall, shared.length),
    },
    kinds: ratio(kinds, shared.length),
  };
}

/** A link as the answer key writes it: the classification by element and type, the entity by any one of its names. */
export type WantLink = { elementId: string; type: string; entity: string };
/** A run's link: the same, with every name the run's entity has. */
export type GotLink = { elementId: string; type: string; names: string[] };

/** Precision and recall of (element, type, entity) triples. A run's entity is the key entity it shares a name with. */
export function scoreLinks(
  got: GotLink[],
  want: WantLink[],
  keyEntities: Named[],
) {
  const w = index(keyEntities);
  const entity = (names: string[]) => {
    for (const name of names) {
      const i = w.get(key(name));
      if (i !== undefined) return String(i);
    }
    // Not in the key: it can only be a false positive.
    return `?${key(names[0] ?? "")}`;
  };
  const g = new Set(
    got.map((l) => `${l.elementId}|${l.type}|${entity(l.names)}`),
  );
  const k = new Set(
    want.map((l) => `${l.elementId}|${l.type}|${entity([l.entity])}`),
  );
  const tp = [...g].filter((triple) => k.has(triple)).length;
  return {
    tp,
    fp: g.size - tp,
    fn: k.size - tp,
    precision: ratio(tp, g.size),
    recall: ratio(tp, k.size),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w packages/resolve`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
npm run check-types -w packages/resolve
npm run lint -w packages/resolve
git add packages/resolve
git commit -m "Score resolve runs against the answer keys"
```

### Task 7: The model calls, the CLI, and the first recording

**Files:**

- Create: `packages/resolve/src/prompts.ts`
- Create: `packages/resolve/src/resolve.ts`
- Create: `packages/resolve/src/index.ts`
- Create: `packages/resolve/test/resolve.integration.test.ts`
- Create: `packages/resolve/test/replay.test.ts`
- Create by recording: `packages/resolve/test/fixtures/resolve-responses/entities.json`, `packages/resolve/test/fixtures/resolve-responses/link/<i>.json`, `packages/resolve/test/fixtures/resolve.json`
- Modify: `package.json` (root, one script)
- Modify: `scripts/pipeline.mts`

**Interfaces:**

- Consumes: `entitySchema`, `linkSchema`, `groundEntities`, `groundLinks`, `EntityRow`, `LinkRow` (Tasks 3 and 4); `resolveInput`, `linkInputs` (Task 5); the scoring functions (Task 6); `ENTITY_KINDS`, `GUIDELINES`, `anchors` from `@dark-factory/annotate`.
- Produces: `runResolve(text: string): Promise<EntityRow[]>`, `runLink(text: string): Promise<LinkRow[]>`, and `resolve(doc: ParsedDocument, classifications: Classification[], outDir: string): Promise<ResolveResult & { links: Link[] }>`. The package entry `@dark-factory/resolve` exports every type in `src/types.ts` plus `groundEntities`, `groundLinks`, `EntityRow`, `LinkAnswer`, `LinkRow`, `linkInputs`, `resolveInput`, `resolve`, `runLink`, `runResolve`. `resolve.json` has the shape `{ entities, possiblySameAs, links, warnings }`, which Task 8 reads.

- [ ] **Step 1: Write the live test and eval**

`packages/resolve/test/resolve.integration.test.ts`:

```ts
/**
 * Live run against Azure AI Foundry, plus the eval: entities and links scored
 * against `fixtures/expected-entities.json` and `fixtures/expected-links.json`,
 * which are written by a human, never generated. Needs AZURE_FOUNDRY_ENDPOINT
 * and AZURE_API_KEY in the repo-root .env.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { resolve } from "../src/resolve.ts";
import { classifications, doc } from "./doc.ts";
import {
  scoreEntities,
  scoreLinks,
  type Named,
  type WantLink,
} from "./score.ts";

const env = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);

const out = fileURLToPath(new URL("./out/", import.meta.url));
/** An answer key, or undefined until a human has written it. */
function key<T>(name: string): T | undefined {
  const file = new URL(`./fixtures/${name}`, import.meta.url);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
}

// Raised by a human after reading the first scored run. 0 means "record, don't gate yet".
const FLOOR = 0;

test("live resolve and eval", { timeout: 600_000 }, async () => {
  rmSync(out, { recursive: true, force: true });
  const { entities, possiblySameAs, links, warnings } = await resolve(
    doc,
    classifications,
    out,
  );

  const namesOf = new Map(
    entities.map((e) => [e.id, [...new Set(e.mentions.map((m) => m.text))]]),
  );
  const mentions = entities.reduce((sum, e) => sum + e.mentions.length, 0);
  const linked = new Set(
    links.map((l) => `${l.classificationId}|${l.entityId}`),
  );
  // A classification whose own text names an entity the model did not link it to.
  const unlinked = classifications.flatMap((c) =>
    entities
      .filter(
        (e) =>
          !linked.has(`${c.id}|${e.id}`) &&
          e.mentions.some(
            (m) =>
              m.span.offset >= c.span.offset &&
              m.span.offset + m.span.length <= c.span.offset + c.span.length,
          ),
      )
      .map((e) => `${c.id} names ${JSON.stringify(e.name)}`),
  );
  console.log(
    `${entities.length} entities, ${mentions} mentions, ${possiblySameAs.length} possibly-same pairs; ${links.length} links, ${unlinked.length} named but not linked; ${warnings.length} warnings`,
  );
  for (const e of entities)
    console.log(`  ${e.id} ${e.kind}: ${namesOf.get(e.id)!.join("; ")}`);
  for (const [a, b] of possiblySameAs)
    console.log(`  possibly same: ${a} ${b}`);
  for (const w of warnings) console.log(`  warning: ${w}`);
  for (const u of unlinked) console.log(`  not linked: ${u}`);
  expect(entities.length).toBeGreaterThan(0);

  const wantEntities = key<{ entities: Named[] }>("expected-entities.json");
  if (!wantEntities) {
    console.log(
      "fixtures/expected-entities.json missing: recorded, not scored",
    );
    return;
  }
  const scores = scoreEntities(
    entities.map((e) => ({ kind: e.kind, names: namesOf.get(e.id)! })),
    wantEntities.entities,
  );
  console.table({
    "names found": scores.found,
    "names grouped": scores.grouped,
  });
  console.log(`kinds right: ${scores.kinds}`);
  for (const [name, { precision, recall }] of Object.entries({
    "names found": scores.found,
    "names grouped": scores.grouped,
  })) {
    expect(precision, `${name} precision`).toBeGreaterThanOrEqual(FLOOR);
    expect(recall, `${name} recall`).toBeGreaterThanOrEqual(FLOOR);
  }
  expect(scores.kinds, "kinds").toBeGreaterThanOrEqual(FLOOR);

  const wantLinks = key<{ links: WantLink[] }>("expected-links.json");
  if (!wantLinks) {
    console.log(
      "fixtures/expected-links.json missing: links recorded, not scored",
    );
    return;
  }
  const byId = new Map(classifications.map((c) => [c.id, c]));
  const linkScores = scoreLinks(
    links.map((l) => {
      const c = byId.get(l.classificationId)!;
      return {
        elementId: c.elementId,
        type: c.type,
        names: namesOf.get(l.entityId)!,
      };
    }),
    wantLinks.links,
    wantEntities.entities,
  );
  console.table({ links: linkScores });
  expect(linkScores.precision, "links precision").toBeGreaterThanOrEqual(FLOOR);
  expect(linkScores.recall, "links recall").toBeGreaterThanOrEqual(FLOOR);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:integration -w packages/resolve`
Expected: FAIL, the test file cannot import `../src/resolve.ts`.

- [ ] **Step 3: Write the two prompts**

`packages/resolve/src/prompts.ts`:

```ts
import { ENTITY_KINDS, GUIDELINES } from "@dark-factory/annotate";

/** Instructions for `resolve`: the whole document in, one row per entity out. */
export const resolvePrompt = `You list the entities in a software requirements document (an RFP or similar): the things the document refers to by name, so that everything it says about one thing can later be found together.

You receive the whole document as lines. Lines starting with \`##\` are section headings. Every other line starts with an anchor like \`[paragraphs/12]\` or \`[tables/0/cells/3]\`; the anchors are not part of the text.

An entity is a thing the document refers to by name and that is one of the kinds below. A sentence, a requirement, a goal or a description of behavior is never an entity, however important it is.

Return one row per entity with:

- \`kind\`: one of the kinds below.
- \`names\`: every name the document uses for this entity, each copied verbatim from the text: every spelling, and the singular and the plural when both occur. One to four words each, never a sentence.
- \`name\`: the one of those names the document uses most.
- \`possiblySameAs\`: the \`name\` of every other entity in your answer that may be this same thing; empty when there is none.

Rules:

- Report each thing once. Put two names under one entity only when the document makes clear they mean the same thing: it defines one as the other, or uses them interchangeably for the same thing.
- When you are unsure whether two names mean the same thing, report two entities and name each in the other's \`possiblySameAs\`. Never guess a merge.
- A name belongs to one entity. Never list the same name under two entities.
- Sample values that only illustrate a thing, and text a screen displays, are not entities.
- Skip pronouns and generic words that name nothing in particular.
- Do not invent names. A name that is not in the text is discarded.

The guidelines below were written for labeling sentences. Here, use each one's definition, its "Not this" and its examples to decide the kind of a thing.

${ENTITY_KINDS.map((kind) => `## ${kind}\n\n${GUIDELINES[kind]}`).join("\n\n")}
`;

/** Instructions for `link`: one chunk, its classifications and the entity list in, one row per classification out. */
export const linkPrompt = `You connect labeled statements from a software requirements document (an RFP or similar) to the entities they are about.

You receive three parts:

- \`# Entities\`: one line per entity, as \`id | kind | names\`. These are the only entities there are.
- \`# Classifications\`: one line per labeled statement, as \`id | type | [anchor] | text\`.
- \`# Text\`: the part of the document the statements come from. Lines starting with \`##\` are section headings; every other line starts with its anchor.

Return one row per classification with:

- \`classificationId\`: its id, copied from the list.
- \`entityIds\`: the ids of the entities the statement is about; empty when it is about none of them.

A statement is about an entity when:

- it names the entity, by any of its names;
- it refers to the entity with a pronoun or a phrase such as "it", "they" or "that record", and the text makes clear which entity is meant;
- it sits under a heading, or in a table row or a list, that names the entity it describes.

Rules:

- Use only ids from the two lists. Never invent an id.
- Return every classification exactly once.
- Link what the statement is about, not everything nearby: an entity named only on a neighboring line does not count.
- When you are unsure whether a statement is about an entity, leave that entity out.
`;
```

- [ ] **Step 4: Write the model calls and the CLI's orchestration**

`packages/resolve/src/resolve.ts`:

```ts
import { createAzure } from "@ai-sdk/azure";
import { anchors, type Classification } from "@dark-factory/annotate";
import type { ParsedDocument } from "@dark-factory/parse";
import { Output, generateText } from "ai";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import {
  entitySchema,
  groundEntities,
  groundLinks,
  linkSchema,
  type EntityRow,
  type LinkRow,
} from "./ground.ts";
import { linkInputs, resolveInput } from "./inputs.ts";
import { linkPrompt, resolvePrompt } from "./prompts.ts";
import type { Link, ResolveResult } from "./types.ts";

/** Azure AI Foundry deployment name. */
const MODEL = "gpt-4o";

async function run<T>(
  instructions: string,
  text: string,
  element: z.ZodType<T>,
): Promise<T[]> {
  // Read per call, not at import: the integration test loads .env after importing this module.
  const baseURL = process.env.AZURE_FOUNDRY_ENDPOINT;
  if (!baseURL) throw new Error("AZURE_FOUNDRY_ENDPOINT is not set");
  const { output } = await generateText({
    model: createAzure({ baseURL })(MODEL),
    output: Output.array({ element }),
    temperature: 0,
    instructions,
    prompt: text,
  });
  return output;
}

/** The whole document in, the model's entity rows out. Calls the model every time. */
export const runResolve = (text: string): Promise<EntityRow[]> =>
  run(resolvePrompt, text, entitySchema);

/** One link input in, the model's link rows out. Calls the model every time. */
export const runLink = (text: string): Promise<LinkRow[]> =>
  run(linkPrompt, text, linkSchema);

/**
 * ParsedDocument and its classifications in, entities and links out. Every
 * run calls the model; nothing is reused between runs. Everything lands in
 * `<outDir>/<sha256>/`: the raw responses in `resolve/entities.json` and
 * `resolve/link/<i>.json`, the grounded result in `resolve.json`.
 */
export async function resolve(
  doc: ParsedDocument,
  classifications: Classification[],
  outDir: string,
): Promise<ResolveResult & { links: Link[] }> {
  const dir = join(outDir, doc.source.sha256);
  await mkdir(join(dir, "resolve", "link"), { recursive: true });
  const rows = await runResolve(resolveInput(doc));
  await writeFile(
    join(dir, "resolve", "entities.json"),
    JSON.stringify(rows, null, 2),
  );
  const { entities, possiblySameAs, warnings } = groundEntities(
    rows,
    anchors(doc),
    doc.content,
  );
  // ponytail: all chunks in flight at once; add a concurrency cap if Azure rate limits bite.
  const answers = await Promise.all(
    linkInputs(doc, classifications, entities).map(
      async ({ asked, text }, i) => {
        const rows = await runLink(text);
        await writeFile(
          join(dir, "resolve", "link", `${i}.json`),
          JSON.stringify(rows, null, 2),
        );
        return { asked, rows };
      },
    ),
  );
  const linked = groundLinks(answers, entities);
  const result = {
    entities,
    possiblySameAs,
    links: linked.links,
    warnings: [...warnings, ...linked.warnings],
  };
  await writeFile(join(dir, "resolve.json"), JSON.stringify(result, null, 2));
  return result;
}
```

`packages/resolve/src/index.ts`:

```ts
import type { AnnotateResult } from "@dark-factory/annotate";
import type { ParsedDocument } from "@dark-factory/parse";
import { readFile } from "node:fs/promises";
import { resolve } from "./resolve.ts";

export type * from "./types.ts";
export {
  groundEntities,
  groundLinks,
  type EntityRow,
  type LinkAnswer,
  type LinkRow,
} from "./ground.ts";
export { linkInputs, resolveInput } from "./inputs.ts";
export { resolve, runLink, runResolve } from "./resolve.ts";

if (import.meta.main) {
  const [parsedPath, annotatePath, outDir] = process.argv.slice(2);
  if (!parsedPath || !annotatePath || !outDir) {
    console.error(
      "usage: node src/index.ts <parsed.json> <annotate.json> <outDir>",
    );
    process.exit(1);
  }
  const doc: ParsedDocument = JSON.parse(await readFile(parsedPath, "utf8"));
  const { classifications }: AnnotateResult = JSON.parse(
    await readFile(annotatePath, "utf8"),
  );
  const { entities, links, warnings } = await resolve(
    doc,
    classifications,
    outDir,
  );
  console.log(
    `${entities.length} entities, ${links.length} links, ${warnings.length} warnings`,
  );
}
```

- [ ] **Step 5: Add the CLI command and extend the pipeline script**

In the root `package.json`, add after the `"annotate"` script:

```json
    "resolve": "node --env-file-if-exists=.env packages/resolve/src/index.ts",
```

Replace the whole of `scripts/pipeline.mts` with:

```ts
import { annotate } from "../packages/annotate/src/index.ts";
import { parse } from "../packages/parse/src/index.ts";
import { resolve } from "../packages/resolve/src/index.ts";

const [pdfPath, outDir] = process.argv.slice(2);
if (!pdfPath || !outDir) {
  console.error("usage: node scripts/pipeline.mts <file.pdf> <outDir>");
  process.exit(1);
}
const doc = await parse(pdfPath, outDir);
console.log(
  `parse: ${doc.elements.length} elements, ${doc.warnings.length} warnings`,
);
const { classifications, warnings } = await annotate(doc, outDir);
console.log(
  `annotate: ${classifications.length} classifications, ${warnings.length} warnings`,
);
const resolved = await resolve(doc, classifications, outDir);
console.log(
  `resolve: ${resolved.entities.length} entities, ${resolved.links.length} links, ${resolved.warnings.length} warnings`,
);
```

- [ ] **Step 6: Run the live test**

```bash
npm run build -w packages/resolve
npm run test:integration -w packages/resolve
```

Expected: PASS. The output has one summary line (`N entities, M mentions, P possibly-same pairs; L links, U named but not linked; W warnings`), one line per entity with its names, the warnings, and `fixtures/expected-entities.json missing: recorded, not scored`.

If the model call is rejected, or the run returns zero entities, stop and report the output to Jorge. Do not tune the prompts against this document: without an answer key that is guessing, and the fixture is the document the eval will score.

- [ ] **Step 7: Read the run**

Read the printed entity list as a reviewer would: is each line a thing the document refers to by name, are names that mean the same thing together, is anything listed twice. Read the `not linked` lines. Change nothing; write down what looks wrong for the report in Task 10.

- [ ] **Step 8: Copy the recording into the fixtures**

```bash
SHA=$(node -p 'require("./packages/parse/test/fixtures/parsed.json").source.sha256')
mkdir -p packages/resolve/test/fixtures
rm -rf packages/resolve/test/fixtures/resolve-responses
cp -R packages/resolve/test/out/$SHA/resolve packages/resolve/test/fixtures/resolve-responses
cp packages/resolve/test/out/$SHA/resolve.json packages/resolve/test/fixtures/resolve.json
ls packages/resolve/test/fixtures/resolve-responses packages/resolve/test/fixtures/resolve-responses/link
```

Expected: `entities.json`, a `link` directory, and inside it one `<i>.json` per chunk that holds a classification.

- [ ] **Step 9: Write the replay test**

`packages/resolve/test/replay.test.ts`:

```ts
/**
 * Replays recorded model responses through both checks; no network. To
 * re-record: run `test:integration`, copy `test/out/<sha256>/resolve/` into
 * `test/fixtures/resolve-responses/` and `resolve.json` into `test/fixtures/`,
 * and review the diff like code.
 */
import { anchors } from "@dark-factory/annotate";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { groundEntities, groundLinks } from "../src/ground.ts";
import { linkInputs } from "../src/inputs.ts";
import { classifications, doc } from "./doc.ts";

const fixture = (path: string) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/${path}`, import.meta.url), "utf8"),
  );

test("replayed entities and links match the recording", () => {
  const { entities, possiblySameAs, warnings } = groundEntities(
    fixture("resolve-responses/entities.json"),
    anchors(doc),
    doc.content,
  );
  for (const e of entities)
    for (const m of e.mentions)
      expect(
        doc.content.slice(m.span.offset, m.span.offset + m.span.length),
      ).toBe(m.text);
  const answers = linkInputs(doc, classifications, entities).map(
    ({ asked }, i) => ({
      asked,
      rows: fixture(`resolve-responses/link/${i}.json`),
    }),
  );
  const linked = groundLinks(answers, entities);
  expect({
    entities,
    possiblySameAs,
    links: linked.links,
    warnings: [...warnings, ...linked.warnings],
  }).toEqual(fixture("resolve.json"));
});
```

- [ ] **Step 10: Run the unit tests**

Run: `npm test -w packages/resolve`
Expected: PASS, 15 tests. The replay passes because the responses and `resolve.json` come from one run.

- [ ] **Step 11: Commit**

```bash
npm run check-types -w packages/resolve
npm run lint -w packages/resolve
git add packages/resolve/src packages/resolve/test/resolve.integration.test.ts package.json scripts/pipeline.mts
git commit -m "Call the model for resolve and link, with a CLI and an eval"
git add packages/resolve/test/fixtures packages/resolve/test/replay.test.ts
git commit -m "Record resolve's first run on the fixture and replay it"
```

### Task 8: Entities and links in the knowledge graph

**Files:**

- Modify: `packages/knowledge-graph/package.json` (one dependency)
- Modify: `packages/knowledge-graph/src/index.ts` (imports, four appended functions)
- Modify: `packages/knowledge-graph/test/round-trip.integration.test.ts`

**Interfaces:**

- Consumes: `Entity`, `Link`, `ResolveResult` from `@dark-factory/resolve`; `EntityKind` from `@dark-factory/annotate`; `Span` from `@dark-factory/parse`; `cypher`, `transaction`, `toLabel`, `toType`, `Row` inside the module; the recorded `packages/resolve/test/fixtures/resolve.json` (Task 7).
- Produces, exported from `@dark-factory/knowledge-graph`:
  - `writeEntities(jobId: string, result: Pick<ResolveResult, "entities" | "possiblySameAs">): Promise<void>`
  - `readEntities(jobId: string): Promise<Pick<ResolveResult, "entities" | "possiblySameAs">>`
  - `writeLinks(jobId: string, links: Link[]): Promise<void>`
  - `readLinks(jobId: string): Promise<Link[]>`

- [ ] **Step 1: Depend on resolve**

In `packages/knowledge-graph/package.json`, add to `dependencies`, after `@dark-factory/parse`:

```json
    "@dark-factory/resolve": "*",
```

Then:

```bash
npm install
npm run build -w packages/resolve
```

- [ ] **Step 2: Write the failing test**

In `packages/knowledge-graph/test/round-trip.integration.test.ts`, add the type import, extend the import from `../src/index.ts` to

```ts
import type { Link, ResolveResult } from "@dark-factory/resolve";
import {
  readDocument,
  readEntities,
  readLinks,
  readRequirements,
  writeDocument,
  writeEntities,
  writeLinks,
  writeRequirements,
} from "../src/index.ts";
```

add below the `golden` constant:

```ts
const resolved: ResolveResult & { links: Link[] } = JSON.parse(
  readFileSync(new URL("resolve/test/fixtures/resolve.json", packages), "utf8"),
);
```

and append this test:

```ts
test("the recorded entities and links survive a round trip", async () => {
  const { entities, possiblySameAs, links } = resolved;
  await writeDocument(jobId, doc);
  await writeRequirements(jobId, golden.classifications);

  await writeEntities(jobId, { entities, possiblySameAs });
  await writeEntities(jobId, { entities, possiblySameAs }); // a retried step must not duplicate
  expect(await readEntities(jobId)).toEqual({ entities, possiblySameAs });

  await writeLinks(jobId, links);
  await writeLinks(jobId, links); // a retried step must not duplicate
  expect(await readLinks(jobId)).toEqual(links);

  // Resolving again replaces the entities; a link to an old one must not survive it.
  await writeEntities(jobId, { entities, possiblySameAs });
  expect(await readLinks(jobId)).toEqual([]);
  expect(await readRequirements(jobId)).toEqual(golden.classifications);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:integration -w packages/knowledge-graph`
Expected: FAIL, `writeEntities` is not exported from `../src/index.ts`.

- [ ] **Step 4: Implement the four functions**

In `packages/knowledge-graph/src/index.ts`, replace the imports from `@dark-factory/annotate` and `@dark-factory/parse` with:

```ts
import {
  ENTITY_KINDS,
  type Classification,
  type ClassificationType,
  type EntityKind,
} from "@dark-factory/annotate";
import type { Cell, Element, ParsedDocument, Span } from "@dark-factory/parse";
import type { Entity, Link, ResolveResult } from "@dark-factory/resolve";
```

and append to the end of the file:

```ts
/** What Resolve stores about a job's entities. */
type Entities = Pick<ResolveResult, "entities" | "possiblySameAs">;

/** "e12" → 12, "a3" → 3: ids sort by their number. */
const num = (id: string) => Number(id.slice(1));

/** Replaces the job's entities: one node per entity labeled by its kind, a MENTIONED_IN edge per mention to the element it sits in, a POSSIBLY_SAME_AS edge per pair. Deleting an entity takes its ABOUT edges with it. */
export async function writeEntities(
  jobId: string,
  { entities, possiblySameAs }: Entities,
): Promise<void> {
  const byLabel = new Map<string, Row[]>();
  for (const e of entities) {
    const label = toLabel(e.kind);
    const row: Row = { jobId, id: e.id, name: e.name };
    byLabel.set(label, [...(byLabel.get(label) ?? []), row]);
  }
  const mentions = entities.flatMap((e) =>
    e.mentions.map((m) => ({ entityId: e.id, ...m })),
  );
  await transaction(async (client) => {
    await cypher(
      client,
      `MATCH (e {jobId: $jobId})-[:MENTIONED_IN]->() DETACH DELETE e`,
      { jobId },
    );
    for (const [label, rows] of byLabel)
      await cypher(client, `UNWIND $rows AS r CREATE (n:${label}) SET n = r`, {
        rows,
      });
    await cypher(
      client,
      `UNWIND $rows AS r MATCH (e {jobId: $jobId, id: r.entityId}), (el {jobId: $jobId, id: r.elementId}) CREATE (e)-[:MENTIONED_IN {span: r.span, text: r.text}]->(el)`,
      { jobId, rows: mentions },
    );
    await cypher(
      client,
      `UNWIND $pairs AS p MATCH (x {jobId: $jobId, id: p.a}), (y {jobId: $jobId, id: p.b}) CREATE (x)-[:POSSIBLY_SAME_AS]->(y)`,
      { jobId, pairs: possiblySameAs.map(([a, b]) => ({ a, b })) },
    );
  });
}

/** The inverse of writeEntities: entities in id order, each with its mentions in reading order. */
export async function readEntities(jobId: string): Promise<Entities> {
  return transaction(async (client) => {
    const rows = await cypher<[string, string, string, Span, string, string]>(
      client,
      `MATCH (e {jobId: $jobId})-[m:MENTIONED_IN]->(el) RETURN label(e), e.id, e.name, m.span, m.text, el.id`,
      { jobId },
      ["label", "id", "name", "span", "text", "elementId"],
    );
    const byId = new Map<string, Entity>();
    for (const [label, id, name, span, text, elementId] of rows) {
      const entity = byId.get(id) ?? {
        id,
        kind: toType(label) as EntityKind,
        name,
        mentions: [],
      };
      entity.mentions.push({ elementId, span, text });
      byId.set(id, entity);
    }
    const entities = [...byId.values()].sort((a, b) => num(a.id) - num(b.id));
    for (const e of entities)
      e.mentions.sort((a, b) => a.span.offset - b.span.offset);
    const pairs = await cypher<[string, string]>(
      client,
      `MATCH (x {jobId: $jobId})-[:POSSIBLY_SAME_AS]->(y) RETURN x.id, y.id`,
      { jobId },
      ["a", "b"],
    );
    return {
      entities,
      possiblySameAs: pairs.sort(
        (x, y) => num(x[0]) - num(y[0]) || num(x[1]) - num(y[1]),
      ),
    };
  });
}

/** Replaces the job's ABOUT edges: one per link, from a requirement node to an entity. */
export async function writeLinks(jobId: string, links: Link[]): Promise<void> {
  await transaction(async (client) => {
    await cypher(client, `MATCH (c {jobId: $jobId})-[r:ABOUT]->() DELETE r`, {
      jobId,
    });
    await cypher(
      client,
      `UNWIND $rows AS r MATCH (c {jobId: $jobId, id: r.classificationId}), (e {jobId: $jobId, id: r.entityId}) CREATE (c)-[:ABOUT]->(e)`,
      { jobId, rows: links },
    );
  });
}

/** The inverse of writeLinks, ordered by classification, then entity. */
export async function readLinks(jobId: string): Promise<Link[]> {
  const rows = await transaction((client) =>
    cypher<[string, string]>(
      client,
      `MATCH (c {jobId: $jobId})-[:ABOUT]->(e) RETURN c.id, e.id`,
      { jobId },
      ["classificationId", "entityId"],
    ),
  );
  return rows
    .map(([classificationId, entityId]) => ({ classificationId, entityId }))
    .sort(
      (a, b) =>
        num(a.classificationId) - num(b.classificationId) ||
        num(a.entityId) - num(b.entityId),
    );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:integration -w packages/knowledge-graph`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
npm run check-types -w packages/knowledge-graph
npm run lint -w packages/knowledge-graph
git add packages/knowledge-graph package-lock.json
git commit -m "Store entities, mentions and links in the knowledge graph"
```

### Task 9: Resolve in the workflow and on the canvas

**Files:**

- Modify: `apps/web/package.json` (one dependency)
- Modify: `apps/web/lib/operations.ts` (`OPERATIONS`)
- Modify: `apps/web/lib/canvas.ts` (`STEPS`, the `href` condition)
- Modify: `apps/web/workflows/job.ts`
- Modify: `apps/web/test/operations.test.ts`, `apps/web/test/canvas.test.ts`, `apps/web/test/parse-job.integration.test.ts`

**Interfaces:**

- Consumes: from `@dark-factory/resolve`: `groundEntities`, `groundLinks`, `linkInputs`, `resolveInput`, `runLink`, `runResolve` (Tasks 3 to 7). From `@dark-factory/knowledge-graph`: `readDocument`, `readRequirements`, `readEntities`, `writeEntities`, `writeLinks`, `readLinks` (Task 8). From `@/lib/operations`: `runOperation(jobId, step, name, fn)` and `setOperation(jobId, step, name, patch)`.
- Produces: operation rows `["resolve", "resolve"]` and `["resolve", "link"]` on every new job; a third canvas node `resolve` that never has an `href`.

- [ ] **Step 1: Depend on resolve**

In `apps/web/package.json`, add to `dependencies`, after `@dark-factory/parse`:

```json
    "@dark-factory/resolve": "*",
```

Then run `npm install`.

- [ ] **Step 2: Update the unit tests first**

In `apps/web/test/operations.test.ts`, replace the expected rows of the first test with:

```ts
expect(rows.map((r) => [r.step, r.name, r.position, r.status])).toEqual([
  ["parse", "upload", 0, "done"],
  ["parse", "parse", 1, "pending"],
  ["annotate", "annotate", 0, "pending"],
  ["resolve", "resolve", 0, "pending"],
  ["resolve", "link", 1, "pending"],
]);
```

In `apps/web/test/canvas.test.ts`, replace the test named "two step nodes in order, parse carrying its operations" with:

```ts
test("three step nodes in order, parse carrying its operations", () => {
  const { nodes } = toCanvas(
    job([op("upload", "done"), op("parse", "running", null)]),
  );
  expect(nodes.map((n) => n.id)).toEqual(["parse", "annotate", "resolve"]);
  expect(nodes.map((n) => n.data.label)).toEqual([
    "Parse",
    "Annotate",
    "Resolve",
  ]);
  expect(nodes[0]?.data.status).toBe("running");
  expect(nodes[0]?.data.operations.map((o) => o.name)).toEqual([
    "upload",
    "parse",
  ]);
  expect(nodes[1]?.data.operations).toEqual([]);
  expect(nodes[1]?.data.status).toBe("pending");
  expect(nodes[0]?.position.x).toBeLessThan(nodes[1]?.position.x ?? 0);
  expect(nodes[1]?.position.x).toBeLessThan(nodes[2]?.position.x ?? 0);
  expect(nodes.map((n) => n.data.handles)).toEqual([
    { target: false, source: true },
    { target: true, source: true },
    { target: true, source: false },
  ]);
});
```

In the test named "the edge into a running step is animated, others plain", replace the first expectation with:

```ts
expect(running.edges.map((e) => [e.source, e.target, e.type])).toEqual([
  ["parse", "annotate", "animated"],
  ["annotate", "resolve", undefined],
]);
```

In the test named "a node links to its reader only once every one of its operations is done", append before its closing `});`:

```ts
// Resolve has no page yet, so its node links nowhere even when it is done.
const resolved = toCanvas(
  job([
    { ...op("resolve", "done"), step: "resolve" },
    { ...op("link", "done"), step: "resolve" },
  ]),
);
expect(resolved.nodes[2]?.data.status).toBe("done");
expect(resolved.nodes[2]?.data.href).toBeUndefined();
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -w apps/web`
Expected: FAIL in `operations.test.ts` (three rows, not five) and `canvas.test.ts` (two nodes, not three).

- [ ] **Step 4: Add the operations and the canvas node**

In `apps/web/lib/operations.ts`, replace `OPERATIONS` with:

```ts
export const OPERATIONS = {
  parse: ["upload", "parse"],
  annotate: ["annotate"],
  resolve: ["resolve", "link"],
} as const;
```

In `apps/web/lib/canvas.ts`, replace `STEPS` and its comment with:

```ts
/** Station 1's steps, in assembly-line order. Nothing else knows these names. A step's node links to its page only when it has one. */
export const STEPS = [
  { id: "parse", label: "Parse", page: true },
  { id: "annotate", label: "Annotate", page: true },
  { id: "resolve", label: "Resolve", page: false },
] as const;
```

and, inside `toCanvas`, replace

```ts
        ...(stepStatus(operations) === "done" && {
          href: `/jobs/${job.id}/${step.id}`,
        }),
```

with

```ts
        ...(step.page &&
          stepStatus(operations) === "done" && {
            href: `/jobs/${job.id}/${step.id}`,
          }),
```

- [ ] **Step 5: Run the two operations in the workflow**

In `apps/web/workflows/job.ts`, replace the imports from `@dark-factory/annotate` and `@dark-factory/knowledge-graph` with:

```ts
import { anchors, chunk, ground, runAnnotate } from "@dark-factory/annotate";
import {
  groundEntities,
  groundLinks,
  linkInputs,
  resolveInput,
  runLink,
  runResolve,
} from "@dark-factory/resolve";
import {
  readDocument,
  readEntities,
  readRequirements,
  writeDocument,
  writeEntities,
  writeLinks,
  writeRequirements,
} from "@dark-factory/knowledge-graph";
```

Add these two functions after `annotateOperation`:

```ts
async function resolveOperation(jobId: string) {
  "use step";
  return runOperation(jobId, "resolve", "resolve", async () => {
    const doc = await readDocument(jobId);
    if (!doc) throw new FatalError("document missing from the knowledge graph");
    const result = groundEntities(
      await runResolve(resolveInput(doc)),
      anchors(doc),
      doc.content,
    );
    await writeEntities(jobId, result);
    // Like grounding warnings, these describe this run; runOperation's done patch leaves them in place.
    await setOperation(jobId, "resolve", "resolve", {
      warnings: result.warnings,
    });
    return {
      entities: result.entities.length,
      mentions: result.entities.reduce((sum, e) => sum + e.mentions.length, 0),
      warnings: result.warnings.length,
    };
  });
}

async function linkOperation(jobId: string) {
  "use step";
  return runOperation(jobId, "resolve", "link", async () => {
    const doc = await readDocument(jobId);
    if (!doc) throw new FatalError("document missing from the knowledge graph");
    const [classifications, { entities }] = await Promise.all([
      readRequirements(jobId),
      readEntities(jobId),
    ]);
    // ponytail: all chunks in flight at once; add a concurrency cap if Azure rate limits bite.
    const answers = await Promise.all(
      linkInputs(doc, classifications, entities).map(
        async ({ asked, text }) => ({ asked, rows: await runLink(text) }),
      ),
    );
    const result = groundLinks(answers, entities);
    await writeLinks(jobId, result.links);
    await setOperation(jobId, "resolve", "link", { warnings: result.warnings });
    return { links: result.links.length, warnings: result.warnings.length };
  });
}
```

and replace `runJob`, including its comment, with:

```ts
/** One job down Station 1: Parse, Annotate, then Resolve. The knowledge graph is the only thing that crosses a step boundary. */
export async function runJob(jobId: string) {
  "use workflow";
  await setJob(jobId, { status: "running" });
  try {
    await parseOperation(jobId);
    await annotateOperation(jobId);
    await resolveOperation(jobId);
    const counts = await linkOperation(jobId);
    await setJob(jobId, { status: "done", finishedAt: new Date() });
    return counts;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await setJob(jobId, { status: "failed", error, finishedAt: new Date() });
    throw err;
  }
}
```

- [ ] **Step 6: Run the unit tests and the typecheck**

```bash
npm test -w apps/web
npm run check-types -w apps/web
```

Expected: both PASS.

- [ ] **Step 7: Update the web integration test**

In `apps/web/test/parse-job.integration.test.ts`, replace the import from `@dark-factory/knowledge-graph` with:

```ts
import {
  readDocument,
  readEntities,
  readLinks,
  readRequirements,
} from "@dark-factory/knowledge-graph";
```

rename the first test to `"a posted PDF runs Parse, Annotate and Resolve and yields the recorded parse"`, replace the expected operations with:

```ts
expect(job.operations.map((o) => [o.step, o.name, o.status])).toEqual([
  ["parse", "upload", "done"],
  ["parse", "parse", "done"],
  ["annotate", "annotate", "done"],
  ["resolve", "resolve", "done"],
  ["resolve", "link", "done"],
]);
```

and append after the `requirements` expectation:

```ts
const { entities } = await readEntities(id);
expect(entities.length).toBeGreaterThan(0);
expect((await readLinks(id)).length).toBeGreaterThan(0);
```

It runs in Task 10, because it needs the dev server.

- [ ] **Step 8: Commit**

```bash
npm run lint -w apps/web
git add apps/web package-lock.json
git commit -m "Run Resolve after Annotate and show it on the canvas"
```

### Task 10: Docs, gates, report

**Files:**

- Modify: `AGENTS.md`
- Modify: `apps/web/README.md`

**Interfaces:**

- Consumes: everything above.
- Produces: a branch that passes the Definition of done, and a report.

- [ ] **Step 1: Update AGENTS.md**

In "The assembly line", change "We have the following two steps today." to "We have the following three steps today." and add after step 2:

```
3. **Resolve** _(AI)_ — the things the document refers to by name become entities, each located in the text by code, and every classification is linked to the entities it is about. Doubt about whether two names are one thing is stored, never guessed.
```

In "Repository layout", add after the `packages/annotate` paragraph:

```
`packages/resolve` is station 1, step 3 (Resolve): a `ParsedDocument` and its classifications in, entities with their mentions and classification-to-entity links out, via the same `gpt-4o` deployment. The seven entity kinds are a subset of annotate's types. The model supplies names and judgments; code locates every mention and validates every link before it is emitted.
```

In the `packages/knowledge-graph` paragraph, change "is where both steps store their results" to "is where the steps store their results", and add before "Nothing is labeled by the process that produced it.":

```
`writeEntities`/`readEntities` map entities to nodes labeled by their kind (`UserClass`, `DataEntity`, ...) with a `MENTIONED_IN` edge to each element that names them and `POSSIBLY_SAME_AS` edges between entities that may be one thing; `writeLinks`/`readLinks` map links to `ABOUT` edges from a requirement node to an entity.
```

In the `apps/web` paragraph, change "runs its Parse and Annotate operations" to "runs its Parse, Annotate and Resolve operations".

In "Commands", add after the `npm run annotate` line:

```
- `npm run resolve <parsed.json> <annotate.json> <outDir>` — run the resolve step on a parsed document and its classifications
```

and change the pipeline line to:

```
- `npm run pipeline <file.pdf> <outDir>` — parse, annotate, then resolve
```

In "Definition of done", item 5, change "when you changed `packages/parse`, `packages/annotate`, `packages/knowledge-graph`, or their fixtures" to "when you changed `packages/parse`, `packages/annotate`, `packages/resolve`, `packages/knowledge-graph`, or their fixtures", and change "For annotate this is also the eval: paste the precision/recall table in the PR." to "For annotate and resolve this is also the eval: paste the score tables in the PR."

- [ ] **Step 2: Update the web README**

In `apps/web/README.md`:

- Replace the Vocabulary sentence with: `A **job** moves through the **station** (Requirements engineering), which runs in **steps** (Parse, Annotate, Resolve); each step is a sequence of **operations**: Parse: upload, parse; Annotate: annotate; Resolve: resolve, link.`
- In the Environment text, change "and the annotate step's model calls" to "and the annotate and resolve steps' model calls", and "`AZURE_FOUNDRY_ENDPOINT` the URL the annotate step calls" to "`AZURE_FOUNDRY_ENDPOINT` the URL the annotate and resolve steps call".
- In the Smoke test text, change "the job is done only once Annotate finishes too, so expect status `done` and all three operations `done`" to "the job is done only once Resolve finishes too, so expect status `done` and all five operations `done`".

- [ ] **Step 3: Format what this branch touched**

```bash
git diff --name-only main... | grep -E '\.(ts|tsx|mts|md)$' | xargs npx prettier --write
git status --short
```

Expected: only files this branch already changed appear as modified.

- [ ] **Step 4: Run every gate**

```bash
npm run check-types
npm run lint
npm run build
npm test
npm run test:integration -w packages/knowledge-graph
npm run test:integration -w packages/resolve
npm run test:integration -w packages/annotate
```

Then, with the dev server running in another terminal (`npm run dev -w apps/web`):

```bash
npm run test:integration -w apps/web
```

Expected: all PASS. The resolve and annotate evals print "recorded, not scored". Do not copy either live run into the fixtures here; the recording of Task 7 stays.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md apps/web/README.md
git add -u
git commit -m "Describe the Resolve step and its commands"
```

- [ ] **Step 6: Report**

Report to Jorge, without pushing:

- what Resolve found on the fixture: the summary line and the entity list from Task 7, and what looked wrong in Step 7 of that task;
- the output of every gate;
- that three answer keys are owed, in this order: `packages/annotate/test/fixtures/expected.json`, `packages/resolve/test/fixtures/expected-entities.json`, `packages/resolve/test/fixtures/expected-links.json`, with the formats in the spec's Eval section, and that until they exist both evals are "recorded, not scored";
- the known limits from the spec that this run showed in practice.

Pushing and opening PR 2 happen when Jorge asks, through the `origin` skill.
