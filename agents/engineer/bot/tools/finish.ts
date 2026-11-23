import { check } from "@dark-factory/srs";
import type { ToolContext } from "@grok/agent-sdk/tools";
import { defineTool } from "@grok/agent-sdk/tools";
import { z } from "zod";
import { loadDocument, loadGraph, locked, type ToolCtx } from "../lib/store.ts";

export default defineTool({
  description:
    "Run the completeness check. When there are no failures, tag the srs-graph artifact. Warnings do not block. Call this again after fixing failures.",
  inputSchema: z.object({}),
  effect: "write",
  async execute(_input, ctx: ToolCtx & Pick<ToolContext, "artifacts">) {
    return locked(async () => {
      const doc = await loadDocument(ctx);
      const graph = await loadGraph(ctx);
      const result = check(doc, graph);
      if (result.failures.length === 0) {
        await ctx.artifacts.tag({
          kind: "srs-graph",
          key: graph.runId,
          title: graph.runId,
          data: graph,
        });
      }
      return {
        ok: result.failures.length === 0,
        failures: result.failures,
        warnings: result.warnings,
      };
    });
  },
});
