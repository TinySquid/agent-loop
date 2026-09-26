import type { ChatToolMessage } from "@openrouter/sdk/models";
import { describe, expect, it } from "vitest";
import { executeToolCalls } from "../src/tool-execution.js";
import type { Tool } from "../src/tools/index.js";

function echoTool(output: string): Tool {
  return {
    spec: {
      type: "function",
      function: {
        name: "Echo",
        description: "echo fixture",
        parameters: { type: "object", properties: {} }
      }
    },
    async execute() {
      return output;
    }
  };
}

function toolCall(
  name = "Echo"
): Parameters<typeof executeToolCalls>[1][number] {
  return {
    id: "call_1",
    type: "function",
    function: { name, arguments: "{}" }
  };
}

describe("executeToolCalls", () => {
  it("returns the tool output as the message content", async () => {
    const messages: ChatToolMessage[] = await executeToolCalls(
      [echoTool("R  src/tools.ts")],
      [toolCall()]
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe("R  src/tools.ts");
  });

  it("never emits empty tool-result content (Cohere rejects it with a 400)", async () => {
    const messages: ChatToolMessage[] = await executeToolCalls(
      [echoTool("")],
      [toolCall()]
    );
    expect(messages[0]?.content).not.toBe("");
    expect(String(messages[0]?.content).trim().length).toBeGreaterThan(0);
  });

  it("never emits whitespace-only tool-result content", async () => {
    const messages: ChatToolMessage[] = await executeToolCalls(
      [echoTool("   \n\t")],
      [toolCall()]
    );
    expect(String(messages[0]?.content).trim().length).toBeGreaterThan(0);
  });
});
