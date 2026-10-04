"use client";

import type { Classification } from "@dark-factory/annotate";
import {
  Handle,
  Position,
  type Node as FlowNode,
  type NodeProps,
} from "@xyflow/react";
import { cn } from "@dark-factory/ui/lib/utils";
import { CARD } from "@/lib/parse-tree";
import { familyOf } from "@/lib/vocabulary";

export type RequirementFlowNode = FlowNode<Classification, "requirement">;

/** A requirement in its family's colour: what it quotes, then its id and type. Its FROM edge leaves on the left. */
export function RequirementNode({
  data,
  selected,
}: NodeProps<RequirementFlowNode>) {
  const f = familyOf(data.type);
  return (
    <div
      style={CARD}
      className={cn(
        "flex cursor-pointer flex-col justify-center gap-0.5 rounded-sm border border-l-4 bg-card px-3 text-sm",
        f.line,
        selected && `${f.tint[0]} ring-2 ${f.ring}`,
      )}
    >
      <Handle
        type="source"
        position={Position.Left}
        isConnectable={false}
        className="opacity-0"
      />
      <span title={data.text} className="truncate">
        {data.text}
      </span>
      <code className={cn("truncate text-[11px] font-bold", f.ink)}>
        {data.id} · {data.type}
        {data.category && ` · ${data.category}`}
      </code>
    </div>
  );
}
