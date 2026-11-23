import { findInput, findText } from "@dark-factory/srs";
import { defineTool } from "@grok/agent-sdk/tools";
import { type ToolCtx, withGraph } from "../lib/store.ts";

export default defineTool({
  description:
    "Find element ids whose text contains the given string, case-insensitive. Returns at most 40 matches.",
  inputSchema: findInput,
  effect: "read",
  async execute(input, ctx: ToolCtx) {
    return withGraph(ctx, (_graph, doc) => ({
      result: { matches: findText(doc, input.text) },
    }));
  },
});
