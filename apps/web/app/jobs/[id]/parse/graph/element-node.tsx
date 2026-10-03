"use client";

import {
  Handle,
  Position,
  type Node as FlowNode,
  type NodeProps,
} from "@xyflow/react";
import { ChevronRight } from "lucide-react";
import { cn } from "@dark-factory/ui/lib/utils";
import { CARD, type TreeNodeData } from "@/lib/parse-tree";

export type ElementNodeData = TreeNodeData & { onToggle: () => void };
export type ElementFlowNode = FlowNode<ElementNodeData, "element">;

/** One card in the tree. IN edges leave a child on its left and arrive at its parent on the right. */
export function ElementNode({ data, selected }: NodeProps<ElementFlowNode>) {
  const heading = data.kind === "document" || data.kind === "section";
  return (
    <div
      style={CARD}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-sm border bg-card px-3 text-sm",
        data.kind === "document" &&
          "border-foreground bg-foreground text-background",
        selected && "border-2 border-primary bg-secondary text-foreground",
      )}
    >
      <Handle
        type="source"
        position={Position.Left}
        isConnectable={false}
        className="opacity-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          title={data.label}
          className={cn("truncate", heading && "font-display font-bold")}
        >
          {data.label}
        </span>
        <code
          title={data.caption}
          className={cn(
            "truncate text-[11px]",
            data.kind === "document" && !selected
              ? "opacity-70"
              : "text-muted-foreground",
          )}
        >
          {data.caption}
        </code>
      </div>
      {data.openable && (
        <button
          type="button"
          aria-expanded={data.open}
          aria-label={`${data.open ? "Hide" : "Show"} what ${data.label} holds`}
          onClick={(e) => {
            e.stopPropagation();
            data.onToggle();
          }}
          className="nodrag nopan -mr-1 rounded-xs p-1 text-muted-foreground hover:bg-secondary hover:text-primary"
        >
          <ChevronRight
            className={cn(
              "size-4 transition-transform",
              data.open && "rotate-180",
            )}
          />
        </button>
      )}
      <Handle
        type="target"
        position={Position.Right}
        isConnectable={false}
        className="opacity-0"
      />
    </div>
  );
}
