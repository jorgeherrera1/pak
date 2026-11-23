import { updateInput, updateNode } from "@dark-factory/srs";
import { defineTool } from "@grok/agent-sdk/tools";
import { type ToolCtx, withGraph } from "../lib/store.ts";

export default defineTool({
  description:
    "Patch the fields of a node, including product. Errors: NOT_FOUND, INVALID_FIELDS.",
  inputSchema: updateInput,
  effect: "write",
  async execute(input, ctx: ToolCtx) {
    return withGraph(ctx, (graph) => ({
      graph: updateNode(graph, input),
      result: { id: input.id },
    }));
  },
});
