import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agent.js";
import type { ChatModel } from "../src/chat-model.js";
import type { Tool } from "../src/tools.js";
import type {
  ChatAssistantMessage,
  ChatMessages,
  ChatToolCall
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

function loopingScript(n: number): ChatAssistantMessage[] {
  return Array.from({ length: n }, () => ({
    role: "assistant",
    content: null,
    toolCalls: [toolCall("plus", '{"a": 1, "b": 1}')]
  }));
}
