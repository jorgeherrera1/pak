import { Position, ReactFlowProvider, type EdgeProps } from "@xyflow/react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { Edge } from "./edge";

test("Temporary renders a dashed path", () => {
  const html = renderToStaticMarkup(
    <ReactFlowProvider>
      <svg>
        <Edge.Temporary
          {...({
            id: "e",
            source: "a",
            target: "b",
            sourceX: 0,
            sourceY: 0,
            targetX: 100,
            targetY: 0,
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
          } as EdgeProps)}
        />
      </svg>
    </ReactFlowProvider>,
  );
  expect(html).toContain("<path");
  expect(html).toContain("stroke-dasharray");
});
