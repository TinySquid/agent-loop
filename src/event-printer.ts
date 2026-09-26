import type { AgentEvent } from "./agent";
import type { ChatToolCall } from "@openrouter/sdk/models";

function dim(text: string): string {
  return process.stderr.isTTY ? `\x1b[2m${text}\x1b[0m` : text;
}

function truncatePreview(text: string, max = 60): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function argsPreview(call: ChatToolCall): string {
  const raw = call.function.arguments;
  try {
    const args = JSON.parse(raw) as Record<string, unknown>;
    const rendered = Object.entries(args)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(", ");
    return truncatePreview(rendered);
  } catch {
    return truncatePreview(raw);
  }
}

/**
 * Live activity goes to stderr (dim when attached to a terminal); stdout
 * stays reserved for the final answer, so pipes capture clean output.
 */
export function agentEventPrinter(): (event: AgentEvent) => void {
  let midText = false; // assistant text streamed without a trailing newline

  return (event: AgentEvent) => {
    switch (event.type) {
      case "assistant-text":
        process.stderr.write(dim(event.text));
        midText = true;
        return;
      case "tool-call": {
        if (midText) {
          process.stderr.write("\n");
          midText = false;
        }
        const args = argsPreview(event.call);
        process.stderr.write(
          `${dim(`› round ${event.round} · ${event.call.function.name}(${args})`)}\n`
        );
        return;
      }
      case "usage":
        if (midText) {
          process.stderr.write("\n");
          midText = false;
        }
        process.stderr.write(
          dim(
            `tokens: in ${event.usage.promptTokens} · out ${event.usage.completionTokens}\n`
          )
        );
        return;
      case "round-start":
        return;
    }
  };
}
