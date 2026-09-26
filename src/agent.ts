import type {
  ChatFunctionTool,
  ChatMessages,
  ChatStreamDelta,
  ChatToolCall,
  ChatUsage
} from "@openrouter/sdk/models";
import type { ChatChunkHandler, ChatModel } from "./chat-model";
import { executeToolCalls } from "./tool-execution";
import { toolSpecs, type Tool } from "./tools";

export interface AgentRun {
  prompt: string;
  model: ChatModel;
  tools: readonly Tool[];
  system?: string;
  maxRounds?: number;
  /** Omit for a silent run; when given, the loop reports its live activity. */
  onEvent?: (event: AgentEvent) => void;
}

/** What happened while the loop ran, in the order it happened. */
export type AgentEvent =
  | { type: "round-start"; round: number }
  | { type: "assistant-text"; text: string }
  | { type: "tool-call"; round: number; call: ChatToolCall }
  | { type: "usage"; usage: ChatUsage };

/**
 * Run the agent loop for one prompt: call the model, iterate tool calls
 * until a final answer. CLI dispatch calls this with a ChatModel adapter.
 */
export async function runAgent(run: AgentRun): Promise<string> {
  // The tools module owns the model half -> wire projection; the loop never
  // touches tool internals, so new schema fields ride through untouched.
  const tools: readonly ChatFunctionTool[] = toolSpecs(run.tools);
  const turns: ChatMessages[] = setInitialTurn(run.prompt, run.system);
  const totals = { promptTokens: 0, completionTokens: 0 };

  for (let round = 1; round <= (run.maxRounds ?? 8); round++) {
    run.onEvent?.({ type: "round-start", round });
    const reply = await run.model.complete(turns, tools, streamToEvents(run));
    const message = reply.choices[0]?.message;
    if (!message) throw new Error("model returned no choices");
    const calls = message.toolCalls ?? [];

    if (reply.usage) {
      totals.promptTokens += reply.usage.promptTokens;
      totals.completionTokens += reply.usage.completionTokens;
    }

    if (calls.length === 0) {
      // content may be string or ChatContentItems[] per the SDK; v1 handles text only
      const content = message.content ?? "";
      run.onEvent?.({
        type: "usage",
        usage: {
          promptTokens: totals.promptTokens,
          completionTokens: totals.completionTokens,
          totalTokens: totals.promptTokens + totals.completionTokens
        }
      });
      return typeof content === "string" ? content : "";
    }

    turns.push(message); // echo verbatim
    for (const call of calls) {
      run.onEvent?.({ type: "tool-call", round, call });
    }
    turns.push(...(await executeToolCalls(run.tools, calls)));
  }
  throw new Error(
    `agent exceeded ${run.maxRounds ?? 8} rounds without a final answer`
  );
}

function streamToEvents(run: AgentRun): ChatChunkHandler | undefined {
  if (!run.onEvent) return undefined;
  return (delta: ChatStreamDelta) => {
    if (delta.content)
      run.onEvent?.({ type: "assistant-text", text: delta.content });
  };
}

/**
 * Creates the initial turn with the user prompt, optionally injecting
 * a system prompt as the first entry if provided.
 */
function setInitialTurn(user: string, system?: string): ChatMessages[] {
  const turn: ChatMessages[] = [{ role: "user", content: user }];
  if (system !== undefined)
    turn.unshift({
      role: "system",
      content: system
    });

  return turn;
}
