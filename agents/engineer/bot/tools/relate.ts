import { relate, relateInput } from "@dark-factory/srs";
import { defineTool } from "@grok/agent-sdk/tools";
import { type ToolCtx, withGraph } from "../lib/store.ts";

export default defineTool({
  description:
    "Link two nodes. RELATES_TO also needs label and cardinality. The same triple updates in place. Errors: RELATION_NOT_ALLOWED (lists the allowed endpoints), NOT_FOUND.",
  inputSchema: relateInput,
  effect: "write",
  async execute(input, ctx: ToolCtx) {
    return withGraph(ctx, (graph) => ({
      graph: relate(graph, input),
      result: {
        fromId: input.fromId,
        relation: input.relation,
        toId: input.toId,
      },
    }));
  },
});
