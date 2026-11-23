import { removeInput, removeNode } from "@dark-factory/srs";
import { defineTool } from "@grok/agent-sdk/tools";
import { type ToolCtx, withGraph } from "../lib/store.ts";

export default defineTool({
  description:
    "Remove a node and the relations that touch it. HAS_CHILDREN if anything still hangs under it. The id is not reused.",
  inputSchema: removeInput,
  effect: "write",
  async execute(input, ctx: ToolCtx) {
    return withGraph(ctx, (graph) => ({
      graph: removeNode(graph, input.id),
      result: { id: input.id },
    }));
  },
});
