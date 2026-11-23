import { graphSchema } from "@dark-factory/srs";
import { defineArtifacts } from "@grok/agent-sdk/artifacts";

export default defineArtifacts({
  kinds: {
    "srs-graph": {
      description:
        "The requirements graph for one run, in the SRS template vocabulary.",
      schema: graphSchema,
    },
  },
  agentTool: false,
});
