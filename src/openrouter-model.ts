import { OpenRouterCore } from "@openrouter/sdk/core";
import { chatSend } from "@openrouter/sdk/funcs/chatSend.js";
import { EventStream } from "@openrouter/sdk/lib/event-streams.js";
import { unwrapAsync } from "@openrouter/sdk/types/fp.js";
import type {
  ChatFunctionTool,
  ChatMessages,
  ChatResult
} from "@openrouter/sdk/models";
import type { ChatModel } from "./chat-model";
import type { Credentials } from "./credentials";

/**
 * The agent's production ChatModel adapter, backed by the OpenRouter SDK's
 * standalone function API. OpenRouterCore is a thin config holder, passed
 * into chatSend rather than called on.
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
      tools: readonly ChatFunctionTool[]
    ): Promise<ChatResult> {
      const reply = await unwrapAsync(
        chatSend(core, {
          chatRequest: {
            model: slug,
            messages: [...turns],
            tools: [...tools],
            stream: false
          }
        })
      );

      // The SDK types the reply as ChatResult | EventStream<ChatStreamChunk>
      // without narrowing on the stream flag; exclude the stream variant.
      if (reply instanceof EventStream) {
        throw new Error(
          "openRouterModel received a streaming response despite stream: false"
        );
      }
      return reply;
    }
  };
}
