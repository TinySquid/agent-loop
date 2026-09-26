/** Deep module: model tool calls in -> one tool-result message per call, in order. */
import type { ChatToolCall, ChatToolMessage } from "@openrouter/sdk/models";
import type { Tool } from "./tools";

export async function executeToolCalls(
  tools: readonly Tool[],
  calls: readonly ChatToolCall[]
): Promise<ChatToolMessage[]> {
  const results: ChatToolMessage[] = [];
  for (const call of calls) {
    const content = await toolContent(tools, call);
    results.push({ role: "tool", toolCallId: call.id, content });
  }
  return results;
}

/**
 * One call -> one result string. Every failure mode (unknown tool, unparseable
 * args, execute throwing) becomes error text the model can read and correct —
 * never an exception that aborts the run.
 */
async function toolContent(
  tools: readonly Tool[],
  call: ChatToolCall
): Promise<string> {
  const tool = tools.find((t) => t.function.name === call.function.name);
  if (!tool) {
    const known = tools.map((t) => t.function.name).join(", ");
    return toolError(
      `unknown tool '${call.function.name}'. known tools: ${known}`
    );
  }

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.function.arguments);
  } catch (error) {
    return toolError(
      `could not parse tool call arguments as JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  try {
    return await tool.execute(args);
  } catch (error) {
    return toolError(
      `tool '${call.function.name}' failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function toolError(text: string): string {
  return `error: ${text}`;
}
