import { runAgent } from "./agent";
import { resolveApiKey } from "./credentials";
import {
  createModelCatalog,
  freeModelSlugs,
  paidModelSlugs,
  type CatalogModel,
  type ModelCatalog
} from "./model-catalog";
import { openRouterModel } from "./openrouter-model";
import { HelpRequest, parseArgv, usageText, UsageError } from "./parse-args";
import { readFile } from "./tools";

async function loadCatalog(
  catalog: ModelCatalog,
  refresh: boolean
): Promise<CatalogModel[]> {
  if (refresh) {
    return catalog.refresh();
  }
  const models = await catalog.read();
  if (!models) {
    throw new Error(
      `no cached model catalog found at '${catalog.filepath}' — run with --refresh to fetch one`
    );
  }
  return models;
}

function printSlugs(models: readonly CatalogModel[], free: boolean): void {
  const slugs = free ? freeModelSlugs(models) : paidModelSlugs(models);
  for (const slug of slugs) {
    console.log(slug);
  }
}

async function dispatch(): Promise<void> {
  const command = parseArgv(process.argv.slice(2));
  const catalog = createModelCatalog();

  switch (command.type) {
    case "run-agent": {
      const credentials = resolveApiKey();
      const answer = await runAgent({
        prompt: command.prompt,
        model: openRouterModel(credentials, command.model),
        tools: [readFile]
      });
      console.log(answer);
      return;
    }
    case "list-free-models":
      printSlugs(await loadCatalog(catalog, command.refresh), true);
      return;
    case "list-models":
      printSlugs(await loadCatalog(catalog, command.refresh), false);
      return;
    case "refresh-catalog":
      await catalog.refresh();
      console.log("Model catalog refreshed.");
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
    console.error(
      error instanceof Error ? error.message : `unknown error: ${String(error)}`
    );
    process.exitCode = 1;
  }
}
