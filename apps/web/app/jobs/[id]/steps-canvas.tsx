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
