# Annotate Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After Parse's `build`, the same job runs Annotate's three operations (`classify`, `mentions`, `validate`) durably, stores the raw model responses and `annotate.json` in Blob, and the canvas's Annotate node fills in on its own.

**Architecture:** `packages/annotate` gets the same refactor Parse got: the model calls become exported functions that return output instead of writing files, and the CLI composes them. In `apps/web` the operations module becomes step-aware, the create handler inserts six rows, and the workflow (`runJob`) runs Parse's operations then Annotate's. Prompts ship with the built package and the web app loads it unbundled.

**Tech Stack:** Vercel Workflow SDK (installed), Drizzle, `@azure/storage-blob`, `ai` + `@ai-sdk/azure` (already deps of `packages/annotate`), Vitest 5.

**Spec:** `docs/superpowers/specs/2026-09-16-annotate-operations-design.md`

## Global Constraints

- Vocabulary: **job**, **station**, **step** (Parse, Annotate, Resolve), **operation**. Parse's operations: `upload`, `analyze`, `build`. Annotate's: `classify`, `mentions`, `validate`. Never call an operation a step; the SDK's `"use step"` functions implement operations.
- Job status: `running` at workflow start, `done` after `validate`, `failed` on any exhausted throw. No Parse `publish` operation any more.
- Blob paths under `<jobId>/`: `annotate/classify/<i>.json`, `annotate/mentions/<i>.json`, `annotate.json`. Chunk index `i` comes from `chunk(doc)` on `parsed.json`, recomputed in every operation.
- `FatalError` (from `workflow`) for anything that cannot succeed on retry (missing blobs, invalid JSON); plain errors for model calls.
- `apps/web` uses the `@/` alias. `packages/annotate` sources import each other with `./x.ts` extensions (see existing files).
- Branch: `feat/annotate-operations` (exists, spec and plan committed). Never commit to `main`. Commit after every task. Push only when opening the PR through the `origin` skill.
- Definition of done before the PR: `npm run check-types`, `npm run lint`, `npm run build`, `npm test`, `npm run test:integration -w packages/parse` (unchanged package, still run), `npm run test:integration -w apps/web` (needs the dev server on 3001 and `.env`), and `npm run test:integration -w packages/annotate`, which is the eval and is expected to fail on the missing `test/fixtures/expected.json`: report its output honestly, do not create that file.
- Commit messages: imperative, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Prettier is enforced by lint; run `npx prettier --write <files>` before gates. Do not commit `apps/web/next-env.d.ts`.
- The dev server is started with the preview tool (configuration `web`), never with Bash. Root `.env` is symlinked into `apps/web/.env`.

---

## File structure

| File                                                      | Responsibility                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/annotate/src/annotate.ts`                       | `runClassify`, `runMentions` (model calls, no IO); `annotate(doc, outDir)` for the CLI.                                                           |
| `packages/annotate/src/index.ts`                          | Exports `annotate`, `runClassify`, `runMentions`, `chunk`, `anchors`, `validate`, types.                                                          |
| `packages/annotate/package.json`                          | `build` copies `src/*.md` into `dist/`.                                                                                                           |
| `scripts/pipeline.mts`                                    | Reads `classifications`/`mentions` from the result.                                                                                               |
| `apps/web/lib/operations.ts`                              | `OPERATIONS` per step, `initialOperations(jobId)`, `setOperation`, `runOperation` (step-aware).                                                   |
| `apps/web/test/operations.test.ts`                        | Tests for `initialOperations` and `runOperation`.                                                                                                 |
| `apps/web/workflows/job.ts`                               | `runJob(jobId)`: Parse's `analyze`, `build`, then Annotate's `classify` + `mentions` in parallel, then `validate`. Replaces `workflows/parse.ts`. |
| `apps/web/app/api/jobs/route.ts`                          | Inserts `initialOperations(id)`, starts `runJob`.                                                                                                 |
| `apps/web/app/api/jobs/[id]/artifacts/[...path]/route.ts` | Allowlist gains the three annotate shapes.                                                                                                        |
| `apps/web/instrumentation.ts`                             | Asserts `AZURE_API_KEY` too.                                                                                                                      |
| `apps/web/next.config.ts`                                 | `serverExternalPackages: ["@dark-factory/annotate"]`.                                                                                             |
| `apps/web/test/parse-job.integration.test.ts`             | Six operations, `annotate.json`, 300 s timeout.                                                                                                   |
| `apps/web/README.md`, `AGENTS.md`                         | Annotate operations and env var mentioned.                                                                                                        |

---

### Task 1: Annotate package: model calls return output, CLI writes files

**Files:**

- Modify: `packages/annotate/src/annotate.ts`, `packages/annotate/src/index.ts`, `packages/annotate/package.json`, `scripts/pipeline.mts`
- Test: existing `packages/annotate/test/*.test.ts` (unchanged, must stay green)

**Interfaces:**

- Produces, from `@dark-factory/annotate`: `runClassify(text: string): Promise<ModelOutput["classifications"]>`, `runMentions(text: string): Promise<ModelOutput["mentions"]>`, `chunk(doc: ParsedDocument): string[]`, `anchors(doc: ParsedDocument): Map<string, Span[]>`, `validate(output: ModelOutput, anchors, content): AnnotateResult`, types `ModelOutput`, `AnnotateResult`, `Classification`, `Mention`. `annotate(doc, outDir)` unchanged in signature and files written.

- [ ] **Step 1: Split the model call out of `annotate()`**

Replace `run` and `annotate` in `packages/annotate/src/annotate.ts` with:

```ts
async function run<T>(
  task: { instructions: string; schema: z.ZodType<T> },
  text: string,
): Promise<T[]> {
  const { output } = await generateText({
    model: azure(MODEL),
    output: Output.array({ element: task.schema }),
    temperature: 0,
    instructions: task.instructions,
    prompt: text,
  });
  return output;
}

/** One chunk of document text in, the model's classification rows out. Calls the model every time. */
export const runClassify = (text: string) => run(TASKS.classify, text);
/** One chunk of document text in, the model's mention rows out. Calls the model every time. */
export const runMentions = (text: string) => run(TASKS.mentions, text);

/**
 * ParsedDocument in, grounded classifications and mentions out. Every run
 * calls the model; nothing is reused between runs. Everything lands in
 * `<outDir>/<sha256>/`: two model calls per chunk, raw responses written to
 * `annotate/classify/<i>.json` and `annotate/mentions/<i>.json`; the
 * validated result in `annotate.json`.
 */
export async function annotate(
  doc: ParsedDocument,
  outDir: string,
): Promise<AnnotateResult> {
  const dir = join(outDir, doc.source.sha256);
  for (const t of Object.keys(TASKS))
    await mkdir(join(dir, "annotate", t), { recursive: true });
  const write = (t: string, i: number, data: unknown) =>
    writeFile(
      join(dir, "annotate", t, `${i}.json`),
      JSON.stringify(data, null, 2),
    );
  // ponytail: all chunks in flight at once; add a concurrency cap if Azure rate limits bite.
  const outputs = await Promise.all(
    chunk(doc).map(async (text, i) => {
      const [classifications, mentions] = await Promise.all([
        runClassify(text),
        runMentions(text),
      ]);
      await Promise.all([
        write("classify", i, classifications),
        write("mentions", i, mentions),
      ]);
      return { classifications, mentions };
    }),
  );
  const result = validate(
    {
      classifications: outputs.flatMap((o) => o.classifications),
      mentions: outputs.flatMap((o) => o.mentions),
    },
    anchors(doc),
    doc.content,
  );
  await writeFile(join(dir, "annotate.json"), JSON.stringify(result, null, 2));
  return result;
}
```

Keep the imports, `prompt`, `TASKS`, `MODEL`, and `azure` as they are.

- [ ] **Step 2: Exports and build**

`packages/annotate/src/index.ts`: add

```ts
export { annotate, runClassify, runMentions } from "./annotate.ts";
export { anchors, chunk } from "./chunk.ts";
export { validate, type ModelOutput } from "./validate.ts";
```

replacing the existing `export { annotate }` and `export { validate }` lines; keep `export type * from "./types.ts";` and the CLI block.

`packages/annotate/package.json`: change `"build": "tsc"` to `"build": "tsc && cp src/*.md dist/"`.

`scripts/pipeline.mts`: replace the two `annotations` lines with

```ts
const { classifications, mentions, warnings } = await annotate(doc, outDir);
console.log(
  `annotate: ${classifications.length} classifications, ${mentions.length} mentions, ${warnings.length} warnings`,
);
```

- [ ] **Step 3: Gates**

```bash
npx prettier --write packages/annotate/src scripts && npm run check-types -w packages/annotate && npm run lint -w packages/annotate && npm run build -w packages/annotate && npm test -w packages/annotate && ls packages/annotate/dist/*.md
```

Expected: all pass; `dist/classify.md` and `dist/mentions.md` listed.

- [ ] **Step 4: Eval (expected to fail on the missing fixture; report, do not fix)**

```bash
npm run test:integration -w packages/annotate 2>&1 | tail -20
```

Expected: the live model calls succeed and the test fails reading `test/fixtures/expected.json` (ENOENT). Paste the tail in the report. If it fails earlier (credentials, model), report that instead.

- [ ] **Step 5: Commit**

```bash
git add packages/annotate scripts/pipeline.mts
git commit -m "Export runClassify and runMentions from annotate, ship prompts in dist

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Step-aware operations and six rows per job

**Files:**

- Modify: `apps/web/lib/operations.ts`, `apps/web/app/api/jobs/route.ts`
- Test: `apps/web/test/operations.test.ts`

**Interfaces:**

- Produces:

```ts
export const OPERATIONS = {
  parse: ["upload", "analyze", "build"],
  annotate: ["classify", "mentions", "validate"],
} as const;
export type StepName = keyof typeof OPERATIONS;
export type OperationName = (typeof OPERATIONS)[StepName][number];
export function initialOperations(
  jobId: string,
  now: Date,
): (typeof operations.$inferInsert)[];
export async function setOperation(
  jobId: string,
  step: StepName,
  name: OperationName,
  patch: OperationPatch,
): Promise<void>;
export async function runOperation<T>(
  jobId: string,
  step: StepName,
  name: OperationName,
  fn: () => Promise<T>,
  set = setOperation,
): Promise<T>;
```

- [ ] **Step 1: Failing tests**

Replace `apps/web/test/operations.test.ts` with:

```ts
import { expect, test } from "vitest";
import {
  initialOperations,
  runOperation,
  type OperationPatch,
} from "@/lib/operations";

const recorder = () => {
  const calls: { step: string; name: string; patch: OperationPatch }[] = [];
  const set = async (
    _job: string,
    step: string,
    name: string,
    patch: OperationPatch,
  ) => {
    calls.push({ step, name, patch });
  };
  return { calls, set };
};

test("initialOperations lists every operation of every step, upload done", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const rows = initialOperations("j", now);
  expect(rows.map((r) => [r.step, r.name, r.position, r.status])).toEqual([
    ["parse", "upload", 0, "done"],
    ["parse", "analyze", 1, "pending"],
    ["parse", "build", 2, "pending"],
    ["annotate", "classify", 0, "pending"],
    ["annotate", "mentions", 1, "pending"],
    ["annotate", "validate", 2, "pending"],
  ]);
  expect(rows[0]).toMatchObject({
    jobId: "j",
    startedAt: now,
    finishedAt: now,
  });
  expect(rows[1]?.startedAt).toBeNull();
});

test("marks running then done and returns the value", async () => {
  const { calls, set } = recorder();
  const out = await runOperation(
    "j",
    "annotate",
    "classify",
    async () => 42,
    set,
  );
  expect(out).toBe(42);
  expect(calls.map((c) => [c.step, c.name, c.patch.status])).toEqual([
    ["annotate", "classify", "running"],
    ["annotate", "classify", "done"],
  ]);
  expect(calls[0]?.patch.startedAt).toBeInstanceOf(Date);
  expect(calls[1]?.patch.finishedAt).toBeInstanceOf(Date);
});

test("marks failed with the message and rethrows", async () => {
  const { calls, set } = recorder();
  await expect(
    runOperation(
      "j",
      "parse",
      "analyze",
      async () => {
        throw new Error("boom");
      },
      set,
    ),
  ).rejects.toThrow("boom");
  expect(calls[1]?.patch).toMatchObject({ status: "failed", error: "boom" });
});
```

Run: `npm test -w apps/web`. Expected: FAIL (`initialOperations` missing, `runOperation` arity).

- [ ] **Step 2: Implement `apps/web/lib/operations.ts`**

```ts
import { and, eq } from "drizzle-orm";
import { db, operations } from "./db";

/** Every step's operations, in assembly-line order. Only this file knows them. */
export const OPERATIONS = {
  parse: ["upload", "analyze", "build"],
  annotate: ["classify", "mentions", "validate"],
} as const;
export type StepName = keyof typeof OPERATIONS;
export type OperationName = (typeof OPERATIONS)[StepName][number];
export type OperationPatch = Partial<
  Pick<
    typeof operations.$inferInsert,
    "status" | "error" | "startedAt" | "finishedAt"
  >
>;

/** The rows a new job starts with: upload already done by the create handler, everything else pending. */
export function initialOperations(jobId: string, now: Date) {
  return (Object.keys(OPERATIONS) as StepName[]).flatMap((step) =>
    OPERATIONS[step].map((name, position) => {
      const done = name === "upload";
      return {
        jobId,
        step,
        name,
        position,
        status: done ? ("done" as const) : ("pending" as const),
        startedAt: done ? now : null,
        finishedAt: done ? now : null,
      };
    }),
  );
}

export async function setOperation(
  jobId: string,
  step: StepName,
  name: OperationName,
  patch: OperationPatch,
) {
  await db
    .update(operations)
    .set(patch)
    .where(
      and(
        eq(operations.jobId, jobId),
        eq(operations.step, step),
        eq(operations.name, name),
      ),
    );
}

/** Runs one operation body and records running, done, or failed around it. Rethrows so the SDK can retry. */
export async function runOperation<T>(
  jobId: string,
  step: StepName,
  name: OperationName,
  fn: () => Promise<T>,
  set: typeof setOperation = setOperation,
): Promise<T> {
  await set(jobId, step, name, {
    status: "running",
    startedAt: new Date(),
    error: null,
  });
  try {
    const out = await fn();
    await set(jobId, step, name, { status: "done", finishedAt: new Date() });
    return out;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await set(jobId, step, name, {
      status: "failed",
      finishedAt: new Date(),
      error,
    });
    throw err;
  }
}
```

If TypeScript rejects the recorder's `set` (string vs `StepName`) in the test, type the recorder's parameters as `StepName` and `OperationName` imported from `@/lib/operations`.

- [ ] **Step 3: Create handler uses `initialOperations`**

In `apps/web/app/api/jobs/route.ts` replace the `operations` insert body with:

```ts
await tx.insert(operations).values(initialOperations(id, now));
```

and change the import to `import { initialOperations } from "@/lib/operations";` (drop `OPERATIONS`, `STEP`). Leave the `parseJob` import for now; Task 3 renames it.

- [ ] **Step 4: Fix the workflow's call sites for the new signature (temporary, Task 3 rewrites the file)**

In `apps/web/workflows/parse.ts` change the three `runOperation(jobId, "<name>", …)` calls to `runOperation(jobId, "parse", "<name>", …)`, and delete `publishOperation` and its call: after `const counts = await buildOperation(jobId);` add `await setJob(jobId, { status: "done", finishedAt: new Date() });` (this line moves to the end of `runJob` in Task 3). `"publish"` is no longer a valid `OperationName`, so the build fails until it is gone.

- [ ] **Step 5: Gates and commit**

```bash
npx prettier --write apps/web && npm run check-types -w apps/web && npm run lint -w apps/web && npm test -w apps/web && npm run build -w apps/web
git checkout -- apps/web/next-env.d.ts
git add apps/web/lib/operations.ts apps/web/test/operations.test.ts apps/web/app/api/jobs/route.ts apps/web/workflows/parse.ts
git commit -m "Make operations step-aware and seed all six rows per job

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Expected: `npm test -w apps/web` shows 3 operations tests plus the existing upload and graph tests, all passing.

---

### Task 3: `runJob`: Parse then Annotate operations

**Files:**

- Create: `apps/web/workflows/job.ts` (moved from `workflows/parse.ts`, which is deleted)
- Modify: `apps/web/app/api/jobs/route.ts` (import), `apps/web/app/api/jobs/[id]/artifacts/[...path]/route.ts`, `apps/web/instrumentation.ts`, `apps/web/next.config.ts`, `apps/web/package.json` (dependency)
- Test: `apps/web/test/parse-job.integration.test.ts`

**Interfaces:**

- Consumes: `runClassify`, `runMentions`, `chunk`, `anchors`, `validate`, `ModelOutput` from `@dark-factory/annotate` (Task 1); `runOperation(jobId, step, name, fn)` (Task 2); `getBlob`, `putBlob`; `FatalError`.
- Produces: `runJob(jobId: string)`, a `"use workflow"` function.

- [ ] **Step 1: Dependency and config**

```bash
npm i -w apps/web @dark-factory/annotate
```

`apps/web/next.config.ts`:

```ts
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  transpilePackages: ["@dark-factory/ui"],
  // Loaded from its built dist so its prompt files resolve next to the code.
  serverExternalPackages: ["@dark-factory/annotate"],
};

export default withWorkflow(nextConfig);
```

`apps/web/instrumentation.ts`: add `"AZURE_API_KEY"` to the asserted list.

- [ ] **Step 2: The workflow**

`git mv apps/web/workflows/parse.ts apps/web/workflows/job.ts`, then make the file:

```ts
import {
  analyze,
  toParsedDocument,
  type ParsedDocument,
} from "@dark-factory/parse";
import {
  anchors,
  chunk,
  runClassify,
  runMentions,
  validate,
  type ModelOutput,
} from "@dark-factory/annotate";
import type { AnalyzeResultOutput } from "@azure-rest/ai-document-intelligence";
import { eq } from "drizzle-orm";
import { FatalError } from "workflow";
import { getBlob, putBlob } from "@/lib/blob";
import { db, jobs } from "@/lib/db";
import { runOperation } from "@/lib/operations";

const json = (data: unknown) => new TextEncoder().encode(JSON.stringify(data));

async function readJson<T>(path: string): Promise<T> {
  const raw = await getBlob(path);
  if (!raw) throw new FatalError(`${path} missing`);
  try {
    return JSON.parse(raw.toString("utf8")) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new FatalError(`${path} is not valid JSON: ${message}`);
  }
}

async function setJob(jobId: string, patch: Partial<typeof jobs.$inferInsert>) {
  "use step";
  await db.update(jobs).set(patch).where(eq(jobs.id, jobId));
}

async function analyzeOperation(jobId: string) {
  "use step";
  await runOperation(jobId, "parse", "analyze", async () => {
    const pdf = await getBlob(`${jobId}/source.pdf`);
    if (!pdf) throw new FatalError("source.pdf missing");
    const { result, figures } = await analyze(pdf);
    for (const { id, png } of figures)
      await putBlob(`${jobId}/figures/${id}.png`, png, "image/png");
    await putBlob(`${jobId}/analysis.json`, json(result), "application/json");
  });
}

async function buildOperation(jobId: string) {
  "use step";
  return runOperation(jobId, "parse", "build", async () => {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    if (!job) throw new FatalError("job missing");
    const result = await readJson<AnalyzeResultOutput>(
      `${jobId}/analysis.json`,
    );
    const doc = toParsedDocument(result, job.sha256);
    await putBlob(`${jobId}/parsed.json`, json(doc), "application/json");
    return { elements: doc.elements.length, warnings: doc.warnings.length };
  });
}

async function classifyOperation(jobId: string) {
  "use step";
  return runOperation(jobId, "annotate", "classify", async () => {
    const doc = await readJson<ParsedDocument>(`${jobId}/parsed.json`);
    const chunks = chunk(doc);
    // ponytail: all chunks in flight at once; add a concurrency cap if Azure rate limits bite.
    await Promise.all(
      chunks.map(async (text, i) => {
        const rows = await runClassify(text);
        await putBlob(
          `${jobId}/annotate/classify/${i}.json`,
          json(rows),
          "application/json",
        );
      }),
    );
    return { chunks: chunks.length };
  });
}

async function mentionsOperation(jobId: string) {
  "use step";
  return runOperation(jobId, "annotate", "mentions", async () => {
    const doc = await readJson<ParsedDocument>(`${jobId}/parsed.json`);
    const chunks = chunk(doc);
    await Promise.all(
      chunks.map(async (text, i) => {
        const rows = await runMentions(text);
        await putBlob(
          `${jobId}/annotate/mentions/${i}.json`,
          json(rows),
          "application/json",
        );
      }),
    );
    return { chunks: chunks.length };
  });
}

async function validateOperation(jobId: string) {
  "use step";
  return runOperation(jobId, "annotate", "validate", async () => {
    const doc = await readJson<ParsedDocument>(`${jobId}/parsed.json`);
    const n = chunk(doc).length;
    const indexes = Array.from({ length: n }, (_, i) => i);
    const [classifications, mentions] = await Promise.all([
      Promise.all(
        indexes.map((i) =>
          readJson<ModelOutput["classifications"]>(
            `${jobId}/annotate/classify/${i}.json`,
          ),
        ),
      ),
      Promise.all(
        indexes.map((i) =>
          readJson<ModelOutput["mentions"]>(
            `${jobId}/annotate/mentions/${i}.json`,
          ),
        ),
      ),
    ]);
    const result = validate(
      { classifications: classifications.flat(), mentions: mentions.flat() },
      anchors(doc),
      doc.content,
    );
    await putBlob(`${jobId}/annotate.json`, json(result), "application/json");
    return {
      classifications: result.classifications.length,
      mentions: result.mentions.length,
      warnings: result.warnings.length,
    };
  });
}

/** One job down Station 1: Parse's operations, then Annotate's. */
export async function runJob(jobId: string) {
  "use workflow";
  await setJob(jobId, { status: "running" });
  try {
    await analyzeOperation(jobId);
    await buildOperation(jobId);
    await Promise.all([classifyOperation(jobId), mentionsOperation(jobId)]);
    const counts = await validateOperation(jobId);
    await setJob(jobId, { status: "done", finishedAt: new Date() });
    return counts;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await setJob(jobId, { status: "failed", error, finishedAt: new Date() });
    throw err;
  }
}
```

`readJson` and `json` are plain helpers called only inside `"use step"` bodies. `new Date()` inside `runJob` is the same pattern the existing catch already uses.

In `apps/web/app/api/jobs/route.ts`: `import { runJob } from "@/workflows/job";` and `start(runJob, [id])`.

- [ ] **Step 3: Artifact allowlist**

In `apps/web/app/api/jobs/[id]/artifacts/[...path]/route.ts`:

```ts
const ALLOWED =
  /^(source\.pdf|analysis\.json|parsed\.json|annotate\.json|figures\/[\w.-]+\.png|annotate\/(classify|mentions)\/\d+\.json)$/;
```

- [ ] **Step 4: Integration test**

In `apps/web/test/parse-job.integration.test.ts`: rename the first test to "a posted PDF runs Parse and Annotate and yields the recorded parse", raise its timeout to `300_000`, replace the operations assertion with

```ts
expect(job.operations.map((o) => [o.step, o.name, o.status])).toEqual([
  ["parse", "upload", "done"],
  ["parse", "analyze", "done"],
  ["parse", "build", "done"],
  ["annotate", "classify", "done"],
  ["annotate", "mentions", "done"],
  ["annotate", "validate", "done"],
]);
```

(add `step: string` to the operations type in the test), and after the `parsed.json` assertions add:

```ts
const annotated = (await (
  await fetch(`${base}/api/jobs/${id}/artifacts/annotate.json`)
).json()) as { classifications: unknown[]; mentions: unknown[] };
expect(annotated.classifications.length).toBeGreaterThan(0);
expect(annotated.mentions.length).toBeGreaterThan(0);
```

- [ ] **Step 5: Gates, then the live run**

```bash
npx prettier --write apps/web && npm run check-types -w apps/web && npm run lint -w apps/web && npm test -w apps/web && npm run build -w apps/web
git checkout -- apps/web/next-env.d.ts
```

Expected: the build's workflow line reports 1 workflow. If `next build` cannot resolve `@dark-factory/annotate` at runtime because of `serverExternalPackages`, check `node_modules/@dark-factory/annotate` is the workspace symlink and that `packages/annotate/dist` exists (run `npm run build -w packages/annotate`).

Start the dev server with the preview tool (`web`), then:

```bash
npm run test:integration -w apps/web 2>&1 | tail -8
```

Expected: 2 passed. Then open `http://localhost:3001/jobs/<id>` for the job the test created (query `select id from dark_factory.jobs order by created_at desc limit 1` with `/opt/homebrew/opt/postgresql@17/bin/psql -d motivus -At`) and confirm the Annotate node shows classify, mentions, validate all done. If the model call fails with a prompt-file error (`ENOENT … classify.md`), the prompts are not next to the built code: re-run `npm run build -w packages/annotate` and confirm `serverExternalPackages` is in effect (restart the dev server).

- [ ] **Step 6: Commit**

```bash
git add apps/web package-lock.json
git commit -m "Run Annotate's operations after Parse in the same job

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Docs, full gates, PR

**Files:**

- Modify: `apps/web/README.md`, `AGENTS.md`

- [ ] **Step 1: Docs**

`apps/web/README.md`: in the Environment section add `AZURE_API_KEY` to the list with the note "read by the annotate step's model calls"; in the Vocabulary line, replace the operations list with "Parse: upload, analyze, build; Annotate: classify, mentions, validate"; in the smoke-test section, add that the job is done only after Annotate and takes a couple of minutes.

`AGENTS.md`: in the Repository layout paragraph for `apps/web`, change "runs its Parse operations durably" to "runs its Parse and Annotate operations durably".

- [ ] **Step 2: Full gates from the root**

```bash
npm run check-types && npm run lint && npm run build && npm test && npm run test:integration -w packages/parse
```

All must pass. Then, with the dev server running, `npm run test:integration -w apps/web` (2 passed) and `npm run test:integration -w packages/annotate 2>&1 | tail -20` (expected to fail on the missing `expected.json`; paste the tail).

- [ ] **Step 3: Commit and PR**

```bash
git checkout -- apps/web/next-env.d.ts
git add apps/web/README.md AGENTS.md
git commit -m "Document Annotate operations and the AZURE_API_KEY requirement

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Open the PR against `main` through the `origin` skill (`--status open`): what changed, why, the gate table, the live-run evidence, and a clear line that the annotate eval cannot run until `packages/annotate/test/fixtures/expected.json` is written by a human. Do not merge.
