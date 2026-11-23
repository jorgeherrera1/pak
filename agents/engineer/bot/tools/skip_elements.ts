import { elementIds, skipElements, skipInput } from "@dark-factory/srs";
import { defineTool } from "@grok/agent-sdk/tools";
import { type ToolCtx, withGraph } from "../lib/store.ts";

export default defineTool({
  description:
    "Mark content elements that state no requirement. Errors: UNKNOWN_ELEMENT, ALREADY_CITED.",
  inputSchema: skipInput,
  effect: "write",
  async execute(input, ctx: ToolCtx) {
    return withGraph(ctx, (graph, doc) => ({
      graph: skipElements(graph, elementIds(doc), input),
      result: { skipped: input.elementIds.length },
    }));
  },
});
