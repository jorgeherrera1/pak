"use client";

import type { Classification } from "@dark-factory/annotate";
import type { ParsedDocument } from "@dark-factory/parse";
import { Canvas } from "@dark-factory/ui/components/canvas";
import { Controls, MarkerType, useReactFlow, type Edge } from "@xyflow/react";
import { useMemo, useState } from "react";
import { CARD, DOCUMENT, toTree } from "@/lib/parse-tree";
import { ElementNode, type ElementFlowNode } from "./element-node";
import { ElementPanel } from "./element-panel";
import { RequirementNode, type RequirementFlowNode } from "./requirement-node";
import { RequirementPanel } from "./requirement-panel";

const nodeTypes = { element: ElementNode, requirement: RequirementNode };

/** The tree on the left; whatever is clicked opens in the panel on the right. Given requirements, they hang off what they quote. */
export function GraphView({
  doc,
  jobId,
  requirements,
}: {
  doc: ParsedDocument;
  jobId: string;
  requirements?: Classification[];
}) {
  // Requirements are what the Annotate graph is for, so it opens with every one of them showing.
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () =>
      new Set(requirements ? [DOCUMENT, ...doc.elements.map((e) => e.id)] : []),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const { fitView, getZoom } = useReactFlow();
  const tree = useMemo(
    () => toTree(doc, open, requirements),
    [doc, open, requirements],
  );

  const byId = useMemo(
    () => new Map(doc.elements.map((e) => [e.id, e])),
    [doc],
  );

  /** Centres `id` at the current zoom. */
  const focus = (id: string) => {
    const zoom = getZoom();
    void fitView({
      nodes: [{ id }],
      minZoom: zoom,
      maxZoom: zoom,
      duration: 300,
    });
  };

  /** Selects `id` and opens what hides its card: sections are always drawn, anything else needs its parent open. */
  const select = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      for (let e = byId.get(id); e && e.kind !== "section";) {
        next.add(e.parent ?? DOCUMENT);
        e = byId.get(e.parent ?? DOCUMENT);
      }
      return next;
    });
    setSelected(id);
    focus(id);
  };
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const nodes = tree.nodes.map((n): ElementFlowNode | RequirementFlowNode => {
    // Every card is CARD-sized; without `measured` on these controlled nodes, fitView finds nothing to fit.
    const flow = { measured: CARD, selected: n.id === selected };
    return n.type === "element"
      ? { ...n, ...flow, data: { ...n.data, onToggle: () => toggle(n.id) } }
      : { ...n, ...flow };
  });
  const requirement = requirements?.find((r) => r.id === selected);
  const edges: Edge[] = tree.edges.map((e) => ({
    ...e,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
  }));

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1">
        <Canvas
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          minZoom={0.1}
          panOnDrag
          nodesDraggable={false}
          nodesConnectable={false}
          onNodesChange={(changes) => {
            for (const c of changes)
              if (c.type === "select" && c.selected) {
                setSelected(c.id);
                focus(c.id);
              }
          }}
        >
          <Controls showInteractive={false} />
        </Canvas>
      </div>
      {requirement ? (
        <RequirementPanel
          jobId={jobId}
          r={requirement}
          onSelect={select}
          onClose={() => setSelected(null)}
        />
      ) : (
        selected && (
          <ElementPanel
            doc={doc}
            jobId={jobId}
            id={selected}
            onSelect={select}
            onClose={() => setSelected(null)}
          />
        )
      )}
    </div>
  );
}
