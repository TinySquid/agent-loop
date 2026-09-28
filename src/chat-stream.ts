import type {
  ChatResult,
  ChatStreamChunk,
  ChatToolCall
} from "@openrouter/sdk/models";

/**
 * Reassemble a streamed completion into the same ChatResult shape the
 * non-streaming API returns: content deltas concatenate, tool-call argument
 * fragments merge by index, and usage comes from the final chunk.
 */
export function assembleChatStream(
  chunks: readonly ChatStreamChunk[]
): ChatResult {
  const content: string[] = [];
  const toolCalls = new Map<number, ChatToolCall>();
  let finishReason: ChatResult["choices"][number]["finishReason"] = null;
  let usage: ChatResult["usage"];

  for (const chunkData of chunks) {
    if (chunkData.usage) usage = chunkData.usage;
    for (const choice of chunkData.choices) {
      const delta = choice.delta;

      if (delta.content) content.push(delta.content);

      for (const fragment of delta.toolCalls ?? []) {
        const merged = toolCalls.get(fragment.index) ?? {
          id: "",
          type: "function",
          function: { name: "", arguments: "" }
        };
        if (fragment.id) merged.id = fragment.id;
        if (fragment.function?.name)
          merged.function.name = fragment.function.name;
        if (fragment.function?.arguments)
          merged.function.arguments += fragment.function.arguments;

        toolCalls.set(fragment.index, merged);
      }

      if (choice.finishReason) finishReason = choice.finishReason;
    }
  }

  const text = content.join("");
  const calls = [...toolCalls.keys()]
    .sort((a, b) => a - b)
    .map((i) => toolCalls.get(i)!);
  const last = chunks[chunks.length - 1];

  return {
    id: last?.id ?? "",
    created: last?.created ?? 0,
    model: last?.model ?? "",
    object: "chat.completion",
    systemFingerprint: null,
    usage,
    choices: [
      {
        index: 0,
        finishReason,
        message: {
          role: "assistant",
          content: text === "" && calls.length > 0 ? null : text,
          ...(calls.length > 0 ? { toolCalls: calls } : {})
        }
      }
    ]
  };
}
