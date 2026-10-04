# Annotate Grounded Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Annotate from discarding findings over wording mismatches, give every ontology type a written guideline, and make the eval report how findings were aligned.

**Architecture:** `ground` becomes a three-step alignment (exact, folded, whole element) that never drops a finding whose element exists and always stores the source's own text. The prompt is assembled from a `Record<ClassificationType, string>` of guidelines extracted from the SRS template. Nothing else moves: same chunking, same single checked model call per chunk, same `AnnotateResult`.

**Tech Stack:** TypeScript, Node 24+, npm workspaces + Turborepo, Vercel AI SDK 7 with `@ai-sdk/azure` (`gpt-4o` on Azure AI Foundry), Zod 4, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-03-annotate-grounded-extraction-design.md`

## Global Constraints

- The unit of a finding is unchanged: a requirement statement quoted on one element. The stored `text` is always the slice of `content` at the stored `span`, never the model's string.
- A row is dropped only when its `elementId` does not exist.
- `AnnotateResult` and `Classification` keep their shape. `packages/knowledge-graph`, `apps/web` and `packages/parse` source are untouched.
- No agent, no retry loop, no second pass, no fuzzy token alignment, no sentence numbering. The model never returns character offsets.
- A guideline holds only what helps decide a label: no SRS section numbers, no identifier prefixes (FR, FEAT, ASM), no authoring rules.
- The model stays `gpt-4o`, `temperature: 0`, one `generateText` call per chunk with `Output.array`.
- Fixtures under `test/fixtures/` change only by recording or by replaying recordings through `ground`, never by hand.
- Tests cover business behavior only. No coverage-for-coverage tests.
- `packages/annotate/test/fixtures/expected.json` is written by Jorge. Never generate it. Until it exists the eval reports "recorded, not scored" and `FLOOR` stays 0.
- The repo pins npm 11.19.0 and the machine has 11.19.1, so plain `npm` fails with `EBADDEVENGINES`. Every command below uses `"$NPM"`, set in Task 1 Step 1.
- Branch: `ao/dark-factory-2/annotate-grounded-extraction`. Commit small, imperative mood. Do not push; pushing and opening a PR happen only when Jorge asks.

## Review Focus

Inputs the spec implies but does not spell out. Each has a test in Task 1.

1. The model returns an empty quote: the finding covers the whole element; it is not a zero-length classification.
2. The model returns the same finding twice, or two unlocatable quotes of one type on one element: one classification is stored.
3. The quote exists verbatim, but in a different element than the one cited: the cited element is labeled whole, with a warning; the finding is not silently moved.
4. Lower-casing changes a string's length (`İ` becomes two code units): the stored span still slices to the source's text.
5. The element has several spans and the quote is not located: the fallback covers the first span only (known ceiling, marked with a `ponytail:` comment).

---

### Task 1: Tolerant alignment in `ground`

**Files:**

- Modify: `packages/annotate/src/ground.ts` (whole file)
- Modify: `packages/annotate/test/ground.test.ts` (whole file)
- Regenerate: `packages/annotate/test/fixtures/annotate.json`

**Interfaces:**

- Consumes: `Span` from `@dark-factory/parse`; `CATEGORIES`, `TYPES`, `AnnotateResult` from `./types.ts`.
- Produces: `ground(rows: ClassificationRow[], anchors: Map<string, Span[]>, content: string): AnnotateResult`, `classificationSchema`, `ClassificationRow` (signatures unchanged). Two warning formats that Task 3 matches on:
  - `` `${elementId}: unknown element` ``
  - `` `${elementId}: quote not located, labeled the whole element: ${JSON.stringify(quote)}` ``

- [ ] **Step 1: Install dependencies with the pinned npm**

```bash
NPM=$(cd /tmp && npx -y -p npm@11.19.0 which npm | tail -1)
"$NPM" --version   # 11.19.0
"$NPM" install
"$NPM" run build
```

Expected: install and build complete; `node_modules/` exists in the worktree and `packages/parse/dist` exists, which the annotate typecheck resolves `@dark-factory/parse` from. `NPM` must be set again in every new shell.

- [ ] **Step 2: Replace the grounding tests**

Write `packages/annotate/test/ground.test.ts`:

```ts
import { expect, test } from "vitest";
import { ground, type ClassificationRow } from "../src/ground.ts";

const content =
  'intro\nThe system shall log in users. Typing is slow.\nx no "who :selected: knows X", no exports\nThe İSTANBUL depot ships daily.\nfooter';
const span = (text: string) => [
  { offset: content.indexOf(text), length: text.length },
];
const anchors = new Map([
  ["paragraphs/1", span("The system shall log in users. Typing is slow.")],
  ["paragraphs/2", span('x no "who :selected: knows X", no exports')],
  ["paragraphs/3", span("The İSTANBUL depot ships daily.")],
]);
const row = (
  elementId: string,
  quote: string,
  type: ClassificationRow["type"] = "functional-requirement",
): ClassificationRow => ({ elementId, quote, type, category: null });
const slice = (a: { span: { offset: number; length: number } }) =>
  content.slice(a.span.offset, a.span.offset + a.span.length);

test("a verbatim quote becomes a classification with a content span", () => {
  const { classifications, warnings } = ground(
    [row("paragraphs/1", "shall log in users")],
    anchors,
    content,
  );
  expect(warnings).toEqual([]);
  expect(classifications).toEqual([
    {
      id: "a1",
      type: "functional-requirement",
      elementId: "paragraphs/1",
      span: { offset: 17, length: 18 },
      text: "shall log in users",
    },
  ]);
});

test("a quote only matches on word boundaries", () => {
  const { classifications } = ground(
    [row("paragraphs/1", "in", "glossary-term")],
    anchors,
    content,
  );
  // "in" also occurs inside "Typing"; the match is the standalone word in "log in".
  const [a] = classifications;
  expect(content.slice(a!.span.offset - 1, a!.span.offset + 3)).toBe(" in ");
});

test("a quote that differs in case, spacing or quote characters is located, and the stored text is the source's", () => {
  const { classifications, warnings } = ground(
    [
      row("paragraphs/1", "the  System shall log in users"),
      row("paragraphs/2", "No “who knows X”, no exports", "out-of-scope"),
      row("paragraphs/3", "Depot Ships Daily"),
    ],
    anchors,
    content,
  );
  expect(warnings).toEqual([]);
  expect(classifications.map((a) => a.text)).toEqual([
    "The system shall log in users",
    'no "who :selected: knows X", no exports',
    "depot ships daily",
  ]);
  for (const a of classifications) expect(slice(a)).toBe(a.text);
});

test("a quote that cannot be located labels the whole element instead of being dropped", () => {
  const { classifications, warnings } = ground(
    [
      row("paragraphs/1", "Users must be able to sign in"),
      // Present in the document, but in another element than the one cited.
      row("paragraphs/1", "depot ships daily"),
      row("paragraphs/3", ""),
    ],
    anchors,
    content,
  );
  expect(classifications.map((a) => [a.elementId, a.text])).toEqual([
    ["paragraphs/1", "The system shall log in users. Typing is slow."],
    ["paragraphs/3", "The İSTANBUL depot ships daily."],
  ]);
  expect(warnings).toEqual([
    'paragraphs/1: quote not located, labeled the whole element: "Users must be able to sign in"',
    'paragraphs/1: quote not located, labeled the whole element: "depot ships daily"',
    'paragraphs/3: quote not located, labeled the whole element: ""',
  ]);
});

test("an element with several spans falls back to its first span", () => {
  const two = new Map([
    ["paragraphs/9", [...span("Typing is slow."), ...span("footer")]],
  ]);
  const { classifications } = ground(
    [row("paragraphs/9", "nowhere to be found")],
    two,
    content,
  );
  expect(classifications.map((a) => a.text)).toEqual(["Typing is slow."]);
});

test("an unknown element is dropped with a warning", () => {
  const { classifications, warnings } = ground(
    [row("paragraphs/99", "shall")],
    anchors,
    content,
  );
  expect(classifications).toEqual([]);
  expect(warnings).toEqual(["paragraphs/99: unknown element"]);
});

test("the same finding returned twice is stored once", () => {
  const { classifications } = ground(
    [
      row("paragraphs/1", "shall log in users"),
      row("paragraphs/1", "Shall log in users"),
      row("paragraphs/1", "shall log in users", "feature"),
    ],
    anchors,
    content,
  );
  expect(classifications.map((a) => [a.id, a.type])).toEqual([
    ["a1", "functional-requirement"],
    ["a2", "feature"],
  ]);
});
```

- [ ] **Step 3: Run the tests and watch them fail**

```bash
"$NPM" exec -w @dark-factory/annotate -- vitest run test/ground.test.ts
```

Expected: FAIL. "differs in case", "cannot be located", "several spans" and "stored once" fail against the exact-match-or-drop implementation; the other three pass.

- [ ] **Step 4: Rewrite `ground.ts`**

Write `packages/annotate/src/ground.ts`:

```ts
import type { Span } from "@dark-factory/parse";
import { z } from "zod";
import { CATEGORIES, TYPES, type AnnotateResult } from "./types.ts";

/** What the model returns. Quotes, never offsets. */
export const classificationSchema = z.object({
  elementId: z.string(),
  quote: z.string(),
  type: z.enum(TYPES),
  category: z.enum(CATEGORIES).nullable(),
});
export type ClassificationRow = z.infer<typeof classificationSchema>;

const wordChar = /[\p{L}\p{N}]/u;
/** How Azure Document Intelligence writes a checkbox-like glyph into the text. */
const MARK = /:(?:un)?selected:/y;
const PUNCT: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
};

/**
 * `text` folded for comparison: lower case, whitespace runs and selection
 * marks as one space, typographic quotes and dashes as ASCII. `at[i]` is the
 * offset in `content` of the source character behind `folded[i]`.
 */
function fold(text: string, base = 0): { folded: string; at: number[] } {
  let folded = "";
  const at: number[] = [];
  for (let i = 0; i < text.length;) {
    MARK.lastIndex = i;
    const mark = MARK.exec(text)?.[0];
    const ch = text[i]!;
    const out = mark || /\s/.test(ch) ? " " : (PUNCT[ch] ?? ch).toLowerCase();
    if (!(out === " " && folded.endsWith(" "))) {
      folded += out;
      for (let k = 0; k < out.length; k++) at.push(base + i);
    }
    i += mark ? mark.length : 1;
  }
  return { folded, at };
}

/** First occurrence of `needle` in `hay[from, end)` that sits on word boundaries, or -1. */
function find(hay: string, needle: string, from = 0, end = hay.length): number {
  for (
    let i = hay.indexOf(needle, from);
    i >= 0 && i + needle.length <= end;
    i = hay.indexOf(needle, i + 1)
  ) {
    const before = hay[i - 1] ?? "";
    const after = hay[i + needle.length] ?? "";
    if (!wordChar.test(before) && !wordChar.test(after)) return i;
  }
  return -1;
}

/**
 * Model rows in, grounded classifications out. Each quote is aligned to its
 * element's text: verbatim first, then folded, and when it cannot be located
 * the classification covers the whole element and a warning says so. A row is
 * dropped only when its element does not exist. The stored text is always the
 * source's, never the model's. This is the step boundary AI output must cross.
 */
export function ground(
  rows: ClassificationRow[],
  anchors: Map<string, Span[]>,
  content: string,
): AnnotateResult {
  const result: AnnotateResult = { classifications: [], warnings: [] };
  const seen = new Set<string>();

  const locate = (spans: Span[], quote: string): Span | undefined => {
    if (!quote.trim()) return undefined;
    for (const s of spans) {
      const i = find(content, quote, s.offset, s.offset + s.length);
      if (i >= 0) return { offset: i, length: quote.length };
    }
    const needle = fold(quote).folded.trim();
    for (const s of spans) {
      const { folded, at } = fold(
        content.slice(s.offset, s.offset + s.length),
        s.offset,
      );
      const i = find(folded, needle);
      if (i < 0) continue;
      const offset = at[i]!;
      return { offset, length: at[i + needle.length - 1]! + 1 - offset };
    }
  };

  for (const row of rows) {
    const spans = anchors.get(row.elementId);
    if (!spans) {
      result.warnings.push(`${row.elementId}: unknown element`);
      continue;
    }
    let span = locate(spans, row.quote);
    if (!span) {
      // ponytail: an element with several spans is labeled on its first; widen Classification.span to Span[] if that loses text that matters.
      span = spans[0]!;
      result.warnings.push(
        `${row.elementId}: quote not located, labeled the whole element: ${JSON.stringify(row.quote)}`,
      );
    }
    const key = `${row.elementId}|${row.type}|${span.offset}|${span.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.classifications.push({
      id: `a${result.classifications.length + 1}`,
      type: row.type,
      elementId: row.elementId,
      span,
      text: content.slice(span.offset, span.offset + span.length),
      ...(row.category && { category: row.category }),
    });
  }
  return result;
}
```

- [ ] **Step 5: Run the grounding tests and watch them pass**

```bash
"$NPM" exec -w @dark-factory/annotate -- vitest run test/ground.test.ts
```

Expected: 7 passed.

- [ ] **Step 6: Regenerate `annotate.json` by replaying the recorded responses**

The replay test compares `ground(recorded rows)` with the golden file, so the golden file must be regenerated from the same recordings. No network.

```bash
cd packages/annotate && node --input-type=module -e '
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { anchors } from "./src/chunk.ts";
import { ground } from "./src/ground.ts";
import { doc } from "./test/doc.ts";
const dir = "test/fixtures/annotate-responses/";
const rows = readdirSync(dir)
  .sort((a, b) => parseInt(a) - parseInt(b))
  .flatMap((f) => JSON.parse(readFileSync(dir + f, "utf8")));
const result = ground(rows, anchors(doc), doc.content);
writeFileSync("test/fixtures/annotate.json", JSON.stringify(result, null, 2));
console.log(result.classifications.length, "classifications,", result.warnings.length, "warnings");
' && cd ../..
```

Expected output: `45 classifications, 2 warnings`. Before this change the same recordings gave 41 classifications and 4 discarded rows. `git diff --stat packages/annotate/test/fixtures/annotate.json` shows the 4 recovered findings (`paragraphs/22`, `paragraphs/24`, `paragraphs/25`, `paragraphs/76`), renumbered ids, and the 2 new warnings.

- [ ] **Step 7: Run every test that reads the fixture**

```bash
"$NPM" test -w @dark-factory/annotate
"$NPM" test -w web
```

Expected: both PASS. `web`'s `segments.test.ts` checks that every fixture classification is recovered verbatim from its element, which covers the two whole-element classifications.

- [ ] **Step 8: Commit**

```bash
git add packages/annotate/src/ground.ts packages/annotate/test/ground.test.ts packages/annotate/test/fixtures/annotate.json
git commit -m "Align quotes tolerantly instead of dropping them"
```

---

### Task 2: Ontology guidelines in the prompt

**Files:**

- Create: `packages/annotate/src/guidelines.ts`
- Modify: `packages/annotate/src/prompt.ts` (whole file)
- Delete: `docs/srs-ontology.md`

**Interfaces:**

- Consumes: `ClassificationType`, `TYPES` from `./types.ts`.
- Produces: `GUIDELINES: Record<ClassificationType, string>` from `./guidelines.ts`; `prompt.ts` keeps its default string export, which `annotate.ts` already imports.

There is no unit test in this task. "Every type has a guideline" is enforced by the `Record<ClassificationType, string>` type, and the prompt's effect on labels is what the eval measures (Task 4).

- [ ] **Step 1: Generate `guidelines.ts` from the ontology file**

Each `## <type>` section of `docs/srs-ontology.md` becomes one entry, verbatim, with backticks removed (they would end the template literal). Four entries get one extra bullet each: the boundary rules Jorge accepted in the spec. Run this one-off script from the repo root; do not commit the script.

```bash
cat > /tmp/gen-guidelines.mjs <<'EOF'
import { readFileSync, writeFileSync } from "node:fs";
const [, , md, out] = process.argv;
const extra = {
  "imposed-technology":
    "- **Identity providers:** imposed-technology when the source mandates the provider; integration when the source describes the exchange with it. One statement can carry both labels.",
  "data-requirement":
    "- **Encryption at rest:** data-requirement when stated about a named entity or attribute; non-functional-requirement (SEC) when stated for the whole system.",
  "ux-requirement":
    '- **Vague wishes:** label usability wishes such as "intuitive" or "easy to learn" too, even without a measurable target.',
  standard:
    "- **Also label:** the same statement with the type of the requirement the standard imposes.",
};
const sections = readFileSync(md, "utf8").split(/^## /m).slice(1);
const entries = sections.map((s) => {
  const [type, ...body] = s.split("\n");
  const text = [body.join("\n").trim().replaceAll("`", ""), extra[type]]
    .filter(Boolean)
    .join("\n");
  return `  ${JSON.stringify(type)}: \`${text}\`,`;
});
writeFileSync(
  out,
  `import type { ClassificationType } from "./types.ts";

/**
 * One labeling guideline per type: definition, when to label, what it is not,
 * examples. Only what helps decide a label; nothing about how an SRS is laid
 * out or written. Extracted from the IEEE 29148-tailored SRS template.
 */
export const GUIDELINES: Record<ClassificationType, string> = {
${entries.join("\n")}
};
`,
);
EOF
node /tmp/gen-guidelines.mjs docs/srs-ontology.md packages/annotate/src/guidelines.ts
```

Expected: `packages/annotate/src/guidelines.ts` exists with 19 entries. The first one reads:

```ts
  "business-goal": `- **Definition:** why the software exists: the business problem and who
  suffers it, or the outcome the product must cause and how success will be
  recognized.
- **Label when:** the statement names a business problem, an outcome, or a
  measurable goal. Usually found in a background or objectives passage.
- **Not this:** what the system is (product); what it can do (feature).`,
```

- [ ] **Step 2: Rewrite `prompt.ts`**

Write `packages/annotate/src/prompt.ts`:

```ts
import { GUIDELINES } from "./guidelines.ts";
import { TYPES } from "./types.ts";

export default `You label statements in a software requirements document (an RFP or similar) with what they are evidence of.

You receive the document as lines. Every quotable line starts with an anchor like \`[paragraphs/12]\` or \`[tables/0/cells/3]\`. Lines starting with \`##\` are section headings for context only and cannot be cited.

For every statement that is evidence for one of the types below, return one row with:

- \`elementId\`: the anchor of the line the text is on, without the brackets.
- \`quote\`: the exact text, copied verbatim from that line. Never paraphrase, never merge text from two lines, never fix typos.
- \`type\`: one of the types below.
- \`category\`: for \`non-functional-requirement\` only, one of PER, REL, SEC, PRV, SCA, MNT, CMP; \`null\` for every other type.

Rules:

- One row per finding. A line can produce several rows, of the same type or of different types, or none.
- Quote the smallest span that fully states the finding.
- Do not invent findings. If nothing on a line matches a type, skip it.
- \`:selected:\` and \`:unselected:\` are scanning artifacts with no meaning. Do not label them; when one falls inside your quote, copy it as it is.
- Do not assign priorities, IDs, or statuses. That happens later.

Each type below has a definition, when to label it, what it is not, and examples. The examples show how an item reads once it is written down cleanly; the source will phrase the same thing more loosely.

${TYPES.map((type) => `## ${type}\n\n${GUIDELINES[type]}`).join("\n\n")}
`;
```

- [ ] **Step 3: Format, typecheck, and check the assembled prompt**

```bash
"$NPM" exec -- prettier --write packages/annotate/src/guidelines.ts packages/annotate/src/prompt.ts
"$NPM" run check-types -w @dark-factory/annotate
node --input-type=module -e '
import prompt from "./packages/annotate/src/prompt.ts";
const types = prompt.split("\n").filter((l) => l.startsWith("## ")).length;
console.log(prompt.length, "chars,", types, "types,", /Becomes|§|FEAT|\bFR\b/.test(prompt) ? "SRS LAYOUT LEAKED" : "no SRS layout");
'
```

Expected: typecheck passes (it fails if any type in `TYPES` lacks a guideline); the last command prints roughly `12400 chars, 19 types, no SRS layout`.

- [ ] **Step 4: Delete the ontology file**

The module is now the single home of the guidelines.

```bash
git rm -q docs/srs-ontology.md
```

- [ ] **Step 5: Run the package's tests and lint**

```bash
"$NPM" test -w @dark-factory/annotate
"$NPM" run lint -w @dark-factory/annotate
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/annotate/src/guidelines.ts packages/annotate/src/prompt.ts
git commit -m "Build the Annotate prompt from per-type guidelines"
```

---

### Task 3: Alignment counts in the eval output

**Files:**

- Modify: `packages/annotate/test/annotate.integration.test.ts:55-59`

**Interfaces:**

- Consumes: the two warning formats produced by Task 1.

- [ ] **Step 1: Print how findings were aligned**

In `packages/annotate/test/annotate.integration.test.ts`, replace:

```ts
console.log(
  `${classifications.length} classifications, ${warnings.length} warnings`,
);
for (const w of warnings) console.log(`  ${w}`);
```

with:

```ts
const whole = warnings.filter((w) =>
  w.includes(": quote not located, labeled the whole element: "),
).length;
const dropped = warnings.filter((w) => w.endsWith(": unknown element")).length;
console.log(
  `${classifications.length} classifications: ${classifications.length - whole} located, ${whole} whole-element; ${dropped} rows dropped`,
);
for (const w of warnings) console.log(`  ${w}`);
```

- [ ] **Step 2: Typecheck and lint**

```bash
"$NPM" run check-types -w @dark-factory/annotate
"$NPM" run lint -w @dark-factory/annotate
```

Expected: both PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/annotate/test/annotate.integration.test.ts
git commit -m "Report how findings were aligned in the Annotate eval"
```

---

### Task 4: Re-record against live Azure and run every gate

**Files:**

- Re-record: `packages/annotate/test/fixtures/annotate-responses/*.json`
- Re-record: `packages/annotate/test/fixtures/annotate.json`

The prompt changed in Task 2, so the recorded model responses are stale. This task needs `AZURE_FOUNDRY_ENDPOINT` and `AZURE_API_KEY` in the repo-root `.env`, and local Postgres for the knowledge-graph round trip.

- [ ] **Step 1: Make sure the worktree has a `.env`**

```bash
test -f .env || cp /Users/jorge/Development/dark-factory/.env .env
git check-ignore .env   # prints .env
```

- [ ] **Step 2: Run the live annotate eval**

```bash
"$NPM" run test:integration -w @dark-factory/annotate
```

Expected: PASS. The output has the alignment line (`N classifications: L located, W whole-element; D rows dropped`), any warnings, and `fixtures/expected.json missing: recorded, not scored`. Copy the alignment line and the warnings for the report. If `expected.json` exists by then, copy the precision/recall table instead.

- [ ] **Step 3: Copy the recording into the fixtures**

```bash
SHA=$(node -p 'require("./packages/parse/test/fixtures/parsed.json").source.sha256')
rm packages/annotate/test/fixtures/annotate-responses/*.json
cp packages/annotate/test/out/$SHA/annotate/*.json packages/annotate/test/fixtures/annotate-responses/
cp packages/annotate/test/out/$SHA/annotate.json packages/annotate/test/fixtures/annotate.json
git diff --stat packages/annotate/test/fixtures
```

Review the diff like code: which findings appeared, which disappeared, and whether any type's labels look worse than before.

- [ ] **Step 4: Run every gate**

```bash
"$NPM" run check-types
"$NPM" run lint
"$NPM" run build
"$NPM" test
"$NPM" run test:integration -w @dark-factory/knowledge-graph
```

Expected: all PASS. The replay test passes because the fixtures in Step 3 come from one run. The knowledge-graph round trip reads the new `annotate.json`.

- [ ] **Step 5: Commit**

```bash
git add packages/annotate/test/fixtures
git commit -m "Re-record annotate fixtures for the guideline prompt"
```

- [ ] **Step 6: Report**

Report to Jorge, without pushing: the alignment line before (41 kept, 4 discarded of 45 rows) and after, the warnings, the fixture diff summary, the gate results, and that the eval is "recorded, not scored" until `expected.json` exists.
