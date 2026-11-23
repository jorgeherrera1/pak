import {
  addEntity,
  elementIds,
  entityInput,
  entityTypes,
} from "@dark-factory/srs";
import { defineTool } from "@grok/agent-sdk/tools";
import { type ToolCtx, withGraph } from "../lib/store.ts";

const types = entityTypes()
  .map((type) => type.slug)
  .join(", ");

export default defineTool({
  description: `Add one entity. type is one of: ${types}. name is unique for that type. ENTITY_EXISTS returns the existing id. Other errors: UNKNOWN_TYPE, UNKNOWN_ELEMENT, INVALID_FIELDS.`,
  inputSchema: entityInput,
  effect: "write",
  async execute(input, ctx: ToolCtx) {
    return withGraph(ctx, (graph, doc) => {
      const added = addEntity(graph, elementIds(doc), input);
      return { graph: added.graph, result: { id: added.id } };
    });
  },
});
