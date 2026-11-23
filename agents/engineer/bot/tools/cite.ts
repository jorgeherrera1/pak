import { cite, citeInput, elementIds } from "@dark-factory/srs";
import { defineTool } from "@grok/agent-sdk/tools";
import { type ToolCtx, withGraph } from "../lib/store.ts";

export default defineTool({
  description:
    "Add element ids to a node and set its sourceText to the source's words. Errors: NOT_FOUND, UNKNOWN_ELEMENT.",
  inputSchema: citeInput,
  effect: "write",
  async execute(input, ctx: ToolCtx) {
    return withGraph(ctx, (graph, doc) => ({
      graph: cite(graph, elementIds(doc), input),
      result: { id: input.id },
    }));
  },
});
