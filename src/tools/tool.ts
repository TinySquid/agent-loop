import type { ChatFunctionToolFunction } from "@openrouter/sdk/models";

/**
 * The contract every tool satisfies: an OpenRouter function schema plus the
 * implementation the loop invokes. This is the seam the agent loop and
 * tool-execution see; everything else about a tool is hidden behind it.
 */
export interface Tool extends ChatFunctionToolFunction {
  execute(args: Record<string, unknown>): Promise<string>;
}
