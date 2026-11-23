import {
  addStatement,
  elementIds,
  statementInput,
  statementTypes,
} from "@dark-factory/srs";
import { defineTool } from "@grok/agent-sdk/tools";
import { type ToolCtx, withGraph } from "../lib/store.ts";

const types = statementTypes()
  .map((type) => type.slug)
  .join(", ");

export default defineTool({
  description: `Add one statement. type is one of: ${types}. The tool assigns the id. Errors: UNKNOWN_TYPE, PARENT_NOT_FOUND, PARENT_TYPE_NOT_ALLOWED, UNKNOWN_ELEMENT, INVALID_FIELDS.`,
  inputSchema: statementInput,
  effect: "write",
  async execute(input, ctx: ToolCtx) {
    return withGraph(ctx, (graph, doc) => {
      const added = addStatement(graph, elementIds(doc), input);
      return { graph: added.graph, result: { id: added.id } };
    });
  },
});
