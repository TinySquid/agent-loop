import type { ChatFunctionTool, ChatMessages } from "@openrouter/sdk/models";
import type { ChatModel } from "./chat-model";
import type { Tool } from "./tools";
import { executeToolCalls } from "./tool-execution";

export interface AgentRun {
  prompt: string;
  model: ChatModel;
  tools: readonly Tool[];
  maxRounds?: number;
}

/**
 * Run the agent loop for one prompt: call the model, iterate tool calls
 * until a final answer. CLI dispatch calls this with a ChatModel adapter.
 */
export async function runAgent(run: AgentRun): Promise<string> {
  const tools: ChatFunctionTool[] = run.tools.map((tool) => {
    // strip `execute` so the implementation half never reaches the wire
    const spec: ChatFunctionTool = {
      type: tool.type,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters
      }
    };
    return spec;
  });
  const turns: ChatMessages[] = [{ role: "user", content: run.prompt }];

  for (let round = 1; round <= (run.maxRounds ?? 8); round++) {
    const reply = await run.model.complete(turns, tools);
    const message = reply.choices[0]?.message;
    if (!message) throw new Error("model returned no choices");
    const calls = message.toolCalls ?? [];

    if (calls.length === 0) {
      // content may be string or ChatContentItems[] per the SDK; v1 handles text only
      const content = message.content ?? "";
      return typeof content === "string" ? content : "";
    }

    turns.push(message); // echo verbatim
    turns.push(...(await executeToolCalls(run.tools, calls)));
  }
  throw new Error(
    `agent exceeded ${run.maxRounds ?? 8} rounds without a final answer`
  );
}
