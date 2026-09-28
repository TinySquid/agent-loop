import { OpenRouterCore } from "@openrouter/sdk/core";
import { chatSend } from "@openrouter/sdk/funcs/chatSend.js";
import { EventStream } from "@openrouter/sdk/lib/event-streams.js";
import { unwrapAsync } from "@openrouter/sdk/types/fp.js";
import type {
  ChatFunctionTool,
  ChatMessages,
  ChatResult,
  ChatStreamChunk
} from "@openrouter/sdk/models";
import { assembleChatStream } from "./chat-stream";
import type { ChatChunkHandler, ChatModel } from "./chat-model";
import type { Credentials } from "./credentials";

/**
 * The agent's production ChatModel adapter, backed by the OpenRouter SDK's
 * standalone function API. OpenRouterCore is a thin config holder, passed
 * into chatSend rather than called on. Every completion is streamed: deltas
 * go to onChunk (when given) and the full reply is reassembled into a
 * ChatResult so the loop's seam never changes shape.
 */
export function openRouterModel(
  credentials: Credentials,
  slug: string
): ChatModel {
  // One instance is meant to be reused across calls (per FUNCTIONS.md).
  const core = new OpenRouterCore({ apiKey: credentials.apiKey });

  return {
    async complete(
      turns: readonly ChatMessages[],
      wireTools: readonly ChatFunctionTool[],
      onChunk?: ChatChunkHandler
    ): Promise<ChatResult> {
      const reply = await unwrapAsync(
        chatSend(core, {
          chatRequest: {
            model: slug,
            messages: [...turns],
            tools: [...wireTools],
            stream: true
          }
        })
      );

      // The SDK types the reply as ChatResult | EventStream<ChatStreamChunk>
      // without narrowing on the stream flag; stream: true always yields the
      // stream variant, so anything else is a broken reply.
      if (!(reply instanceof EventStream)) {
        throw new Error(
          "openRouterModel received a non-streaming response despite stream: true"
        );
      }

      const chunks: ChatStreamChunk[] = [];
      for await (const chunk of reply) {
        if (chunk.error) {
          throw new Error(chunk.error.message);
        }

        chunks.push(chunk);

        onChunk?.(chunk.choices[0]?.delta ?? {});
      }

      return assembleChatStream(chunks);
    }
  };
}
