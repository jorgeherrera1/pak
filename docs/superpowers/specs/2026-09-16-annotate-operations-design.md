# Annotate operations

Design for running Station 1's second step, Annotate, as operations of the
same job, automatically after Parse. Backend and the annotate package only;
the canvas needs no change. Consumes the contracts in
`2026-09-13-parse-job-backend-design.md` and `2026-09-13-steps-canvas-design.md`.

## Vocabulary

**Job**, **station**, **step** (Parse, Annotate, Resolve), **operation**.
Parse's operations become `upload`, `analyze`, `build`. Annotate's operations
are `classify`, `mentions`, `validate`.

## Decisions

| Topic | Decision |
|---|---|
| Trigger | Automatic. Annotate's operations run in the same workflow right after Parse's `build`. |
| Granularity | Three operations: `classify` and `mentions` (one model task each, all chunks), `validate` (code). |
| Parse `publish` | Removed. It only set the job to done; the job is done when the last step's last operation finishes. |
| Rows | The create handler inserts all six operation rows up front, `upload` done, the rest pending, so the canvas shows the whole line from the start. |
| Job status | `running` from workflow start, `done` after `validate`, `failed` on any exhausted throw. |
| Annotate package | Same refactor as Parse: model calls stop writing files; the CLI composes the pieces and keeps writing `<outDir>/<sha256>/annotate/…`. |
| Prompts | The two markdown prompts ship with the built package and the web app loads the package unbundled (`serverExternalPackages`), so `import.meta.url` reads keep working. |
| Eval | The annotate integration test is the eval and needs the human-written `packages/annotate/test/fixtures/expected.json`, which does not exist yet. This task adds orchestration, not AI behavior; the PR states the eval status plainly. |

## Package refactor

`packages/annotate` exports, besides what it exports today:

- `runClassify(text: string): Promise<ModelOutput["classifications"]>`
- `runMentions(text: string): Promise<ModelOutput["mentions"]>`
- `chunk(doc)`, `anchors(doc)` (already in `chunk.ts`), `validate` and
  `ModelOutput` (already in `validate.ts`)

`annotate(doc, outDir)` stays for the CLI: chunk, run both tasks per chunk,
write the raw responses to `annotate/<task>/<i>.json`, validate, write
`annotate.json`. Fixtures and the eval are untouched. The build copies
`src/*.md` into `dist/`. `scripts/pipeline.mts` reads `classifications` and
`mentions` instead of the removed `annotations` field.

## Operations

All three read `parsed.json` from Blob and rebuild the chunks with `chunk(doc)`,
so the chunk index `i` means the same thing everywhere.

- `classify`: for every chunk, `runClassify`, all chunks at once; write
  `<jobId>/annotate/classify/<i>.json`; return `{ chunks }`.
- `mentions`: same with `runMentions` into `<jobId>/annotate/mentions/<i>.json`.
- `validate`: read both response sets for `i < chunks.length`, run
  `validate(output, anchors(doc), doc.content)`, write `<jobId>/annotate.json`;
  return `{ classifications, mentions, warnings }` counts.

`classify` and `mentions` run in parallel in the workflow; `validate` follows.
The workflow function is `runJob(jobId)` in `apps/web/workflows/job.ts`.

## Data

No schema change. `operations.step` already exists. The operations module
becomes step-aware:

```
OPERATIONS = { parse: ["upload", "analyze", "build"], annotate: ["classify", "mentions", "validate"] }
setOperation(jobId, step, name, patch)
runOperation(jobId, step, name, fn)
```

Blob additions under `<jobId>/`: `annotate/classify/<i>.json`,
`annotate/mentions/<i>.json`, `annotate.json`. The artifact route allowlist
grows by exactly those shapes.

## Configuration

`AZURE_API_KEY` (already in `.env` and in turbo's passthrough list) joins the
startup assertion in `instrumentation.ts`. `apps/web` depends on
`@dark-factory/annotate` and lists it in `serverExternalPackages`.

## Errors

- Missing `parsed.json` or a missing raw response in `validate`: `FatalError`.
- Model call failures: plain errors, the SDK retries; exhausted retries fail
  the operation and the job.
- Annotations the validator rejects become warnings inside `annotate.json`,
  unchanged.

## Testing

- `packages/annotate`: existing unit tests (replay of recorded responses
  through `validate`) stay green. `npm run test:integration -w packages/annotate`
  is the eval; it fails on the missing `expected.json` until that file exists,
  and the PR reports that.
- `apps/web` unit tests: `initialOperations()` yields the six rows with the
  right steps, names, positions, and statuses; `runOperation` with the
  step-aware signature.
- `apps/web` integration test: six operations done, `annotate.json` downloads
  with at least one classification, `parsed.json` still matches the recording
  on structure. Timeout raised to 300 s.
- Live: a job from the intake shows the Annotate node moving from not started
  through running to done on the canvas.

## Deferred on purpose

On-demand Annotate, per-chunk operations, concurrency caps, a Resolve
placeholder, showing annotation counts on the canvas, `expected.json`.
