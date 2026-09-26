import { Command as CommanderCommand, CommanderError, Option } from "commander";
import pkg from "../package.json" with { type: "json" };

/** Thrown when argv is not a valid invocation. The CLI prints usage for it. */
export class UsageError extends Error {}

/**
 * Thrown when the user explicitly asked for help or the version. Carries the
 * text to print on stdout, with a zero exit code.
 */
export class HelpRequest extends Error {
  readonly helpText: string;

  constructor(helpText: string) {
    super(helpText);
    this.helpText = helpText;
  }
}

export type CliCommand =
  | {
      type: "run-agent";
      model: string;
      prompt: string;
      /** When true, suppress the live activity stream on stderr. */
      quiet: boolean;
    }
  | { type: "list-models" }
  | { type: "list-free-models" };

interface ProgramOptions {
  prompt?: string;
  model?: string;
  quiet?: boolean;
  listFreeModels?: boolean;
  listModels?: boolean;
}

function buildProgram(): CommanderCommand {
  const program = new CommanderCommand();
  program
    .name("agent")
    .description("One-shot terminal agent loop powered by OpenRouter")
    .version(pkg.version)
    .exitOverride()
    // All output is owned by the CLI entry point, which decides the stream
    // and exit code for help, version, and usage errors.
    .configureOutput({ writeOut: () => {}, writeErr: () => {} });

  const prompt = new Option(
    "-p, --prompt <prompt>",
    "prompt to run the agent with"
  ).conflicts(["listFreeModels", "listModels"]);

  const model = new Option(
    "-m, --model <slug>",
    "model slug to run the agent with"
  ).conflicts(["listFreeModels", "listModels"]);

  const quiet = new Option(
    "--quiet",
    "suppress the live activity stream; print only the final answer"
  );

  const listFreeModels = new Option(
    "--list-free-models",
    "print free model slugs from the OpenRouter API"
  ).conflicts(["prompt", "model", "listModels"]);

  const listModels = new Option(
    "--list-models",
    "print non-free model slugs from the OpenRouter API"
  ).conflicts(["prompt", "model", "listFreeModels"]);

  program.addOption(prompt);
  program.addOption(model);
  program.addOption(quiet);
  program.addOption(listFreeModels);
  program.addOption(listModels);

  return program;
}

/** The usage text printed for `-h` and for usage errors. */
export function usageText(): string {
  return buildProgram().helpInformation();
}

/**
 * Parse raw argv into a CliCommand. All invocation rules (required model,
 * flag combinations, help/version) are enforced here, declaratively via
 * Commander conflict declarations plus the prompt-specific rule below.
 */
export function parseArgv(argv: readonly string[]): CliCommand {
  const program = buildProgram();

  try {
    program.parse([...argv], { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "commander.helpDisplayed") {
        throw new HelpRequest(program.helpInformation());
      }
      if (error.code === "commander.version") {
        throw new HelpRequest(`${pkg.version}\n`);
      }
      throw new UsageError(error.message);
    }
    throw error;
  }

  const opts = program.opts<ProgramOptions>();

  if (opts.prompt) {
    if (!opts.model) {
      throw new UsageError(
        "error: -m, --model <slug> is required when running the agent with -p, --prompt <prompt>"
      );
    }
    return {
      type: "run-agent",
      model: opts.model,
      prompt: opts.prompt,
      quiet: opts.quiet ?? false
    };
  }
  if (opts.listFreeModels) {
    return { type: "list-free-models" };
  }
  if (opts.listModels) {
    return { type: "list-models" };
  }
  throw new UsageError(
    "error: nothing to do — pass -p/--prompt with -m/--model, or a --list flag"
  );
}
