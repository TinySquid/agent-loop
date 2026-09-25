export interface AgentRun {
  model: string;
  prompt: string;
}

/**
 * Run the agent loop for one prompt: call the model, iterate tool calls
 * until a final answer. CLI dispatch calls this with a model and prompt payload.
 * TODO: design & implement
 */
export async function runAgent(_run: AgentRun): Promise<string> {
  void _run;
  throw new Error("the agent loop is not implemented yet");
}
