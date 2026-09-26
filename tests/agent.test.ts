import { describe, expect, it } from "vitest";
import { runAgent, type AgentEvent } from "../src/agent.js";
import type { ChatModel } from "../src/chat-model.js";
import type { Tool } from "../src/tools/index.js";
import type {
  ChatAssistantMessage,
  ChatMessages,
  ChatStreamDelta,
  ChatToolCall,
  ChatUsage
} from "@openrouter/sdk/models";

/**
 * A scripted ChatModel: returns the given messages in order. Records every
 * transcript it was asked to complete, so tests can assert on the turns the
 * loop assembled.
 */
function scriptedModel(
  script: ChatAssistantMessage[]
): ChatModel & { seenTranscripts: ChatMessages[][] } {
  const seenTranscripts: ChatMessages[][] = [];
  return {
    seenTranscripts,
    async complete(turns) {
      seenTranscripts.push([...turns]);
      const next = script.shift();
      if (!next) throw new Error("script exhausted");
      return {
        id: "test-completion",
        created: 0,
        model: "scripted",
        object: "chat.completion",
        choices: [{ index: 0, finishReason: null, message: next }],
        systemFingerprint: null
      };
    }
  };
}

function toolCall(name: string, argsJson: string): ChatToolCall {
  return {
    id: `call-${name}`,
    type: "function",
    function: { name, arguments: argsJson }
  };
}

const plusTool: Tool = {
  spec: {
    type: "function",
    function: {
      name: "plus",
      description: "Add two numbers",
      parameters: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" }
        },
        required: ["a", "b"]
      }
    }
  },
  async execute(args) {
    return String(Number(args.a) + Number(args.b));
  }
};

describe("runAgent", () => {
  it("returns the model's answer directly when no tool calls occur", async () => {
    const model = scriptedModel([{ role: "assistant", content: "the answer" }]);
    const answer = await runAgent({
      prompt: "hello",
      model,
      tools: [plusTool]
    });
    expect(answer).toBe("the answer");
    expect(model.seenTranscripts).toHaveLength(1);
    expect(model.seenTranscripts[0]).toHaveLength(1); // just the user turn
  });

  it("executes tool calls, feeds results back, then returns the answer", async () => {
    const model = scriptedModel([
      {
        role: "assistant",
        content: null,
        toolCalls: [toolCall("plus", '{"a": 2, "b": 2}')]
      },
      { role: "assistant", content: "4" }
    ]);
    const answer = await runAgent({
      prompt: "what is 2+2?",
      model,
      tools: [plusTool]
    });

    expect(answer).toBe("4");

    // second round transcript: user -> assistant(toolCall) -> tool result
    expect(model.seenTranscripts).toHaveLength(2);
    const second = model.seenTranscripts[1] ?? [];
    expect(second).toHaveLength(3);
    expect(second[1]).toMatchObject({ role: "assistant" });
    expect(second[2]).toMatchObject({
      role: "tool",
      toolCallId: "call-plus",
      content: "4"
    });
  });

  it("feeds tool failures back as error content instead of aborting", async () => {
    const model = scriptedModel([
      {
        role: "assistant",
        content: null,
        toolCalls: [toolCall("nope", '{"a": 1}')]
      },
      { role: "assistant", content: "recovered" }
    ]);
    const answer = await runAgent({
      prompt: "try it",
      model,
      tools: [plusTool]
    });
    expect(answer).toBe("recovered");

    // the second-round transcript should carry an error tool-result turn
    const transcript = scriptedTranscript(model, 1);
    const toolTurn = transcript.find((t) => t.role === "tool") as
      { content: string } | undefined;
    expect(toolTurn?.content).toContain("error:");
    expect(toolTurn?.content).toContain("unknown tool 'nope'");
  });

  it("prepends the system prompt as the first turn when given", async () => {
    const model = scriptedModel([{ role: "assistant", content: "done" }]);
    await runAgent({
      prompt: "read the file",
      system: "You are running in /home/tinysquid/dev/agent-loop.",
      model,
      tools: [plusTool]
    });

    const transcript = scriptedTranscript(model, 0);
    expect(transcript).toHaveLength(2);
    expect(transcript[0]).toEqual({
      role: "system",
      content: "You are running in /home/tinysquid/dev/agent-loop."
    });
    expect(transcript[1]).toEqual({ role: "user", content: "read the file" });
  });

  it("carries the system turn forward on later rounds", async () => {
    const model = scriptedModel([
      {
        role: "assistant",
        content: null,
        toolCalls: [toolCall("plus", '{"a": 2, "b": 2}')]
      },
      { role: "assistant", content: "4" }
    ]);
    await runAgent({
      prompt: "what is 2+2?",
      system: "You run in /tmp.",
      model,
      tools: [plusTool]
    });

    const second = scriptedTranscript(model, 1);
    expect(second[0]).toEqual({ role: "system", content: "You run in /tmp." });
    expect(second).toHaveLength(4); // system, user, assistant(toolCall), tool
  });

  it("throws when the loop exceeds maxRounds", async () => {
    const model = scriptedModel(loopingScript(5));
    await expect(
      runAgent({
        prompt: "loop forever",
        model,
        tools: [plusTool],
        maxRounds: 2
      })
    ).rejects.toThrow("exceeded 2 rounds");
  });
});

function scriptedTranscript(
  model: ReturnType<typeof scriptedModel>,
  index: number
): ChatMessages[] {
  return model.seenTranscripts[index] ?? [];
}

interface StreamedRound {
  /** Deltas the model streams before the round completes. */
  deltas: string[];
  message: ChatAssistantMessage;
  usage?: ChatUsage;
}

/**
 * A streaming ChatModel: invokes the onChunk callback with each delta, then
 * resolves with the fully assembled reply, like the OpenRouter adapter does.
 */
function streamingModel(script: StreamedRound[]): ChatModel {
  const rounds = [...script];
  return {
    async complete(_turns, _tools, onChunk) {
      const round = rounds.shift();
      if (!round) throw new Error("script exhausted");
      for (const text of round.deltas) {
        onChunk?.({ content: text } satisfies ChatStreamDelta);
      }
      return {
        id: "test-stream",
        created: 0,
        model: "scripted",
        object: "chat.completion",
        systemFingerprint: null,
        usage: round.usage,
        choices: [{ index: 0, finishReason: "stop", message: round.message }]
      };
    }
  };
}

describe("runAgent streaming events", () => {
  it("emits round, delta, tool-call, and aggregated usage events", async () => {
    const events: AgentEvent[] = [];
    const answer = await runAgent({
      prompt: "what is 2+2?",
      model: streamingModel([
        {
          deltas: ["let me ", "check."],
          message: {
            role: "assistant",
            content: "let me check.",
            toolCalls: [toolCall("plus", '{"a": 2, "b": 2}')]
          },
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
        },
        {
          deltas: ["the ", "answer ", "is 4"],
          message: { role: "assistant", content: "the answer is 4" },
          usage: { promptTokens: 20, completionTokens: 7, totalTokens: 27 }
        }
      ]),
      tools: [plusTool],
      onEvent: (event) => events.push(event)
    });

    expect(answer).toBe("the answer is 4");
    expect(events).toEqual([
      { type: "round-start", round: 1 },
      { type: "assistant-text", text: "let me " },
      { type: "assistant-text", text: "check." },
      {
        type: "tool-call",
        round: 1,
        call: toolCall("plus", '{"a": 2, "b": 2}')
      },
      { type: "round-start", round: 2 },
      { type: "assistant-text", text: "the " },
      { type: "assistant-text", text: "answer " },
      { type: "assistant-text", text: "is 4" },
      {
        type: "usage",
        usage: { promptTokens: 30, completionTokens: 12, totalTokens: 42 }
      }
    ]);
  });

  it("emits no events when no onEvent is given", async () => {
    const answer = await runAgent({
      prompt: "hello",
      model: streamingModel([
        {
          deltas: ["hi"],
          message: { role: "assistant", content: "hi" }
        }
      ]),
      tools: [plusTool]
    });
    expect(answer).toBe("hi");
  });

  it("emits a zero-usage event when the model reports no usage", async () => {
    const events: AgentEvent[] = [];
    await runAgent({
      prompt: "hello",
      model: streamingModel([
        { deltas: ["hi"], message: { role: "assistant", content: "hi" } }
      ]),
      tools: [plusTool],
      onEvent: (event) => events.push(event)
    });
    expect(events.at(-1)).toEqual({
      type: "usage",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    });
  });
});

function loopingScript(n: number): ChatAssistantMessage[] {
  return Array.from({ length: n }, () => ({
    role: "assistant",
    content: null,
    toolCalls: [toolCall("plus", '{"a": 1, "b": 1}')]
  }));
}
