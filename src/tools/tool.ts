import type {
  ChatFunctionTool,
  ChatFunctionToolFunction
} from "@openrouter/sdk/models";

/**
 * The wire-safe model half of a tool: the OpenRouter function-tool shape
 * sent to the model, tooled by a factory from its schema. Nothing on this
 * half is executable; keeping it separate from the implementation half is
 * what lets runAgent put tools on the wire without inspecting them.
 */
export type ToolSpec = ChatFunctionToolFunction;

/**
 * The contract every tool satisfies. The model half (`spec`) and the
 * implementation half (`execute`) live on one object but cross separate
 * seams: `toolSpecs` projects the model half onto the wire (stripping
 * `execute` so the implementation half never reaches it), and
 * `executeToolCalls` invokes the implementation half.
 */
export interface Tool {
  /** The model half: exactly what belongs on the wire. */
  spec: ToolSpec;
  /** The execution half: what the agent runs. */
  execute(args: Record<string, unknown>): Promise<string>;
}

/**
 * The projection between the halves: model half -> wire shape, in one
 * place. Whoever adds a schema field (strict schemas, annotations,
 * streaming tool-call args) updates the SDK type here only.
 */
export function toolSpecs(tools: readonly Tool[]): readonly ChatFunctionTool[] {
  return tools.map((tool) => tool.spec);
}
