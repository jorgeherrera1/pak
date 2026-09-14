# Parse Job Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A PDF posted to `/api/jobs` becomes a job whose four Parse operations run durably and whose artifacts land in Azure Blob, with progress readable from `/api/jobs/:id`.

**Architecture:** Everything new lives in `apps/web` (Next.js) because the Workflow SDK must run inside the server. Postgres holds the SDK's run tables plus our `jobs` and `operations` tables (Drizzle). Azure Blob holds `source.pdf`, `analysis.json`, `parsed.json`, and figures under `<jobId>/`. `packages/parse` gets one refactor so `analyze` returns bytes instead of writing files.

**Tech Stack:** Next.js 16, Workflow SDK (`workflow`, `@workflow/world-postgres`), Drizzle (`drizzle-orm`, `drizzle-kit`, `pg`), `@azure/storage-blob`, Vitest 5, existing `@azure-rest/ai-document-intelligence`.

**Spec:** `docs/superpowers/specs/2026-09-13-parse-job-backend-design.md`

## Global Constraints

- Vocabulary: **job** (thing moving down the line), **station** (Requirements engineering), **step** (Parse, Annotate, Resolve), **operation** (upload, analyze, build, publish). The SDK's `"use step"` functions implement operations; never call them steps in our code or prose.
- Node >= 24, npm, 100% TypeScript. Route handlers only, no Server Actions.
- Every upload is a new job. Azure is always called. No dedupe, no cache.
- Blob paths are keyed by job id, never by sha256.
- Definition of done before the PR: `npm run check-types`, `npm run lint`, `npm run build`, `npm test`, and `npm run test:integration` (needs `.env`), results pasted in the PR.
- Branch: `feat/parse-job-backend` off latest `main`. Never commit to `main`. Commit after every task. Push only when opening the PR. PRs go through Cursor Origin (`origin` skill).
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- `apps/web/tsconfig.json` has no `@/` alias. Use relative imports.

---

## File structure

| File                                                               | Responsibility                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `packages/parse/src/analyze.ts`                                    | Azure call. Returns `{ result, figures }`, writes nothing.                           |
| `packages/parse/src/index.ts`                                      | Exports `analyze`, `toParsedDocument`, types. CLI still writes `<outDir>/<sha256>/`. |
| `apps/web/lib/db/schema.ts`                                        | Drizzle tables `jobs`, `operations`.                                                 |
| `apps/web/lib/db/index.ts`                                         | `db` client from `DATABASE_URL`.                                                     |
| `apps/web/drizzle.config.ts`                                       | drizzle-kit config.                                                                  |
| `apps/web/lib/blob.ts`                                             | `putBlob`, `getBlob`, `streamBlob` on the one container.                             |
| `apps/web/lib/upload.ts`                                           | `validatePdf`, `MAX_BYTES`. Pure, unit tested.                                       |
| `apps/web/lib/operations.ts`                                       | `OPERATIONS`, `setOperation`, `runOperation`. Unit tested with an injected setter.   |
| `apps/web/workflows/parse.ts`                                      | `parseJob(jobId)` workflow and its three operation functions.                        |
| `apps/web/app/api/jobs/route.ts`                                   | `POST /api/jobs`.                                                                    |
| `apps/web/app/api/jobs/[id]/route.ts`                              | `GET /api/jobs/:id`.                                                                 |
| `apps/web/app/api/jobs/[id]/artifacts/[...path]/route.ts`          | `GET /api/jobs/:id/artifacts/*`.                                                     |
| `apps/web/test/upload.test.ts`, `apps/web/test/operations.test.ts` | Unit tests, no network.                                                              |
| `apps/web/test/parse-job.integration.test.ts`                      | End to end against local Postgres, real Blob, real Azure.                            |
| `apps/web/README.md`                                               | Setup: env vars, bootstrap, drizzle push.                                            |

---

### Task 1: `analyze` returns bytes instead of writing files

**Files:**

- Modify: `packages/parse/src/analyze.ts`
- Modify: `packages/parse/src/index.ts`
- Test: existing `packages/parse/test/toParsedDocument.test.ts` (unchanged) and `packages/parse/test/parse.integration.test.ts` (unchanged)

**Interfaces:**

- Produces: `analyze(pdf: Buffer): Promise<Analysis>` where `type Analysis = { result: AnalyzeResultOutput; figures: { id: string; png: Uint8Array }[] }`, exported from `@dark-factory/parse` together with `toParsedDocument(result, sha256)` and `type Analysis`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b feat/parse-job-backend
```

- [ ] **Step 2: Rewrite `analyze` to return instead of write**

Replace the body of `packages/parse/src/analyze.ts` from the `mkdir` line to the end of the function, and drop the `mkdir`, `writeFile`, `join` imports. New signature and tail:

```ts
export type Analysis = {
  result: AnalyzeResultOutput;
  figures: { id: string; png: Uint8Array }[];
};

/** Sends the PDF to Azure Document Intelligence and returns the raw result plus every figure image. */
export async function analyze(pdf: Buffer): Promise<Analysis> {
  // ... client, initial, done, result unchanged ...

  const resultId = parseResultIdFromResponse(initial);
  const figures: Analysis["figures"] = [];
  for (const { id } of result.figures ?? []) {
    if (!id) continue;
    const res = await client
      .path(
        "/documentModels/{modelId}/analyzeResults/{resultId}/figures/{figureId}",
        MODEL,
        resultId,
        id,
      )
      .get()
      .asNodeStream();
    if (res.status !== "200" || !res.body)
      throw new Error(`figure ${id}: HTTP ${res.status}`);
    figures.push({ id, png: await streamToUint8Array(res.body) });
  }
  return { result, figures };
}
```

- [ ] **Step 3: Move the file writes into `parse()` in `index.ts`**

```ts
import { hash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { analyze } from "./analyze.ts";
import { toParsedDocument } from "./toParsedDocument.ts";
import type { ParsedDocument } from "./types.ts";

export type * from "./types.ts";
export { analyze, type Analysis } from "./analyze.ts";
export { toParsedDocument } from "./toParsedDocument.ts";

/**
 * PDF in, ParsedDocument out. Every run calls Azure; nothing is reused between
 * runs. Everything lands in `<outDir>/<sha256 of the pdf>/`: figures/ first,
 * then analysis.json, then parsed.json, so a half-finished run never looks complete.
 */
export async function parse(
  pdfPath: string,
  outDir: string,
): Promise<ParsedDocument> {
  const pdf = await readFile(pdfPath);
  const sha256 = hash("sha256", pdf);
  const dir = join(outDir, sha256);
  const { result, figures } = await analyze(pdf);
  await mkdir(join(dir, "figures"), { recursive: true });
  for (const { id, png } of figures)
    await writeFile(join(dir, "figures", `${id}.png`), png);
  await writeFile(join(dir, "analysis.json"), JSON.stringify(result, null, 2));
  const doc = toParsedDocument(result, sha256);
  await writeFile(join(dir, "parsed.json"), JSON.stringify(doc, null, 2));
  return doc;
}
```

Keep the `import.meta.main` CLI block as is.

- [ ] **Step 4: Gates for the package**

```bash
npm run check-types -w packages/parse && npm run lint -w packages/parse && npm run build -w packages/parse && npm test -w packages/parse
```

Expected: all pass, `toParsedDocument.test.ts` unchanged and green.

- [ ] **Step 5: Integration test, live Azure**

```bash
npm run test:integration -w packages/parse
```

Expected: PASS. It reads `test/out/<sha256>/analysis.json` and `figures/`, which `parse()` still writes.

- [ ] **Step 6: Commit**

```bash
git add packages/parse && git commit -m "Return analysis bytes from analyze instead of writing files

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Wiring: dependencies, database schema, blob client, upload validation

**Files:**

- Modify: `apps/web/package.json`, `apps/web/next.config.ts`, `turbo.json`
- Create: `apps/web/drizzle.config.ts`, `apps/web/lib/db/schema.ts`, `apps/web/lib/db/index.ts`, `apps/web/lib/blob.ts`, `apps/web/lib/upload.ts`, `apps/web/vitest.config.ts`
- Test: `apps/web/test/upload.test.ts`

**Interfaces:**

- Produces: `db` (Drizzle client), tables `jobs` and `operations`; `putBlob(path: string, data: Uint8Array, contentType: string): Promise<void>`, `getBlob(path: string): Promise<Buffer | null>`, `streamBlob(path: string): Promise<{ body: ReadableStream; contentType: string } | null>`; `validatePdf(file: File | null): string | null` (error message or null), `MAX_BYTES`.

- [ ] **Step 1: Install**

```bash
npm i -w apps/web workflow @workflow/world-postgres drizzle-orm pg @azure/storage-blob @dark-factory/parse
npm i -D -w apps/web drizzle-kit @types/pg vitest@^5.0.0
```

Then read `node_modules/workflow/docs/getting-started/next.mdx` and `node_modules/@workflow/world-postgres/README.md`. Confirm three things and adjust the steps below if the installed version differs: the `withWorkflow` import path, whether the Postgres world needs an explicit `start()` call in a Next app (if so, add `apps/web/instrumentation.ts` exporting `register()` that imports the world and awaits `start()`), and the `start()` return shape used in Task 4.

- [ ] **Step 2: Next config and scripts**

`apps/web/next.config.ts`:

```ts
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  transpilePackages: ["@dark-factory/ui"],
};

export default withWorkflow(nextConfig);
```

Add to `apps/web/package.json` scripts:

```json
"test": "vitest run --exclude \"**/*.integration.test.ts\"",
"test:integration": "vitest run test/parse-job.integration.test.ts",
"db:push": "drizzle-kit push"
```

Add to `turbo.json` `globalPassThroughEnv`: `"DATABASE_URL"`, `"WORKFLOW_TARGET_WORLD"`, `"AZURE_STORAGE_CONNECTION_STRING"`, `"AZURE_STORAGE_CONTAINER"`.

`apps/web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
```

- [ ] **Step 3: Schema and client**

`apps/web/lib/db/schema.ts`:

```ts
import {
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  status: text("status", { enum: ["queued", "running", "done", "failed"] })
    .notNull()
    .default("queued"),
  error: text("error"),
  workflowRunId: text("workflow_run_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const operations = pgTable(
  "operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    step: text("step").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    status: text("status", { enum: ["pending", "running", "done", "failed"] })
      .notNull()
      .default("pending"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [unique().on(t.jobId, t.step, t.name)],
);
```

`apps/web/lib/db/index.ts`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export const db = drizzle(process.env.DATABASE_URL!, { schema });
export { jobs, operations } from "./schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Postgres throws on a malformed uuid; handlers check this first and answer 404 instead. */
export const isUuid = (s: string) => UUID.test(s);
```

`apps/web/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 4: Blob client**

`apps/web/lib/blob.ts`:

```ts
import { BlobServiceClient } from "@azure/storage-blob";

const container = () =>
  BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING!,
  ).getContainerClient(process.env.AZURE_STORAGE_CONTAINER ?? "jobs");

export async function putBlob(
  path: string,
  data: Uint8Array,
  contentType: string,
) {
  await container()
    .getBlockBlobClient(path)
    .uploadData(data, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
}

export async function getBlob(path: string): Promise<Buffer | null> {
  const blob = container().getBlockBlobClient(path);
  if (!(await blob.exists())) return null;
  return blob.downloadToBuffer();
}

export async function streamBlob(path: string) {
  const blob = container().getBlockBlobClient(path);
  if (!(await blob.exists())) return null;
  const res = await blob.download();
  const { Readable } = await import("node:stream");
  return {
    body: Readable.toWeb(
      res.readableStreamBody as import("node:stream").Readable,
    ) as ReadableStream,
    contentType: res.contentType ?? "application/octet-stream",
  };
}
```

- [ ] **Step 5: Failing test for upload validation**

`apps/web/test/upload.test.ts`:

```ts
import { expect, test } from "vitest";
import { MAX_BYTES, isPdf, validatePdf } from "../lib/upload";

const enc = (s: string) => new TextEncoder().encode(s);

test("missing file", () => {
  expect(validatePdf(null)).toBe("no file");
});
test("too large", () => {
  expect(validatePdf(new File([new Uint8Array(MAX_BYTES + 1)], "a.pdf"))).toBe(
    "larger than 50 MB",
  );
});
test("ok", () => {
  expect(validatePdf(new File([enc("%PDF-1.7")], "a.pdf"))).toBeNull();
});
test("magic bytes", () => {
  expect(isPdf(enc("hello"))).toBe(false);
  expect(isPdf(enc("%PDF-1.7 rest"))).toBe(true);
});
```

Run: `npm test -w apps/web`. Expected: FAIL, module `../lib/upload` not found.

- [ ] **Step 6: Implement `lib/upload.ts`**

```ts
export const MAX_BYTES = 50 * 1024 * 1024;

/** Cheap checks before the bytes are read. Returns an error message, or null when acceptable. */
export function validatePdf(file: File | null): string | null {
  if (!file) return "no file";
  if (file.size > MAX_BYTES) return "larger than 50 MB";
  return null;
}

/** Magic-bytes check once the bytes are in memory. */
export function isPdf(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
}
```

Run: `npm test -w apps/web`. Expected: PASS.

- [ ] **Step 7: Gates and commit**

```bash
npm run check-types -w apps/web && npm run lint -w apps/web
git add apps/web turbo.json package-lock.json
git commit -m "Wire Workflow SDK, Drizzle schema, blob client and upload validation into web

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Operation helper and the `parseJob` workflow

**Files:**

- Create: `apps/web/lib/operations.ts`, `apps/web/workflows/parse.ts`
- Test: `apps/web/test/operations.test.ts`

**Interfaces:**

- Consumes: `db`, `jobs`, `operations` (Task 2); `getBlob`, `putBlob` (Task 2); `analyze`, `toParsedDocument` from `@dark-factory/parse` (Task 1).
- Produces: `OPERATIONS = ["upload", "analyze", "build", "publish"] as const`; `type OperationName`; `setOperation(jobId, name, patch)`; `runOperation<T>(jobId, name, fn: () => Promise<T>, set = setOperation): Promise<T>`; `parseJob(jobId: string)`.

- [ ] **Step 1: Failing test for `runOperation`**

`apps/web/test/operations.test.ts`:

```ts
import { expect, test } from "vitest";
import { runOperation, type OperationPatch } from "../lib/operations";

const recorder = () => {
  const calls: OperationPatch[] = [];
  const set = async (_job: string, _name: string, patch: OperationPatch) => {
    calls.push(patch);
  };
  return { calls, set };
};

test("marks running then done and returns the value", async () => {
  const { calls, set } = recorder();
  const out = await runOperation("j", "analyze", async () => 42, set);
  expect(out).toBe(42);
  expect(calls.map((c) => c.status)).toEqual(["running", "done"]);
  expect(calls[0]?.startedAt).toBeInstanceOf(Date);
  expect(calls[1]?.finishedAt).toBeInstanceOf(Date);
});

test("marks failed with the message and rethrows", async () => {
  const { calls, set } = recorder();
  await expect(
    runOperation(
      "j",
      "analyze",
      async () => {
        throw new Error("boom");
      },
      set,
    ),
  ).rejects.toThrow("boom");
  expect(calls[1]).toMatchObject({ status: "failed", error: "boom" });
});
```

Run: `npm test -w apps/web`. Expected: FAIL, module not found.

- [ ] **Step 2: Implement `lib/operations.ts`**

```ts
import { and, eq } from "drizzle-orm";
import { db, operations } from "./db";

export const STEP = "parse";
export const OPERATIONS = ["upload", "analyze", "build", "publish"] as const;
export type OperationName = (typeof OPERATIONS)[number];
export type OperationPatch = Partial<
  Pick<
    typeof operations.$inferInsert,
    "status" | "error" | "startedAt" | "finishedAt"
  >
>;

export async function setOperation(
  jobId: string,
  name: OperationName,
  patch: OperationPatch,
) {
  await db
    .update(operations)
    .set(patch)
    .where(
      and(
        eq(operations.jobId, jobId),
        eq(operations.step, STEP),
        eq(operations.name, name),
      ),
    );
}

/** Runs one operation body and records running, done, or failed around it. Rethrows so the SDK can retry. */
export async function runOperation<T>(
  jobId: string,
  name: OperationName,
  fn: () => Promise<T>,
  set: typeof setOperation = setOperation,
): Promise<T> {
  await set(jobId, name, {
    status: "running",
    startedAt: new Date(),
    error: null,
  });
  try {
    const out = await fn();
    await set(jobId, name, { status: "done", finishedAt: new Date() });
    return out;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await set(jobId, name, { status: "failed", finishedAt: new Date(), error });
    throw err;
  }
}
```

Run: `npm test -w apps/web`. Expected: PASS. Importing `./db` at module load is fine in tests because `drizzle()` with a connection string does not connect until the first query.

- [ ] **Step 3: The workflow**

`apps/web/workflows/parse.ts`:

```ts
import { analyze, toParsedDocument } from "@dark-factory/parse";
import type { AnalyzeResultOutput } from "@azure-rest/ai-document-intelligence";
import { eq } from "drizzle-orm";
import { getBlob, putBlob } from "../lib/blob";
import { db, jobs } from "../lib/db";
import { runOperation } from "../lib/operations";

async function setJob(jobId: string, patch: Partial<typeof jobs.$inferInsert>) {
  "use step";
  await db.update(jobs).set(patch).where(eq(jobs.id, jobId));
}

async function analyzeOperation(jobId: string) {
  "use step";
  await runOperation(jobId, "analyze", async () => {
    const pdf = await getBlob(`${jobId}/source.pdf`);
    if (!pdf) throw new Error("source.pdf missing");
    const { result, figures } = await analyze(pdf);
    for (const { id, png } of figures)
      await putBlob(`${jobId}/figures/${id}.png`, png, "image/png");
    await putBlob(
      `${jobId}/analysis.json`,
      new TextEncoder().encode(JSON.stringify(result)),
      "application/json",
    );
  });
}

async function buildOperation(jobId: string) {
  "use step";
  return runOperation(jobId, "build", async () => {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    if (!job) throw new Error("job missing");
    const raw = await getBlob(`${jobId}/analysis.json`);
    if (!raw) throw new Error("analysis.json missing");
    const result: AnalyzeResultOutput = JSON.parse(raw.toString("utf8"));
    const doc = toParsedDocument(result, job.sha256);
    await putBlob(
      `${jobId}/parsed.json`,
      new TextEncoder().encode(JSON.stringify(doc)),
      "application/json",
    );
    return { elements: doc.elements.length, warnings: doc.warnings.length };
  });
}

async function publishOperation(jobId: string) {
  "use step";
  await runOperation(jobId, "publish", async () => {
    await db
      .update(jobs)
      .set({ status: "done", finishedAt: new Date() })
      .where(eq(jobs.id, jobId));
  });
}

export async function parseJob(jobId: string) {
  "use workflow";
  await setJob(jobId, { status: "running" });
  try {
    await analyzeOperation(jobId);
    const counts = await buildOperation(jobId);
    await publishOperation(jobId);
    return counts;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await setJob(jobId, { status: "failed", error, finishedAt: new Date() });
    throw err;
  }
}
```

`@azure-rest/ai-document-intelligence` is a dependency of `@dark-factory/parse`; add it to `apps/web` dependencies too so the type import resolves: `npm i -w apps/web @azure-rest/ai-document-intelligence`.

The SDK retries a failing `"use step"` with its default policy. When retries are exhausted the throw reaches `parseJob`, which records the failure. `runOperation` records every attempt, so a retried operation shows running again after failed, which is the truth.

- [ ] **Step 4: Gates and commit**

```bash
npm run check-types -w apps/web && npm run lint -w apps/web && npm test -w apps/web
git add apps/web package-lock.json
git commit -m "Add parseJob workflow and operation status helper

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Route handlers

**Files:**

- Create: `apps/web/app/api/jobs/route.ts`, `apps/web/app/api/jobs/[id]/route.ts`, `apps/web/app/api/jobs/[id]/artifacts/[...path]/route.ts`

**Interfaces:**

- Consumes: `validatePdf`, `isPdf` (Task 2); `putBlob`, `streamBlob` (Task 2); `db`, `jobs`, `operations` (Task 2); `OPERATIONS`, `STEP` (Task 3); `parseJob` (Task 3).
- Produces: the HTTP contract in the spec.

- [ ] **Step 1: `POST /api/jobs`**

`apps/web/app/api/jobs/route.ts`:

```ts
import { hash } from "node:crypto";
import { eq } from "drizzle-orm";
import { start } from "workflow/api";
import { putBlob } from "../../../lib/blob";
import { db, jobs, operations } from "../../../lib/db";
import { OPERATIONS, STEP } from "../../../lib/operations";
import { isPdf, validatePdf } from "../../../lib/upload";
import { parseJob } from "../../../workflows/parse";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const upload = file instanceof File ? file : null;
  const error = validatePdf(upload);
  if (error || !upload)
    return Response.json({ error: error ?? "no file" }, { status: 400 });
  const bytes = new Uint8Array(await upload.arrayBuffer());
  if (!isPdf(bytes))
    return Response.json({ error: "not a PDF" }, { status: 400 });

  const id = crypto.randomUUID();
  await putBlob(`${id}/source.pdf`, bytes, "application/pdf");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(jobs).values({
      id,
      filename: upload.name,
      size: bytes.byteLength,
      sha256: hash("sha256", bytes),
    });
    await tx.insert(operations).values(
      OPERATIONS.map((name, position) => ({
        jobId: id,
        step: STEP,
        name,
        position,
        status: name === "upload" ? "done" : "pending",
        startedAt: name === "upload" ? now : null,
        finishedAt: name === "upload" ? now : null,
      })),
    );
  });

  const run = await start(parseJob, [id]);
  await db
    .update(jobs)
    .set({ workflowRunId: run.runId })
    .where(eq(jobs.id, id));
  return Response.json({ id }, { status: 202 });
}
```

Confirm the `runId` property name in `node_modules/workflow/docs/api-reference/workflow-api/start.mdx` and adjust if it differs.

- [ ] **Step 2: `GET /api/jobs/:id`**

`apps/web/app/api/jobs/[id]/route.ts`:

```ts
import { asc, eq } from "drizzle-orm";
import { db, isUuid, jobs, operations } from "../../../../lib/db";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!isUuid(id))
    return Response.json({ error: "not found" }, { status: 404 });
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!job) return Response.json({ error: "not found" }, { status: 404 });
  const ops = await db
    .select()
    .from(operations)
    .where(eq(operations.jobId, id))
    .orderBy(asc(operations.position));
  return Response.json({ ...job, operations: ops });
}
```

- [ ] **Step 3: `GET /api/jobs/:id/artifacts/*`**

`apps/web/app/api/jobs/[id]/artifacts/[...path]/route.ts`:

```ts
import { streamBlob } from "../../../../../../lib/blob";
import { isUuid } from "../../../../../../lib/db";

const ALLOWED =
  /^(source\.pdf|analysis\.json|parsed\.json|figures\/[\w.-]+\.png)$/;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; path: string[] }> },
) {
  const { id, path } = await ctx.params;
  const name = path.join("/");
  if (!isUuid(id) || !ALLOWED.test(name))
    return Response.json({ error: "not found" }, { status: 404 });
  const blob = await streamBlob(`${id}/${name}`);
  if (!blob) return Response.json({ error: "not found" }, { status: 404 });
  return new Response(blob.body, {
    headers: { "content-type": blob.contentType },
  });
}
```

The allowlist is what keeps a request inside its own job prefix; there is no way to spell `..` or another id through it.

- [ ] **Step 4: Gates and commit**

```bash
npm run check-types -w apps/web && npm run lint -w apps/web && npm run build -w apps/web
git add apps/web
git commit -m "Add /api/jobs route handlers for create, read and artifacts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Integration test, setup docs, gates, PR

**Files:**

- Create: `apps/web/test/parse-job.integration.test.ts`
- Modify: `apps/web/README.md`, root `.env` (local only, never committed)

**Interfaces:**

- Consumes: the route handlers (Task 4) running under `next dev`.

- [ ] **Step 1: Local setup**

Add to the root `.env` (gitignored):

```
DATABASE_URL=postgres://localhost:5432/dark_factory
WORKFLOW_TARGET_WORLD=@workflow/world-postgres
AZURE_STORAGE_CONNECTION_STRING=<from the storage account>
AZURE_STORAGE_CONTAINER=jobs
```

Then:

```bash
createdb dark_factory
az storage container create --name jobs --connection-string "$AZURE_STORAGE_CONNECTION_STRING"
npx --package=@workflow/world-postgres bootstrap
npm run db:push -w apps/web
```

- [ ] **Step 2: Manual smoke through the dev server**

Start `apps/web` with the preview tool (never Bash), then:

```bash
curl -s -F file=@packages/parse/test/fixtures/prd-competencies.pdf http://localhost:3001/api/jobs
curl -s http://localhost:3001/api/jobs/<id> | jq '.status, [.operations[] | {name, status}]'
```

Expected: 202 with an id, then within about a minute status `done` and all four operations `done`. If the run never leaves `queued`, the world is not started: revisit the Task 2 Step 1 note about `instrumentation.ts`.

- [ ] **Step 3: Integration test**

`apps/web/test/parse-job.integration.test.ts`. It talks to a running dev server on `BASE_URL` (default `http://localhost:3001`), because the workflow runtime only exists inside the Next server.

```ts
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import type { ParsedDocument } from "@dark-factory/parse";

const env = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);
const base = process.env.BASE_URL ?? "http://localhost:3001";
const fixtures = new URL(
  "../../../packages/parse/test/fixtures/",
  import.meta.url,
);
const golden: ParsedDocument = JSON.parse(
  readFileSync(new URL("parsed.json", fixtures), "utf8"),
);

test(
  "a posted PDF runs all four operations and yields the recorded parse",
  { timeout: 180_000 },
  async () => {
    const form = new FormData();
    form.set(
      "file",
      new File(
        [readFileSync(new URL("prd-competencies.pdf", fixtures))],
        "prd-competencies.pdf",
      ),
    );
    const created = await fetch(`${base}/api/jobs`, {
      method: "POST",
      body: form,
    });
    expect(created.status).toBe(202);
    const { id } = (await created.json()) as { id: string };

    let job: {
      status: string;
      error: string | null;
      operations: { name: string; status: string }[];
    };
    do {
      await new Promise((r) => setTimeout(r, 2000));
      job = await (await fetch(`${base}/api/jobs/${id}`)).json();
    } while (job.status === "queued" || job.status === "running");

    expect(job.error).toBeNull();
    expect(job.status).toBe("done");
    expect(job.operations.map((o) => [o.name, o.status])).toEqual([
      ["upload", "done"],
      ["analyze", "done"],
      ["build", "done"],
      ["publish", "done"],
    ]);

    const parsed: ParsedDocument = await (
      await fetch(`${base}/api/jobs/${id}/artifacts/parsed.json`)
    ).json();
    expect(parsed.content).toBe(golden.content);
    expect(parsed.elements.length).toBe(golden.elements.length);
    expect(parsed.source.sha256).toBe(golden.source.sha256);
  },
);

test("rejects a non-PDF", async () => {
  const form = new FormData();
  form.set("file", new File([new TextEncoder().encode("hello")], "a.pdf"));
  const res = await fetch(`${base}/api/jobs`, { method: "POST", body: form });
  expect(res.status).toBe(400);
});
```

Run with the dev server up: `npm run test:integration -w apps/web`. Expected: PASS.

- [ ] **Step 4: README**

Replace `apps/web/README.md` with the env var list above, the four setup commands, how to run the dev server, the two curl lines, and the vocabulary line: job, station, step, operation.

- [ ] **Step 5: Full gates from the root**

```bash
npm run check-types && npm run lint && npm run build && npm test && npm run test:integration
```

Expected: all pass. Paste the output summary into the PR.

- [ ] **Step 6: Commit and PR**

```bash
git add apps/web
git commit -m "Add parse job integration test and web setup docs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Open the PR through the `origin` skill: what changed, why, the gate output, and the parse integration result. Do not merge.
