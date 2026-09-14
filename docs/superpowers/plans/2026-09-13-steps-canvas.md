# Steps Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start run on the intake screen creates a job and lands on `/jobs/<id>`, where a canvas shows the Parse, Annotate, and Resolve steps with their operations updating until the job is done or failed.

**Architecture:** ai-elements canvas, node, and edge components install into `packages/ui` through its existing shadcn setup (brings in React Flow). A pure `toGraph(job)` in `apps/web/lib/graph.ts` turns the `GET /api/jobs/:id` response into nodes and edges and is unit tested. A polling hook, a client canvas component, and a server page live under `apps/web/app/jobs/[id]/`. The intake screen posts one file and navigates.

**Tech Stack:** Next.js 16 (App Router), React 19, `@xyflow/react` via ai-elements, shadcn components already in `packages/ui`, Vitest 5, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-13-steps-canvas-design.md`

## Global Constraints

- Vocabulary: **job**, **station** (Requirements engineering), **step** (Parse, Annotate, Resolve), **operation** (upload, analyze, build, publish). Never call an operation a step.
- Backend contract is consumed as is: `POST /api/jobs` multipart field `file` → 202 `{ id }` or 400 `{ error }`; `GET /api/jobs/:id` → job row (`id`, `filename`, `size`, `status`, `error`, …) plus `operations[]` (`step`, `name`, `position`, `status`, `error`), or 404.
- Step status derivation, in this order: any `failed` → `failed`; any `running` → `running`; all `done` and at least one → `done`; otherwise `pending`.
- Step order and labels: `parse` "Parse", `annotate` "Annotate", `resolve` "Resolve". Only `graph.ts` knows them.
- Poll every 2 s; stop when status is `done` or `failed`. No automatic retry on network failure.
- Copy: upload 400 shows the server's message; other upload failures show "could not start the job"; polling failure shows "connection lost, reload to retry"; 404 shows "job not found".
- `apps/web` imports its own files with the `@/` alias; `packages/ui` components import each other with `@dark-factory/ui/components/<name>` and `@dark-factory/ui/lib/utils`.
- Branch: `feat/steps-canvas` (already exists, spec committed). Never commit to `main`. Commit after every task. Push only when opening the PR through the `origin` skill.
- Definition of done before the PR: `npm run check-types`, `npm run lint`, `npm run build`, `npm test`, plus the live verification in Task 5.
- Commit messages: imperative, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Prettier is enforced by lint; run `npx prettier --write <files>` before gates. `packages/ui` files use no semicolons and double quotes (match `file-upload.tsx`).

---

## File structure

| File | Responsibility |
|---|---|
| `packages/ui/src/components/canvas.tsx` | ai-elements Canvas: React Flow with defaults, imports React Flow CSS. |
| `packages/ui/src/components/node.tsx` | ai-elements Node + NodeHeader/Title/Description/Content built on Card. |
| `packages/ui/src/components/edge.tsx` | ai-elements `Edge.Animated` and `Edge.Temporary`. |
| `apps/web/lib/graph.ts` | Types for the job response; `STEPS`; `stepStatus(ops)`; `toGraph(job)`. Pure. |
| `apps/web/test/graph.test.ts` | Unit tests for `graph.ts`. |
| `apps/web/app/jobs/[id]/use-job.ts` | `useJob(id)` polling hook. |
| `apps/web/app/jobs/[id]/step-node.tsx` | React Flow custom node rendering one step and its operations. |
| `apps/web/app/jobs/[id]/steps-canvas.tsx` | Client component: header + Canvas wired to `toGraph`. |
| `apps/web/app/jobs/[id]/page.tsx` | Server page rendering `StepsCanvas` with the id. |
| `apps/web/app/layout.tsx` | Gains the site header (moved from `page.tsx`) so both pages share it. |
| `apps/web/app/page.tsx` | Header removed; copy made singular. |
| `apps/web/app/intake.tsx` | One file, submit handler, inline error, navigation. |

---

### Task 1: Install the ai-elements canvas components into `packages/ui`

**Files:**
- Create: `packages/ui/src/components/canvas.tsx`, `packages/ui/src/components/node.tsx`, `packages/ui/src/components/edge.tsx`
- Modify: `packages/ui/package.json` (dependency `@xyflow/react`)

**Interfaces:**
- Produces: `Canvas` (props: `ReactFlowProps & { children? }`); `Node` (props: Card props plus `handles: { target: boolean; source: boolean }`), `NodeHeader`, `NodeTitle`, `NodeDescription`, `NodeContent`, `NodeFooter`; `Edge.Animated` and `Edge.Temporary` (React Flow `EdgeProps`). All importable as `@dark-factory/ui/components/canvas`, `.../node`, `.../edge`.

- [ ] **Step 1: Install through shadcn using the package's own `components.json`**

```bash
cd packages/ui && npx shadcn@latest add https://registry.ai-sdk.dev/canvas.json https://registry.ai-sdk.dev/node.json https://registry.ai-sdk.dev/edge.json
```

The CLI rewrites imports to the aliases in `packages/ui/components.json` (`@dark-factory/ui/components/card`, `@dark-factory/ui/lib/utils`) and adds `@xyflow/react` to `packages/ui/package.json`. If the CLI asks to overwrite `card.tsx`, answer no. If the CLI cannot run non-interactively, write the three files by hand from Step 2 and run `npm i -w packages/ui @xyflow/react`.

- [ ] **Step 2: Verify the files match this shape (fix imports and formatting if the CLI produced something else)**

`packages/ui/src/components/canvas.tsx`:

```tsx
"use client"

import { Background, ReactFlow, type ReactFlowProps } from "@xyflow/react"
import type { ReactNode } from "react"
import "@xyflow/react/dist/style.css"

type CanvasProps = ReactFlowProps & { children?: ReactNode }

export const Canvas = ({ children, ...props }: CanvasProps) => (
  <ReactFlow
    deleteKeyCode={["Backspace", "Delete"]}
    fitView
    panOnDrag={false}
    panOnScroll
    selectionOnDrag={true}
    zoomOnDoubleClick={false}
    {...props}
  >
    <Background bgColor="var(--sidebar)" />
    {children}
  </ReactFlow>
)
```

`packages/ui/src/components/node.tsx`:

```tsx
"use client"

import { Handle, Position } from "@xyflow/react"
import type { ComponentProps } from "react"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@dark-factory/ui/components/card"
import { cn } from "@dark-factory/ui/lib/utils"

export type NodeProps = ComponentProps<typeof Card> & {
  handles: { target: boolean; source: boolean }
}

export const Node = ({ handles, className, ...props }: NodeProps) => (
  <Card
    className={cn(
      "node-container relative size-full h-auto w-sm gap-0 rounded-md p-0",
      className
    )}
    {...props}
  >
    {handles.target && <Handle position={Position.Left} type="target" />}
    {handles.source && <Handle position={Position.Right} type="source" />}
    {props.children}
  </Card>
)

export const NodeHeader = ({
  className,
  ...props
}: ComponentProps<typeof CardHeader>) => (
  <CardHeader
    className={cn("gap-0.5 rounded-t-md border-b bg-secondary p-3!", className)}
    {...props}
  />
)
export const NodeTitle = (props: ComponentProps<typeof CardTitle>) => (
  <CardTitle {...props} />
)
export const NodeDescription = (
  props: ComponentProps<typeof CardDescription>
) => <CardDescription {...props} />
export const NodeAction = (props: ComponentProps<typeof CardAction>) => (
  <CardAction {...props} />
)
export const NodeContent = ({
  className,
  ...props
}: ComponentProps<typeof CardContent>) => (
  <CardContent className={cn("p-3", className)} {...props} />
)
export const NodeFooter = ({
  className,
  ...props
}: ComponentProps<typeof CardFooter>) => (
  <CardFooter
    className={cn("rounded-b-md border-t bg-secondary p-3!", className)}
    {...props}
  />
)
```

`packages/ui/src/components/edge.tsx`: the registry file verbatim (a `Temporary` dashed edge using `getSimpleBezierPath`, an `Animated` edge using `useInternalNode`, `getBezierPath`, and an SVG `<circle>` with `<animateMotion>`, exported as `export const Edge = { Temporary, Animated }`), with `"use client"` as its first line.

- [ ] **Step 3: Gates for the package**

```bash
npx prettier --write packages/ui/src/components/{canvas,node,edge}.tsx && npm run check-types -w packages/ui && npm run lint -w packages/ui && npm test -w packages/ui
```

Expected: all pass. If lint flags the CSS side-effect import, it is already allowed by `sideEffects` in `package.json`; if it flags an unused export, keep it (they are the library surface) and report.

- [ ] **Step 4: Commit**

```bash
git add packages/ui package-lock.json
git commit -m "Add ai-elements canvas, node and edge components to ui

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `toGraph`: job response to nodes and edges

**Files:**
- Create: `apps/web/lib/graph.ts`
- Test: `apps/web/test/graph.test.ts`

**Interfaces:**
- Produces:

```ts
export type OperationStatus = "pending" | "running" | "done" | "failed";
export type JobStatus = "queued" | "running" | "done" | "failed";
export type OperationRow = { step: string; name: string; position: number; status: OperationStatus; error: string | null };
export type JobResponse = { id: string; filename: string; size: number; status: JobStatus; error: string | null; operations: OperationRow[] };
export type StepStatus = OperationStatus;
export type StepNodeData = { label: string; status: StepStatus; operations: OperationRow[] };
export type StepNode = { id: string; type: "step"; position: { x: number; y: number }; data: StepNodeData };
export type StepEdge = { id: string; source: string; target: string; type?: "animated" };
export const STEPS: readonly { id: string; label: string }[];
export function stepStatus(ops: OperationRow[]): StepStatus;
export function toGraph(job: JobResponse): { nodes: StepNode[]; edges: StepEdge[] };
```

- [ ] **Step 1: Write the failing tests**

`apps/web/test/graph.test.ts`:

```ts
import { expect, test } from "vitest";
import {
  stepStatus,
  toGraph,
  type JobResponse,
  type OperationRow,
} from "@/lib/graph";

const op = (
  name: string,
  status: OperationRow["status"],
  error: string | null = null,
): OperationRow => ({ step: "parse", name, position: 0, status, error });

const job = (operations: OperationRow[]): JobResponse => ({
  id: "j",
  filename: "a.pdf",
  size: 1,
  status: "running",
  error: null,
  operations,
});

test("step status derivation", () => {
  expect(stepStatus([])).toBe("pending");
  expect(stepStatus([op("a", "pending"), op("b", "pending")])).toBe("pending");
  expect(stepStatus([op("a", "done"), op("b", "pending")])).toBe("pending");
  expect(stepStatus([op("a", "done"), op("b", "running")])).toBe("running");
  expect(stepStatus([op("a", "done"), op("b", "done")])).toBe("done");
  expect(stepStatus([op("a", "running"), op("b", "failed")])).toBe("failed");
});

test("three step nodes in order, parse carrying its operations", () => {
  const { nodes } = toGraph(
    job([op("upload", "done"), op("analyze", "running", null)]),
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
    "analyze",
  ]);
  expect(nodes[1]?.data.operations).toEqual([]);
  expect(nodes[1]?.data.status).toBe("pending");
  expect(nodes[0]?.position.x).toBeLessThan(nodes[1]?.position.x ?? 0);
});

test("operations are ordered by position and keep their error", () => {
  const { nodes } = toGraph(
    job([
      { ...op("build", "failed", "boom"), position: 2 },
      { ...op("upload", "done"), position: 0 },
      { ...op("analyze", "done"), position: 1 },
    ]),
  );
  expect(nodes[0]?.data.operations.map((o) => o.name)).toEqual([
    "upload",
    "analyze",
    "build",
  ]);
  expect(nodes[0]?.data.operations[2]?.error).toBe("boom");
  expect(nodes[0]?.data.status).toBe("failed");
});

test("the edge into a running step is animated, others plain", () => {
  const running = toGraph(
    job([{ ...op("x", "running"), step: "annotate" }, op("upload", "done")]),
  );
  expect(running.edges.map((e) => [e.source, e.target, e.type])).toEqual([
    ["parse", "annotate", "animated"],
    ["annotate", "resolve", undefined],
  ]);
  const idle = toGraph(job([op("upload", "done")]));
  expect(idle.edges.every((e) => e.type === undefined)).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w apps/web`
Expected: FAIL, cannot resolve `@/lib/graph`.

- [ ] **Step 3: Implement `apps/web/lib/graph.ts`**

```ts
export type OperationStatus = "pending" | "running" | "done" | "failed";
export type JobStatus = "queued" | "running" | "done" | "failed";

export type OperationRow = {
  step: string;
  name: string;
  position: number;
  status: OperationStatus;
  error: string | null;
};

export type JobResponse = {
  id: string;
  filename: string;
  size: number;
  status: JobStatus;
  error: string | null;
  operations: OperationRow[];
};

export type StepStatus = OperationStatus;
export type StepNodeData = {
  label: string;
  status: StepStatus;
  operations: OperationRow[];
};
export type StepNode = {
  id: string;
  type: "step";
  position: { x: number; y: number };
  data: StepNodeData;
};
export type StepEdge = {
  id: string;
  source: string;
  target: string;
  type?: "animated";
};

/** Station 1's steps, in assembly-line order. Nothing else knows these names. */
export const STEPS = [
  { id: "parse", label: "Parse" },
  { id: "annotate", label: "Annotate" },
  { id: "resolve", label: "Resolve" },
] as const;

const NODE_GAP = 420;

export function stepStatus(ops: OperationRow[]): StepStatus {
  if (ops.some((o) => o.status === "failed")) return "failed";
  if (ops.some((o) => o.status === "running")) return "running";
  if (ops.length > 0 && ops.every((o) => o.status === "done")) return "done";
  return "pending";
}

export function toGraph(job: JobResponse): {
  nodes: StepNode[];
  edges: StepEdge[];
} {
  const nodes = STEPS.map((step, i): StepNode => {
    const operations = job.operations
      .filter((o) => o.step === step.id)
      .sort((a, b) => a.position - b.position);
    return {
      id: step.id,
      type: "step",
      position: { x: i * NODE_GAP, y: 0 },
      data: { label: step.label, status: stepStatus(operations), operations },
    };
  });
  const edges = nodes.slice(1).map((target, i): StepEdge => {
    const source = nodes[i]!;
    return {
      id: `${source.id}-${target.id}`,
      source: source.id,
      target: target.id,
      ...(target.data.status === "running" ? { type: "animated" } : {}),
    };
  });
  return { nodes, edges };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w apps/web`
Expected: PASS, 10 tests (6 existing + 4 new).

- [ ] **Step 5: Gates and commit**

```bash
npx prettier --write apps/web/lib/graph.ts apps/web/test/graph.test.ts && npm run check-types -w apps/web && npm run lint -w apps/web
git add apps/web/lib/graph.ts apps/web/test/graph.test.ts
git commit -m "Add toGraph: job response to step nodes and edges

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The `/jobs/[id]` page: polling hook, step node, canvas

**Files:**
- Create: `apps/web/app/jobs/[id]/use-job.ts`, `apps/web/app/jobs/[id]/step-node.tsx`, `apps/web/app/jobs/[id]/steps-canvas.tsx`, `apps/web/app/jobs/[id]/page.tsx`
- Modify: `apps/web/app/layout.tsx` (header moved in), `apps/web/app/page.tsx` (header removed)

**Interfaces:**
- Consumes: `toGraph`, `JobResponse`, `StepNodeData`, `OperationStatus` from `@/lib/graph` (Task 2); `Canvas`, `Node`, `NodeHeader`, `NodeTitle`, `NodeDescription`, `NodeContent`, `Edge` from `@dark-factory/ui/components/{canvas,node,edge}` (Task 1).
- Produces: route `/jobs/[id]`.

- [ ] **Step 1: Move the site header into the layout**

In `apps/web/app/page.tsx` the `<header …>Dark Factory</header>` element is the first child of the fragment. Cut it and paste it into `apps/web/app/layout.tsx` directly before `{children}` inside `<body>` (keep the layout's existing wrappers such as the theme provider). Also make the intro copy singular in `page.tsx`:

```tsx
<h1 className="font-display text-h3">New job</h1>
<p className="max-w-[60ch] text-pretty text-muted-foreground">
  Drop the source document — an RFP, a PRD, a spec. It goes down the line:
  parsed into structure, then annotated with what every passage is.
</p>
```

- [ ] **Step 2: Polling hook**

`apps/web/app/jobs/[id]/use-job.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import type { JobResponse } from "@/lib/graph";

const INTERVAL_MS = 2000;

/** Polls the job until it is done or failed. Stops on any error; the user reloads. */
export function useJob(id: string) {
  const [job, setJob] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs/${id}`);
        if (stopped) return;
        if (res.status === 404) return setError("job not found");
        const next = (await res.json()) as JobResponse;
        if (stopped) return;
        setJob(next);
        if (next.status === "done" || next.status === "failed") return;
      } catch {
        if (!stopped) setError("connection lost, reload to retry");
        return;
      }
      timer = setTimeout(tick, INTERVAL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id]);

  return { job, error };
}
```

- [ ] **Step 3: Step node**

`apps/web/app/jobs/[id]/step-node.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import type { NodeProps, Node as FlowNode } from "@xyflow/react";
import { Check, CircleDashed, LoaderCircle, X } from "lucide-react";
import {
  Node,
  NodeContent,
  NodeDescription,
  NodeHeader,
  NodeTitle,
} from "@dark-factory/ui/components/node";
import type { OperationStatus, StepNodeData } from "@/lib/graph";

const ICON: Record<OperationStatus, ReactNode> = {
  pending: <CircleDashed className="size-4 text-muted-foreground" />,
  running: <LoaderCircle className="size-4 animate-spin text-primary" />,
  done: <Check className="size-4 text-primary" />,
  failed: <X className="size-4 text-destructive" />,
};

const LABEL: Record<OperationStatus, string> = {
  pending: "not started",
  running: "running",
  done: "done",
  failed: "failed",
};

export type StepFlowNode = FlowNode<StepNodeData, "step">;

export function StepNode({ id, data }: NodeProps<StepFlowNode>) {
  return (
    <Node handles={{ target: id !== "parse", source: id !== "resolve" }}>
      <NodeHeader>
        <NodeTitle className="flex items-center gap-2">
          {ICON[data.status]}
          {data.label}
        </NodeTitle>
        <NodeDescription>{LABEL[data.status]}</NodeDescription>
      </NodeHeader>
      <NodeContent>
        {data.operations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No operations yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.operations.map((op) => (
              <li key={op.name} className="text-sm">
                <div className="flex items-center gap-2">
                  {ICON[op.status]}
                  <span>{op.name}</span>
                </div>
                {op.error && (
                  <p className="mt-1 pl-6 text-xs text-destructive">
                    {op.error}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </NodeContent>
    </Node>
  );
}
```

`apps/web` needs `@xyflow/react` for the types: `npm i -w apps/web @xyflow/react` (same version `packages/ui` got in Task 1).

- [ ] **Step 4: Canvas component and page**

`apps/web/app/jobs/[id]/steps-canvas.tsx`:

```tsx
"use client";

import { Canvas } from "@dark-factory/ui/components/canvas";
import { Edge } from "@dark-factory/ui/components/edge";
import { toGraph } from "@/lib/graph";
import { StepNode } from "./step-node";
import { useJob } from "./use-job";

const nodeTypes = { step: StepNode };
const edgeTypes = { animated: Edge.Animated };

const formatSize = (bytes: number) =>
  bytes < 1e6
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1048576).toFixed(1)} MB`;

export function StepsCanvas({ id }: { id: string }) {
  const { job, error } = useJob(id);
  if (error && !job) return <p className="text-destructive">{error}</p>;
  if (!job) return <p className="text-muted-foreground">Loading…</p>;
  const { nodes, edges } = toGraph(job);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-h3">{job.filename}</h1>
        <p className="text-muted-foreground">
          {formatSize(job.size)} · {job.status}
        </p>
        {job.error && <p className="text-sm text-destructive">{job.error}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <div className="h-[520px] w-full overflow-hidden rounded-lg border">
        <Canvas
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        />
      </div>
    </div>
  );
}
```

`apps/web/app/jobs/[id]/page.tsx`:

```tsx
import { StepsCanvas } from "./steps-canvas";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-8 pt-14 pb-20">
      <span className="font-display text-eyebrow tracking-eyebrow text-primary uppercase">
        Station 1 · Requirements engineering
      </span>
      <StepsCanvas id={id} />
    </main>
  );
}
```

- [ ] **Step 5: Gates**

```bash
npx prettier --write apps/web/app && npm run check-types -w apps/web && npm run lint -w apps/web && npm run build -w apps/web && npm test -w apps/web
```

Expected: all pass. If `next build` complains that `@xyflow/react/dist/style.css` cannot be imported from `packages/ui`, add `"@xyflow/react"` to `transpilePackages` in `apps/web/next.config.ts` next to `"@dark-factory/ui"` and report it.

- [ ] **Step 6: Live check and commit**

Start the dev server (preview tool, configuration `web`; `.env` is already symlinked into `apps/web`). Create a job from the terminal and open its page:

```bash
curl -s -F file=@packages/parse/test/fixtures/prd-competencies.pdf http://localhost:3001/api/jobs
```

Open `http://localhost:3001/jobs/<id>`. Expected: three nodes, Parse showing four operations that progress to done within about a minute, the edge into a running step animated, Annotate and Resolve "No operations yet." Then:

```bash
git add apps/web package-lock.json
git commit -m "Add /jobs/[id] page with the steps canvas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Wire the intake screen

**Files:**
- Modify: `apps/web/app/intake.tsx`

**Interfaces:**
- Consumes: `POST /api/jobs`; route `/jobs/[id]` (Task 3).

- [ ] **Step 1: Rewrite `intake.tsx` for one file and a real Start run**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, X } from "lucide-react";
import { Button } from "@dark-factory/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dark-factory/ui/components/card";
import { FileUpload } from "@dark-factory/ui/components/file-upload";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@dark-factory/ui/components/item";

const formatSize = (bytes: number) =>
  bytes < 1e6
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1048576).toFixed(1)} MB`;

export function Intake() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    try {
      const res = await fetch("/api/jobs", { method: "POST", body });
      if (res.status === 202) {
        const { id } = (await res.json()) as { id: string };
        router.push(`/jobs/${id}`);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        res.status === 400 && data.error
          ? data.error
          : "could not start the job",
      );
    } catch {
      setError("could not start the job");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-8">
      <FileUpload
        accept=".pdf,application/pdf"
        title={
          file ? "Drop another document to replace it" : "Drop a requirements document here"
        }
        description="PDF only for now"
        onFiles={(added) => {
          setFile(added[0] ?? null);
          setError(null);
        }}
      />

      {file && (
        <Card>
          <CardHeader>
            <CardTitle>Ready to run</CardTitle>
            <CardDescription>1 document queued</CardDescription>
            <CardAction>
              <Button size="lg" onClick={start} disabled={busy}>
                {busy ? "Starting…" : "Start run"}
                <ArrowRight />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Item size="sm" className="px-0">
              <ItemMedia variant="icon">
                <FileText />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="max-w-full truncate">{file.name}</ItemTitle>
                <ItemDescription>{formatSize(file.size)}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFile(null)}
                  disabled={busy}
                >
                  <X />
                </Button>
              </ItemActions>
            </Item>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

Note `multiple` is gone from `FileUpload`; if `FileUpload` still hands over several files on a multi-drop, only the first is kept.

- [ ] **Step 2: Gates**

```bash
npx prettier --write apps/web/app/intake.tsx && npm run check-types -w apps/web && npm run lint -w apps/web && npm run build -w apps/web
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/intake.tsx
git commit -m "Wire Start run to POST /api/jobs and navigate to the job page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Live verification, full gates, PR

**Files:** none new.

- [ ] **Step 1: Live verification in the browser**

With the dev server running (preview tool, configuration `web`), on `http://localhost:3001`:

1. Drop or pick `packages/parse/test/fixtures/prd-competencies.pdf`, click Start run. Expected: navigation to `/jobs/<id>`; the Parse node's operations move from not started to done within about a minute; the page stops polling (check `read_network_requests`: no further `/api/jobs/<id>` calls after status done). Screenshot the finished canvas.
2. Back on `/`, pick any non-PDF file renamed to `.pdf` (for example `echo hi > /tmp/x.pdf`). Click Start run. Expected: the inline message "not a PDF" under the file row, the button enabled again. Screenshot.
3. Open `/jobs/00000000-0000-4000-8000-000000000000`. Expected: "job not found".

Check `read_console_messages` for errors on each page; React Flow warnings about missing node dimensions or `nodeTypes` recreation are findings to fix.

- [ ] **Step 2: Full gates from the root**

```bash
npm run check-types && npm run lint && npm run build && npm test
```

- [ ] **Step 3: PR through Origin**

Push and open the PR against `main` with the `origin` skill (`--status open`): what changed, why, the gate summary, and the two screenshots' findings. Do not merge.
