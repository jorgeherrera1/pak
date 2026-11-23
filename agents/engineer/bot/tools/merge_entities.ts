import { mergeEntities, mergeInput } from "@dark-factory/srs";
import { defineTool } from "@grok/agent-sdk/tools";
import { type ToolCtx, withGraph } from "../lib/store.ts";

export default defineTool({
  description:
    "Keep one entity and fold another of the same type into it. Relations move to the kept id. Errors: NOT_FOUND, TYPE_MISMATCH.",
  inputSchema: mergeInput,
  effect: "write",
  async execute(input, ctx: ToolCtx) {
    return withGraph(ctx, (graph) => ({
      graph: mergeEntities(graph, input),
      result: { id: input.keepId },
    }));
  },
});
