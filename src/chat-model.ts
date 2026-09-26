import type {
  ChatFunctionTool,
  ChatMessages,
  ChatResult,
  ChatStreamDelta
} from "@openrouter/sdk/models";

/** Receives each streaming delta as it arrives, in wire order. */
export type ChatChunkHandler = (delta: ChatStreamDelta) => void;

export interface ChatModel {
  complete(
    turns: readonly ChatMessages[],
    /** Wire specs for the tools the model may call. */
    wireTools: readonly ChatFunctionTool[],
    /** Omit for the simplest one-shot call; when given, the model streams. */
    onChunk?: ChatChunkHandler
  ): Promise<ChatResult>;
}
