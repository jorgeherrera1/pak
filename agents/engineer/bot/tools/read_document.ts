import { page, readInput } from "@dark-factory/srs";
import { defineTool } from "@grok/agent-sdk/tools";
import { type ToolCtx, withGraph } from "../lib/store.ts";

export default defineTool({
  description:
    "Read the parsed document in order. Pass limit (max 40). Pass fromElementId to continue from nextFromElementId. UNKNOWN_ELEMENT if that id is not in the document.",
  inputSchema: readInput,
  effect: "read",
  async execute(input, ctx: ToolCtx) {
    return withGraph(ctx, (_graph, doc) => ({
      result: page(doc, input.fromElementId, input.limit),
    }));
  },
});
