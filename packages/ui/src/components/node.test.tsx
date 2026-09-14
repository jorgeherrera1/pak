import { ReactFlowProvider } from "@xyflow/react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { Node, NodeHeader, NodeTitle } from "./node";

test("renders a target handle only when source is disabled", () => {
  const html = renderToStaticMarkup(
    <ReactFlowProvider>
      <Node handles={{ target: true, source: false }}>
        <NodeHeader>
          <NodeTitle>Parse</NodeTitle>
        </NodeHeader>
      </Node>
    </ReactFlowProvider>,
  );
  expect(html).toContain("Parse");
  expect(html).toContain("react-flow__handle-left");
  expect(html).toContain('data-handlepos="left"');
  expect(html).not.toContain("react-flow__handle-right");
});

test("renders both handles when target and source are enabled", () => {
  const html = renderToStaticMarkup(
    <ReactFlowProvider>
      <Node handles={{ target: true, source: true }}>
        <NodeHeader>
          <NodeTitle>Annotate</NodeTitle>
        </NodeHeader>
      </Node>
    </ReactFlowProvider>,
  );
  expect(html).toContain("react-flow__handle-left");
  expect(html).toContain('data-handlepos="left"');
  expect(html).toContain("react-flow__handle-right");
  expect(html).toContain('data-handlepos="right"');
});
