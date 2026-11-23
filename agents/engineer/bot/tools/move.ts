import { moveInput, moveNode } from "@dark-factory/srs";
import { defineTool } from "@grok/agent-sdk/tools";
import { type ToolCtx, withGraph } from "../lib/store.ts";

export default defineTool({
  description:
    "Change a node's parent. Errors: NOT_FOUND, PARENT_NOT_FOUND, PARENT_TYPE_NOT_ALLOWED.",
  inputSchema: moveInput,
  effect: "write",
  async execute(input, ctx: ToolCtx) {
    return withGraph(ctx, (graph) => ({
      graph: moveNode(graph, input),
      result: { id: input.id, parentId: input.parentId },
    }));
  },
});
