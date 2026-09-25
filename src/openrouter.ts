import { OpenRouterCore } from "@openrouter/sdk/core";
import { resolveApiKey } from "./credentials";

export function createOpenRouterClient(): OpenRouterCore {
  const { apiKey } = resolveApiKey();

  return new OpenRouterCore({
    apiKey
  });
}
