import { citedIds, contentIds, orphans } from "@dark-factory/srs";
import { defineTool } from "@grok/agent-sdk/tools";
import { z } from "zod";
import { type ToolCtx, withGraph } from "../lib/store.ts";

export default defineTool({
  description:
    "Counts by type, content elements that are neither cited nor skipped, and nodes whose parent is missing or the wrong type.",
  inputSchema: z.object({}),
  effect: "read",
  async execute(_input, ctx: ToolCtx) {
    return withGraph(ctx, (graph, doc) => {
      const covered = citedIds(graph);
      for (const row of graph.skipped) covered.add(row.elementId);
      const uncovered = contentIds(doc).filter((id) => !covered.has(id));
      const counts: Record<string, number> = {};
      for (const node of [...graph.statements, ...graph.entities]) {
        counts[node.type] = (counts[node.type] ?? 0) + 1;
      }
      return {
        result: {
          counts,
          uncoveredCount: uncovered.length,
          uncovered,
          orphans: orphans(graph),
        },
      };
    });
  },
});
