import { runAgent, type AgentEvent } from "./agent";
import { resolveApiKey } from "./credentials";
import type { ChatToolCall } from "@openrouter/sdk/models";
import {
  fetchModels,
  freeModelSlugs,
  paidModelSlugs,
  type ModelInfo
} from "./model-list";
import { openRouterModel } from "./openrouter-model";
import { formatProviderError } from "./provider-error";
import { HelpRequest, parseArgv, usageText, UsageError } from "./parse-args";
import { systemPrompt } from "./system-prompt";
import { defaultTools } from "./tools";

function printSlugs(models: readonly ModelInfo[], free: boolean): void {
  const slugs = free ? freeModelSlugs(models) : paidModelSlugs(models);
  for (const slug of slugs) {
    console.log(slug);
  }
}

function dim(text: string): string {
  return process.stderr.isTTY ? `\x1b[2m${text}\x1b[0m` : text;
}

function truncate(text: string, max = 60): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function argsPreview(call: ChatToolCall): string {
  const raw = call.function.arguments;
  try {
    const args = JSON.parse(raw) as Record<string, unknown>;
    const rendered = Object.entries(args)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(", ");
    return truncate(rendered);
  } catch {
    return truncate(raw);
  }
}

/**
 * Live activity goes to stderr (dim when attached to a terminal); stdout
 * stays reserved for the final answer, so pipes capture clean output.
 */
function agentEventPrinter(): (event: AgentEvent) => void {
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

async function dispatch(): Promise<void> {
  const command = parseArgv(process.argv.slice(2));

  switch (command.type) {
    case "run-agent": {
      const credentials = resolveApiKey();
      const answer = await runAgent({
        // TODO: decide if the agent should try and find a SYSTEM.md / AGENTS.md to use instead for this.
        system: systemPrompt(),
        prompt: command.prompt,
        model: openRouterModel(credentials, command.model),
        tools: defaultTools,
        onEvent: command.quiet ? undefined : agentEventPrinter()
      });
      console.log(answer);
      return;
    }
    case "list-free-models":
      printSlugs(await fetchModels(), true);
      return;
    case "list-models":
      printSlugs(await fetchModels(), false);
      return;
  }
}

try {
  await dispatch();
} catch (error) {
  if (error instanceof HelpRequest) {
    console.log(error.helpText);
    process.exitCode = 0;
  } else if (error instanceof UsageError) {
    console.error(`${error.message}\n\n${usageText()}`);
    process.exitCode = 1;
  } else {
    const provider = formatProviderError(error);
    console.error(
      provider ??
        (error instanceof Error
          ? error.message
          : `unknown error: ${String(error)}`)
    );
    process.exitCode = 1;
  }
}
