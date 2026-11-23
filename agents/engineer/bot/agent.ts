import { defineAgent } from "@grok/agent-sdk";

export default defineAgent({
  name: "engineer",
  description:
    "Reads a parsed source document and builds its SRS requirements graph.",
  model: {
    id: "grok-4.7",
    params: [{ id: "reasoning_effort", value: "high" }],
  },
  tools: [],
});
