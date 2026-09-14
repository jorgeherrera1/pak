# Steps canvas

Design for wiring the intake screen to the parse job backend and showing a
job's progress as an assembly-line canvas. Frontend only, in `apps/web` and
`packages/ui`. The backend contract from
`2026-09-13-parse-job-backend-design.md` is consumed as is.

## Vocabulary

Same as the backend spec: **job** (one PDF and everything produced from it),
**station** (Requirements engineering), **step** (Parse, Annotate, Resolve),
**operation** (upload, analyze, build, publish).

## Flow

1. The intake screen accepts exactly one PDF (`multiple` removed).
2. Start run posts it as multipart field `file` to `POST /api/jobs`, with the
   button disabled while the request is in flight.
3. On 202 `{ id }` the browser navigates to `/jobs/<id>`.
4. On 400 `{ error }` the message shows inline on the intake card and the
   button re-enables. Any other failure shows "could not start the job".
5. `/jobs/<id>` fetches `GET /api/jobs/<id>` immediately and then every 2 s
   until `status` is `done` or `failed`, then stops polling.

No job list, no streaming, no server push.

## Canvas

Three **step nodes** left to right at fixed positions: Parse, Annotate,
Resolve, joined by two edges. Node content:

- step name and a status badge
- one row per operation with a status mark; the operation's `error` text under
  its row when failed
- Annotate and Resolve have no operations yet and render as not started

Step status derives from its operations, in this order: any `failed` →
failed; any `running` → running; all `done` (and at least one) → done;
otherwise pending. The edge into a running step is the animated one; other
edges are plain.

Above the canvas: filename, size, and the job's `error` when the job failed.

## Components

| Where | What |
|---|---|
| `packages/ui/src/components/{canvas,node,edge,controls}.tsx` | ai-elements components installed through the package's existing shadcn setup (`components.json`); brings in `@xyflow/react`. |
| `apps/web/lib/graph.ts` | `toGraph(job)`: pure, job response in, `{ nodes, edges }` out. Unit tested. |
| `apps/web/app/jobs/[id]/page.tsx` | Server page that renders the client canvas with the id. |
| `apps/web/app/jobs/[id]/use-job.ts` | Polling hook: `{ job, error }`. |
| `apps/web/app/jobs/[id]/steps-canvas.tsx` | Client component: header plus canvas from `toGraph`. |
| `apps/web/app/intake.tsx` | Single file, submit handler, inline error. |

The step list `["parse", "annotate", "resolve"]` and their labels live in
`graph.ts`; nothing else knows the step names.

## Errors

- Upload 400: message inline, button re-enabled.
- Polling network failure: keep the last job state, show one line "connection
  lost, reload to retry". No automatic retry.
- 404 from the job route: "job not found".
- Failed job: the failed operation's error under its row, the job error in the
  header, polling stopped.

## Testing

- `apps/web/test/graph.test.ts`: step status for each derivation case, node
  order and count, edge animation choice, empty Annotate and Resolve nodes, an
  operation error carried onto its row.
- Live verification against the dev server: upload the fixture PDF from the
  intake screen, watch the Parse node go from pending to done, screenshot the
  finished canvas; upload a non-PDF and see the inline 400 message.
- Existing gates: check-types, lint, build, unit tests. The web integration
  test keeps covering the API.

## Deferred on purpose

Job list, artifact links, streaming, auto-layout, retry button, node
expansion into operation nodes, the provenance viewer.
