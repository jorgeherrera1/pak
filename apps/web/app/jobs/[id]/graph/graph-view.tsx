"use client";

import type { ParsedDocument } from "@dark-factory/parse";
import { Canvas } from "@dark-factory/ui/components/canvas";
import { Controls, MarkerType, useReactFlow, type Edge } from "@xyflow/react";
import { useMemo, useState } from "react";
import { CARD, DOCUMENT, toTree } from "@/lib/parse-tree";
import { ElementNode, type ElementFlowNode } from "./element-node";
import { ElementPanel } from "./element-panel";

const nodeTypes = { element: ElementNode };

/** The tree on the left; whatever is clicked opens in the panel on the right. */
export function GraphView({
  doc,
  jobId,
}: {
  doc: ParsedDocument;
  jobId: string;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const { fitView, getZoom } = useReactFlow();
  const tree = useMemo(() => toTree(doc, open), [doc, open]);

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
  const nodes: ElementFlowNode[] = tree.nodes.map((n) => ({
    ...n,
    // Every card is CARD-sized; without `measured` on these controlled nodes, fitView finds nothing to fit.
    measured: CARD,
    selected: n.id === selected,
    data: { ...n.data, onToggle: () => toggle(n.id) },
  }));
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
      {selected && (
        <ElementPanel
          doc={doc}
          jobId={jobId}
          id={selected}
          onSelect={select}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
