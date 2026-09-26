import type {
  ChatFunctionTool,
  ChatMessages,
  ChatResult
} from "@openrouter/sdk/models";

export interface ChatModel {
  complete(
    turns: readonly ChatMessages[],
    toolSpecs: readonly ChatFunctionTool[]
  ): Promise<ChatResult>;
}
