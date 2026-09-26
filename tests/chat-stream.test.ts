import { describe, expect, it } from "vitest";
import type { ChatStreamChunk } from "@openrouter/sdk/models";
import { assembleChatStream } from "../src/chat-stream.js";

/**
 * Hand-built chunk: the independent source of truth is the OpenRouter
 * streaming wire format (chat.completion.chunk), fragmented the way real
 * providers fragment deltas.
 */
function chunk(
  parts: Partial<ChatStreamChunk> & { choices?: ChatStreamChunk["choices"] }
): ChatStreamChunk {
  return {
    id: "chunk-1",
    created: 0,
    model: "scripted",
    object: "chat.completion.chunk",
    choices: [],
    ...parts
  };
}

describe("assembleChatStream", () => {
  it("resembles a non-streaming ChatResult from fragmented text deltas", () => {
    const result = assembleChatStream([
      chunk({
        choices: [
          {
            index: 0,
            finishReason: null,
            delta: { role: "assistant", content: "Hel" }
          }
        ]
      }),
      chunk({
        choices: [{ index: 0, finishReason: null, delta: { content: "lo, " } }]
      }),
      chunk({
        choices: [
          { index: 0, finishReason: "stop", delta: { content: "world" } }
        ]
      })
    ]);

    expect(result.choices[0]?.message).toMatchObject({
      role: "assistant",
      content: "Hello, world"
    });
    expect(result.choices[0]?.finishReason).toBe("stop");
  });

  it("merges tool-call argument fragments by index", () => {
    const result = assembleChatStream([
      chunk({
        choices: [
          {
            index: 0,
            finishReason: null,
            delta: {
              toolCalls: [
                {
                  index: 0,
                  id: "call-1",
                  type: "function",
                  function: { name: "ReadFile", arguments: '{"fil' }
                },
                {
                  index: 1,
                  id: "call-2",
                  type: "function",
                  function: { name: "plus", arguments: '{"a": 1' }
                }
              ]
            }
          }
        ]
      }),
      chunk({
        choices: [
          {
            index: 0,
            finishReason: "tool_calls",
            delta: {
              toolCalls: [
                { index: 0, function: { arguments: 'e_path": "src/cli.ts"}' } },
                { index: 1, function: { arguments: ', "b": 2}' } }
              ]
            }
          }
        ]
      })
    ]);

    const [first, second] = result.choices[0]?.message.toolCalls ?? [];
    expect(first).toEqual({
      id: "call-1",
      type: "function",
      function: { name: "ReadFile", arguments: '{"file_path": "src/cli.ts"}' }
    });
    expect(second).toEqual({
      id: "call-2",
      type: "function",
      function: { name: "plus", arguments: '{"a": 1, "b": 2}' }
    });
  });

  it("carries usage from the final chunk", () => {
    const result = assembleChatStream([
      chunk({
        choices: [{ index: 0, finishReason: "stop", delta: { content: "hi" } }],
        usage: {
          promptTokens: 540,
          completionTokens: 210,
          totalTokens: 750
        }
      })
    ]);

    expect(result.usage).toMatchObject({
      promptTokens: 540,
      completionTokens: 210
    });
  });

  it("produces an empty assistant message from a usage-only final chunk", () => {
    // OpenRouter appends a trailing chunk carrying usage with no choices.
    const result = assembleChatStream([
      chunk({
        choices: [{ index: 0, finishReason: "stop", delta: { content: "hi" } }]
      }),
      chunk({
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      })
    ]);

    expect(result.choices[0]?.message).toMatchObject({
      role: "assistant",
      content: "hi"
    });
    expect(result.usage).toMatchObject({ promptTokens: 1 });
  });
});
