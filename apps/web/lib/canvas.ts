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
  handles: { target: boolean; source: boolean };
  /** Where the step's result can be read, once there is one. */
  href?: string;
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

/** Station 1's steps, in assembly-line order. Nothing else knows these names. A step's node links to its page only when it has one. */
export const STEPS = [
  { id: "parse", label: "Parse", page: true },
  { id: "annotate", label: "Annotate", page: true },
  { id: "resolve", label: "Resolve", page: false },
] as const;

const NODE_GAP = 420;

export function stepStatus(ops: OperationRow[]): StepStatus {
  if (ops.some((o) => o.status === "failed")) return "failed";
  if (ops.some((o) => o.status === "running")) return "running";
  if (ops.length > 0 && ops.every((o) => o.status === "done")) return "done";
  return "pending";
}

export function toCanvas(job: JobResponse): {
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
      data: {
        label: step.label,
        status: stepStatus(operations),
        operations,
        handles: { target: i > 0, source: i < STEPS.length - 1 },
        ...(step.page &&
          stepStatus(operations) === "done" && {
            href: `/jobs/${job.id}/${step.id}`,
          }),
      },
    };
  });
  const edges = nodes.slice(1).map((target, i): StepEdge => {
    const source = nodes[i]!;
    return {
      id: `${source.id}-${target.id}`,
      source: source.id,
      target: target.id,
      type: target.data.status === "running" ? "animated" : undefined,
    };
  });
  return { nodes, edges };
}
