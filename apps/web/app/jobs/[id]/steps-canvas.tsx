"use client";

import { Canvas } from "@dark-factory/ui/components/canvas";
import { Edge } from "@dark-factory/ui/components/edge";
import { toCanvas } from "@/lib/canvas";
import { formatSize } from "@/lib/format";
import { StepNode } from "./step-node";
import { useJob } from "./use-job";

const nodeTypes = { step: StepNode };
const edgeTypes = { animated: Edge.Animated };

export function StepsCanvas({ id }: { id: string }) {
  const { job, error } = useJob(id);
  if (error && !job)
    return (
      <p role="alert" className="text-destructive">
        {error}
      </p>
    );
  if (!job) return <p className="text-muted-foreground">Loading…</p>;
  const { nodes, edges } = toCanvas(job);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-h3">{job.filename}</h1>
        <p role="status" className="text-muted-foreground">
          {formatSize(job.size)} · {job.status}
        </p>
        {job.error && (
          <p role="alert" className="text-sm text-destructive">
            {job.error}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="h-[520px] w-full overflow-hidden rounded-lg border">
        <Canvas
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          panOnDrag
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        />
      </div>
    </div>
  );
}
