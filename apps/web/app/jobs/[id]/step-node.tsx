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
