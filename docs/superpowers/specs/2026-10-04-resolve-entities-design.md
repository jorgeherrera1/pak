# Resolve: entities in the knowledge graph

Design for Station 1's third step, Resolve. It finds the things a requirements
document talks about, decides which names mean the same thing, and links every
classification Annotate produced to the things it is about. Backend only; how
any of it is shown is out of scope. This is the entity resolution that
`2026-10-02-knowledge-graph-design.md` deferred "as its own step with its own
eval".

Visual walkthrough of this design:
https://claude.ai/artifact/Y25jX8SLwrvPxfZcqnvBvQ

## Intent

Jorge's scenario (2026-10-04), performed by a human today:

1. An RFP comes in.
2. Someone extracts features, functional requirements and the rest.
3. They notice conflicting or ambiguous requirements about entity A, and
   features about entity B that depend on data of entity A.
4. The customer clarifies, or the gap becomes a written assumption.
5. A technical plan is made; implementation follows.

Parse and Annotate cover steps 1 and 2. Step 3 is impossible today because the
graph has no node for entity A: Annotate labels sentences, so a sentence that
describes a data entity is stored as a node called `DataEntity`, and three such
sentences are three unconnected nodes.

Success: for any requirements document, "everything the document says about
entity A" is one traversal; every entity and every link traces back to source
text; nothing in code or prompts knows a business domain. The fixture PDF is an
example file, not the product's domain. The kinds of entity are fixed by the
ontology. The entities themselves are discovered per document.

## Layers

The scenario needs four layers. Each one only adds edges between nodes the
layers below it created, so the later ones never force a remodel.

| Layer | The graph gains                                     | Question it answers                                    | Status    |
| ----- | --------------------------------------------------- | ------------------------------------------------------ | --------- |
| 1     | entity nodes, `MENTIONED_IN`, `POSSIBLY_SAME_AS`    | Where is this thing named, under any of its names?     | this spec |
| 2     | `ABOUT`, from a requirement node to an entity       | What does the document say about this thing?           | this spec |
| 3     | relations between entities                          | How do these things relate to each other?              | later     |
| 4     | `DEPENDS_ON`, `CONFLICTS_WITH` between requirements | Which requirements depend on or contradict each other? | later     |

Layers 3 and 4 are each their own AI step with their own eval. Nothing is built
for them now.

## Vocabulary

Every name below appears identically in code, URLs and prose. No new word is
introduced for what Annotate produces: it stays a **classification** in memory
(`Classification`) and a **requirement node** in the graph
(`writeRequirements`), as today. The walkthrough page called these
"statements".

| Concept              | Name                     | Code                                               |
| -------------------- | ------------------------ | -------------------------------------------------- |
| Station 1            | Requirements engineering | `apps/web`                                         |
| Step 1               | Parse                    | `packages/parse`                                   |
| Step 2               | Annotate                 | `packages/annotate`                                |
| Step 3               | Resolve                  | `packages/resolve`                                 |
| Resolve's operations | `resolve`, `link`        | `OPERATIONS.resolve`                               |
| A thing in the text  | entity                   | `Entity`; node labeled by its kind                 |
| A place it is named  | mention                  | `Mention`; edge `MENTIONED_IN`                     |
| The seven kinds      | entity kinds             | `ENTITY_KINDS`, beside `TYPES` in annotate's types |

**Entity kinds**: `product`, `user-class`, `data-entity`, `integration`,
`imposed-technology`, `standard`, `glossary-term`. These are seven of
Annotate's 19 types. The other 12 name kinds of claim (`functional-requirement`,
`assumption`, ...). `data-entity` is one kind of entity; "entity" alone always
means any of the seven.

## Decisions

| Topic            | Decision                                                                                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pipeline shape   | Catalog, then link. `resolve` builds a closed list of entities from the whole document; `link` then picks from that list for each classification.                                                               |
| Annotate         | Unchanged: same prompt, same 19 types, same `AnnotateResult`, same fixtures.                                                                                                                                    |
| Entity nodes     | One node per entity per job, labeled by its kind (`UserClass`, `DataEntity`, ...). Identity is an id; the name is a property.                                                                                   |
| `Description`    | A classification whose type is an entity kind is stored as a `Description` node, with the kind as a property. The kind's label is reserved for the entity itself.                                               |
| The mention      | The atom. An entity exists only if at least one of its names is found in the text. Its stored name is one of those mentions' texts, never the model's string.                                                   |
| Finding mentions | Code. The model supplies the names; code locates every occurrence. Deterministic work is code.                                                                                                                  |
| Linking          | AI, closed set. Documents name an entity once in a heading and write "it" in the bullets below, so a text search would miss those classifications.                                                              |
| Doubt            | Stored, never guessed. When the model is unsure two names mean the same thing it keeps two entities and the graph gets `POSSIBLY_SAME_AS`. That doubt is the raw material for a clarification or an assumption. |
| Identity scope   | The job. Every node carries `jobId`, as today.                                                                                                                                                                  |
| Model            | The same `gpt-4o` deployment and Vercel AI SDK structured output Annotate uses. No agent, no embeddings, no vector index.                                                                                       |
| Domain knowledge | None. Prompts carry the ontology's guidelines and no example from any scored document.                                                                                                                          |
| Canvas           | `STEPS` gains Resolve so a job does not look finished while Resolve runs. No link: a step gets an `href` only when it has a page. The Resolve page is out of scope.                                             |

## Graph model

```
(requirement) ──FROM──▶ (Paragraph | Cell | Figure) ──IN──▶ ... ──IN──▶ (Document)
      │                            ▲
    ABOUT                     MENTIONED_IN
      ▼                            │
   (entity) ───────────────────────┘
      │
POSSIBLY_SAME_AS
      ▼
   (entity)
```

Structure nodes and `IN` edges are unchanged.

**Requirement nodes**, from `Classification`:

| Classification type       | AGE                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| one of the 12 claim types | label: the type in PascalCase, as today                                                           |
| one of the 7 entity kinds | label `Description`, property `kind` holding the type (`"data-entity"`)                           |
| both                      | properties `id`, `text`, `span`, `category`, `jobId` and the `FROM` edge to the element, as today |

`readRequirements` maps `Description` back to its `kind`, so it still returns
the `Classification[]` it was given and the Annotate pages are untouched.

**Entities**, from `ResolveResult`:

| ResolveResult              | AGE                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| an entity’s `kind`         | label: the kind in PascalCase (`user-class` → `UserClass`, 7 labels)                              |
| `id`, `name`               | properties, plus `jobId`                                                                          |
| each `Mention`             | `(entity)-[:MENTIONED_IN {span, text}]->(element)`, the element being a paragraph, cell or figure |
| each `possiblySameAs` pair | `(entity)-[:POSSIBLY_SAME_AS]->(entity)`, one edge per pair                                       |

**Links**, from `Link`: `(requirement)-[:ABOUT]->(entity)`.

Provenance: an entity traces to the source through its mentions' spans. An
`ABOUT` edge is an AI judgment about a requirement node, and that node's own
span is its source text.

## Sequencing

Two PRs, in order.

1. **`Description`.** `ENTITY_KINDS` in annotate and the `Description` mapping
   in `packages/knowledge-graph`, with its round-trip test. No AI, no new
   package.
2. **Resolve.** Everything else below.

## `packages/resolve`

Depends on `@dark-factory/parse` (types) and `@dark-factory/annotate`
(`ENTITY_KINDS`, `GUIDELINES`, `Classification`, `chunk`, `anchors`, and the
text folding and word-boundary search `ground.ts` already has). Annotate
exports the ones it does not export today. No I/O except the model call and the CLI's local files, like
annotate.

### Types

```ts
type EntityKind = (typeof ENTITY_KINDS)[number];

/** One place an entity is named. `text` is the source's, at `span`. */
type Mention = { elementId: string; span: Span; text: string };

type Entity = {
  id: string; // "e1", "e2", ...: the entities that pass the check, in the model’s order
  kind: EntityKind;
  name: string; // the text of one of its mentions
  mentions: Mention[]; // in reading order, never empty
};

type ResolveResult = {
  entities: Entity[];
  possiblySameAs: [string, string][]; // pairs of entity ids
  warnings: string[];
};

type Link = { classificationId: string; entityId: string };
type LinkResult = { links: Link[]; warnings: string[] };
```

### Operation `resolve`

One model call for the whole document, then a code check.

**Model call, `runResolve(text)`.** Input: the document as the same anchored
lines Annotate reads, all chunks joined. Instructions: the task, the rules
below, and the `GUIDELINES` entries for the seven kinds, so the ontology keeps
one home. Output rows:

```ts
{ kind: EntityKind; name: string; names: string[]; possiblySameAs: string[] }
```

Rules given to the model:

- An entity is a thing the document refers to by name, of one of the seven
  kinds. A sentence, a requirement or a description of behavior is never an
  entity.
- Report each thing once, with every name the document uses for it in `names`,
  copied verbatim: each spelling, singular and plural as written.
- `name` is the one the document uses most.
- Put two names under one entity only when the document makes clear they mean
  the same thing. When unsure, report two entities and name each in the
  other's `possiblySameAs`.
- Sample values and text a screen displays are not entities. Do not invent
  names.

**Code check, `groundEntities(rows, anchors, content)`.** The boundary the
model's output must cross:

1. Names are compared folded. A name another entity already claimed is
   dropped with a warning; the first entity keeps it.
2. Every remaining name is searched in every quotable element: folded (case,
   whitespace, typographic quotes and dashes, selection marks) and on word
   boundaries, with annotate's existing functions. Each hit is a mention.
3. Where two hits overlap, the longer wins, so "account holder" is never also
   a mention of "account". Where the same characters belong to two elements,
   the smaller element gets the mention, and of two the same size the later
   one.
4. A name with no hit is dropped with a warning. An entity left with no
   mention is dropped with a warning.
5. `name` is the source text of the first mention of the model's `name`, or,
   when that name did not survive, of the entity's most frequent name.
6. `possiblySameAs` names are resolved to entity ids. Unknown names and
   self-references are dropped with a warning. Pairs are deduplicated.

### Operation `link`

One model call per chunk, then a code check.

**Model call, `runLink(text)`.** Input, for one chunk from `chunk(doc)`: the
entity list (id, kind, name, every name), the classifications whose element
is in that chunk (id, type, element id, text), and the chunk itself. Output
rows:

```ts
{ classificationId: string; entityIds: string[] }
```

Rules given to the model: return, for each classification listed, the
entities it is about, using only ids from the list; an entity counts when the
classification names it, refers to it by a pronoun, or sits under a heading
that names it; an empty list is a valid answer.

**Code check, `groundLinks(answers, entities)`.** Each answer pairs one chunk's
classifications with the rows the model returned for it.

1. A row whose classification was not in that chunk's list is dropped with a
   warning.
2. An entity id that does not exist is dropped with a warning.
3. Duplicate links collapse.
4. A classification whose type is an entity kind and that has no link to an
   entity of that kind adds a warning. Annotate and Resolve disagree there,
   and a human should know.
5. A classification the model returned no row for adds a warning.

### CLI

`resolve(doc, classifications, outDir)` runs both operations and writes the
raw model responses and `resolve.json` under `<outDir>/<sha256>/`, as
`annotate` does. `npm run resolve <parsed.json> <annotate.json> <outDir>`
calls it, and `scripts/pipeline.mts` runs it after annotate. It never touches
the graph.

## `packages/knowledge-graph`

Gains a dependency on `@dark-factory/resolve` (types).

```ts
writeEntities(jobId: string, result: Pick<ResolveResult, "entities" | "possiblySameAs">): Promise<void>
readEntities(jobId: string): Promise<Pick<ResolveResult, "entities" | "possiblySameAs">>
writeLinks(jobId: string, links: Link[]): Promise<void>
readLinks(jobId: string): Promise<Link[]>
```

- `writeRequirements` and `readRequirements` change only in the `Description`
  mapping above.
- `writeEntities` first deletes the job's entity nodes (`DETACH DELETE`, which
  also removes their `ABOUT` edges). `writeLinks` first deletes the job's
  `ABOUT` edges. A Workflow retry cannot duplicate.
- `readEntities` returns entities in id order with mentions in reading order,
  and is the inverse of `writeEntities`. `readLinks` is the inverse of
  `writeLinks`.
- No migration: AGE creates labels on first use.

## Workflow and operations

```
OPERATIONS = { parse: ["upload", "parse"], annotate: ["annotate"], resolve: ["resolve", "link"] }
```

- `resolve`: `readDocument` (missing is a `FatalError`), `runResolve` on the
  whole document, `groundEntities`, `writeEntities`. Warnings go on the
  operation row. Returns entity, mention and warning counts.
- `link`: `readDocument`, `readRequirements`, `readEntities`; `runLink` on
  every chunk at once; `groundLinks`; `writeLinks`. Warnings go on the
  operation row. Returns link and warning counts.
- `runJob`: running → `parse` → `annotate` → `resolve` → `link` → done.

The create handler is unchanged: `initialOperations` yields five rows.

## Errors

- Missing `Document` for the job: `FatalError`.
- A document with no classifications or no entities: `link` writes nothing and
  succeeds.
- Model and Postgres failures: plain errors, the SDK retries; exhausted
  retries fail the operation and the job. Every write is delete-then-create.
- Rows the code checks reject become operation warnings.

## Tests

Critical tests only.

Unit, no network (`packages/resolve`):

- A name is found wherever it occurs, with the source's text and exact span.
- A name that never occurs is dropped; an entity with no mention is dropped.
- Of two overlapping names, the longer takes the mention.
- A link to an unknown classification or entity is dropped with a warning.
- Recorded model responses for the fixture replay through both checks to the
  recorded `resolve.json`.

Integration:

- `packages/knowledge-graph`: the recorded requirements, including those of
  an entity kind, survive a round trip; the recorded entities and links
  survive a round trip.
- `apps/web`: five operations done; at least one entity and one link in the
  graph.
- Web unit test asserting three operation rows asserts five; the canvas test
  expects three nodes.

## Eval

`packages/resolve/test/resolve.integration.test.ts` runs both operations live
on the fixture and scores them against two human-written answer keys. It is
the eval, run by `npm run test:integration`.

`fixtures/expected-entities.json`: every entity in the fixture document, with
its kind and every name the document uses for it.

```json
{ "entities": [{ "kind": "user-class", "names": ["...", "..."] }] }
```

Scored three ways, names compared folded:

| Score         | Meaning                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------- |
| Names found   | precision and recall of the names the run reported against the key's names                    |
| Names grouped | B-cubed precision and recall over the names both sides have: were the same names put together |
| Kinds         | of the names both sides have, the share whose entity has the key's kind                       |

`fixtures/expected-links.json`: the entities each classification is about. A
classification is identified by its element and type, as in Annotate's key,
and an entity by any one of its names.

```json
{
  "links": [
    { "elementId": "...", "type": "functional-requirement", "entity": "..." }
  ]
}
```

Scored as precision and recall of (element, type, entity) triples. A run's
entity matches a key entity when they share a name.

The test also prints the counts a human needs to read a run: entities,
mentions, names dropped, links, and classifications that literally contain a
mention of an entity the model did not link.

Until a key exists its score prints "recorded, not scored", as Annotate's
does. `FLOOR` starts at 0 and a human raises it after the first scored run.

## Docs

AGENTS.md: the assembly line gains step 3, Resolve; a `packages/resolve`
paragraph; `npm run resolve`; `packages/resolve` joins the packages whose
changes need `npm run test:integration`. Web README: smoke test expects five
operations.

## Needs from Jorge

Jorge agreed (2026-10-04) to supply the answer keys later. Three are owed, in
this order:

1. `packages/annotate/test/fixtures/expected.json`. Annotate has never been
   scored, and Resolve links what Annotate finds, so its quality bounds
   Resolve's.
2. `packages/resolve/test/fixtures/expected-entities.json`.
3. `packages/resolve/test/fixtures/expected-links.json`.

AGENTS.md says no AI functionality without evals. This step ships its eval
harness and reports "recorded, not scored" until the keys exist, the same
state Annotate is in. The PR says so plainly.

## Known limits

- **Document size.** `resolve` reads the whole document in one model call. A
  document beyond the model's context needs a per-chunk candidate pass and one
  merge call. Not built until a real document needs it.
- **A form the model did not list is not found.** If it reports "orders" and
  not "order", the singular is not a mention. `link` does not depend on
  mentions, so links are unaffected.
- **One word, two things.** A name is attached to one entity. A word the
  document uses for two different things is a mention of only one.
- **Seven kinds.** A thing that fits none of them, such as a business process
  or an event, has no home.

## Alternatives considered

- **Tag, then cluster.** Annotate tags every mention chunk by chunk and
  Resolve clusters them afterwards. The textbook pipeline, and what the repo
  half-built and deleted on 2026-10-03. Rejected: two open-ended AI tasks and
  two evals; the deleted run on the example file returned 133 mentions for
  five pages and still left two names of one thing unmerged, because a chunk
  cannot see the rest of the document.
- **Resolve before Annotate**, with Annotate emitting entity references.
  Rejected: it puts two judgments in one model call and one eval, and changes
  a step that works.
- **Most radical: replace Annotate, Resolve and the graph mapping with an
  off-the-shelf graph builder** (Microsoft GraphRAG, Neo4j's LLM graph
  builder). Rejected: they extract free-form triples for retrieval, merge
  entities by name, keep provenance at chunk level and not at span level, and
  are Python in a TypeScript repo. This graph is a system of record that later
  stations build software from.

## Out of scope

- Layers 3 and 4, and the steps that would raise clarification questions or
  write assumptions from conflicts and from `POSSIBLY_SAME_AS`.
- A Resolve page or any other UI.
- Entities shared across jobs.
- Mentions that are pronouns. They are covered by `link`, not by
  `MENTIONED_IN`.
- New entity kinds.
