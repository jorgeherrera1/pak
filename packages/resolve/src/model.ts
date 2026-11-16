import { createAzure } from "@ai-sdk/azure";
import { generateText, Output } from "ai";
import type { z } from "zod";

/** Azure AI Foundry deployment name. */
const MODEL = "gpt-4o";

/** Instructions and text in, the model's rows of `element` out. Calls the model every time. */
export async function runModel<T>(
  instructions: string,
  text: string,
  element: z.ZodType<T>,
): Promise<T[]> {
  // Read per call, not at import: the integration test loads .env after importing this module.
  const baseURL = process.env.AZURE_FOUNDRY_ENDPOINT;
  if (!baseURL) throw new Error("AZURE_FOUNDRY_ENDPOINT is not set");
  const { output } = await generateText({
    model: createAzure({ baseURL })(MODEL),
    output: Output.array({ element }),
    temperature: 0,
    instructions,
    prompt: text,
  });
  return output;
}
