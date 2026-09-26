import { runAgent } from "./agent";
import { agentEventPrinter } from "./event-printer";
import { resolveApiKey } from "./credentials";
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

/**
 * Live activity goes to stderr (dim when attached to a terminal); stdout
 * stays reserved for the final answer, so pipes capture clean output.
 */
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
