# Annotate: grounded extraction

Design for bringing Annotate in line with the industry pattern for turning a
document into typed, traceable findings: schema-guided extraction with source
grounding (Google LangExtract, Microsoft GraphRAG, Neo4j's graph builder).
The current shape already follows that pattern. This closes the four places
where it does not.

## Intent

Jorge's words: the annotation process "kind of works but feels fragile", and it
should follow industry best practice, not a design of our own.

What the investigation found:

- The flow is the standard one: Parse to a structure tree, send whole sections
  with their heading path, extract typed statements, verify each against the
  source in code, store each as a node named by its ontology type with an edge
  to its source element.
- In the recorded fixture run, 4 of 45 model rows were discarded. Three trace
  to Parse output (checkbox tokens inside text, a sentence split across two
  elements) and one to the model capitalizing a word.
- Nothing measures whether the 41 surviving labels are right. The eval harness
  exists; its answer key does not.

Success: no finding is discarded for a wording mismatch, every type has
written guidelines, running text reaches Annotate without checkbox noise, and
the eval scores a run against a human answer key.

## Decisions

| Topic               | Decision                                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit of a finding   | Unchanged: the requirement statement, quoted verbatim, on one element. The AI rewrites nothing at this step.                                                    |
| Alignment           | Exact, then normalized, then the whole element. A finding is dropped only when its element does not exist.                                                      |
| Ontology            | One guideline per type (definition, when to label, what it is not, examples), all loaded into the instructions on every call.                                   |
| Selection marks     | Parse removes them from running text and keeps them inside tables and figures.                                                                                  |
| Eval                | Unchanged scoring (element plus type, precision and recall per type). Jorge supplies `expected.json`.                                                           |
| Output type         | `AnnotateResult` is unchanged, so the knowledge graph and the reader page are untouched.                                                                        |
| Agent               | Not built. Considered a self-correcting tool loop (AI SDK `ToolLoopAgent`) and Vercel eve. With tolerant alignment there is nothing left for a loop to correct. |
| Element-only labels | Not adopted as the unit: one label per bullet cannot separate two requirements in the same bullet. It is the fallback when a quote cannot be located.           |
| Most radical option | Replace `packages/annotate` with LangExtract. Rejected: it is Python in a 100% TypeScript repo, and the parts we lack are small.                                |

## 1. Alignment (`packages/annotate/src/ground.ts`)

Today a row survives only if its quote is found character for character.
`ground` becomes a three-step alignment, tried in order:

1. **Exact.** As today: verbatim, on word boundaries, inside the element.
2. **Normalized.** Compare after folding case, collapsing whitespace, and
   unifying typographic quotes and dashes. The match must still sit on word
   boundaries.
3. **Whole element.** The quote cannot be located, so the finding covers the
   element: its span is the element's span (the first, when it has several).

In every case the stored `text` is the slice of `content` at the stored
`span`, never the model's string. A whole-element fallback adds a warning
naming the element and the unlocated quote. An unknown `elementId` is still
dropped with a warning, because there is nothing to anchor to. Classifications
identical in element, type and span collapse into one.

## 2. Guidelines (`packages/annotate/src/guidelines.ts`)

A `Record<ClassificationType, string>` holding one markdown guideline per
type, written from `docs/srs-ontology.md`. `prompt.ts` assembles the
instructions from the task description, the rules, and every guideline. The
compiler guarantees each type in `TYPES` has a guideline.

Each guideline has four parts: definition, when to label, what it is not
(naming the neighbouring type), and examples. Non-functional requirement
categories live inside that type's guideline.

Examples come from the SRS template for now and are marked as SRS-side
wording. Source-side examples (how an RFP phrases it) are added when Jorge
supplies them from a document other than the eval fixture; examples taken from
the scored document would inflate the eval.

`docs/srs-ontology.md` is removed in the same change. The module becomes the
single home of the guidelines.

### Boundary rules

The template leaves four boundaries open. Proposed rules, for Jorge to
confirm or change at review:

1. **Identity provider.** `imposed-technology` when the source mandates it,
   `integration` when the source describes the exchange. One statement can
   carry both.
2. **Encryption at rest.** `data-requirement` when stated about a named entity
   or attribute; `non-functional-requirement` (SEC) when stated system-wide.
3. **Unmeasurable UX wishes ("intuitive").** Labeled `ux-requirement`.
   Annotations are evidence; sharpening happens when the SRS is written.
4. **A binding standard and the requirement it imposes.** Two labels on the
   same statement: `standard` and the requirement's type.

## 3. Selection marks (`packages/parse/src/toParsedDocument.ts`)

Azure Document Intelligence writes `:selected:` and `:unselected:` into
`content` wherever it sees a checkbox-like glyph, and reports each one's span
in `pages[].selectionMarks`. In the fixture, 45 of 64 sit in running text,
where they are misread bullet glyphs, and 19 sit inside tables, where they are
real checkboxes of a screen mock.

`toParsedDocument` removes every selection-mark token whose span is not inside
a table or a figure, together with one following space. Every span in the
document is shifted to match, and paragraph `text` is the slice of the new
`content`. Marks inside tables and figures stay, because there a tick can be
the cell's whole content.

This is mechanical: positions come from the vendor's own output, not from
pattern matching on text.

## 4. Eval

`annotate.integration.test.ts` keeps its scoring. It additionally prints how
many findings aligned exactly, by normalization, and by whole-element fallback.
The baseline is 4 of 45 rows discarded.

The gate needs `packages/annotate/test/fixtures/expected.json`, a list of
`{ elementId, type }` for the fixture document. See "Needs from Jorge".

## Tests

Unit tests, no network:

- A quote differing only in case or whitespace is located, and the stored text
  is the source's wording.
- A quote that cannot be located yields a whole-element classification and a
  warning; nothing is dropped.
- A selection mark in running text is removed and every span still slices to
  its element's text; a mark in a table cell is kept.

The existing grounding, chunking and replay tests stay. Fixtures are
re-recorded: `parsed.json` from Parse's integration test, then the annotate
responses and `annotate.json` from Annotate's.

Definition of done includes `npm run test:integration` for `parse`,
`annotate` and `knowledge-graph`, since their fixtures change.

## Needs from Jorge

1. **The answer key.** `expected.json` for the fixture document. Two ways to
   produce it: write it from scratch, or correct a run's output while reading
   the whole document in the reader page. The second is faster and is common
   practice; its risk is anchoring on what the model found.
2. **The eval floor.** `FLOOR` is 0. A human raises it after the first scored
   run.
3. **The four boundary rules** in section 2.
4. **Source-side examples**, when a second requirements document is available.

## Out of scope

- A retry when the model returns an unknown element, and a second pass for
  missed findings. Both are standard; neither is justified until the eval
  shows the need.
- Fuzzy token alignment between the normalized step and the whole-element
  fallback. Add it if the eval shows many fallbacks.
- Findings that span two elements. A sentence Parse split in two is labeled on
  one of its halves.
- New types for the template sections that have none (in-scope items,
  acronyms, priority, release, project gates, sample data).
- Stray glyphs OCR leaves next to a removed mark (`/`, `"`).
