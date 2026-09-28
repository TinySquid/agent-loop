import { spawn } from "node:child_process";
import {
  TRUNCATION_CAPS,
  boundedOutput,
  coercePositiveInt,
  type TruncationCaps
} from "./truncate";
import type { Tool } from "./tool";

/** Ceilings for the Bash tool's per-call `timeout_ms` parameter. */
export const BASH_TIMEOUT_DEFAULT_MS = 60_000;
export const BASH_TIMEOUT_CAP_MS = 120_000;

/** Time between SIGTERM and SIGKILL when a timed-out command won't die. */
const SIGKILL_GRACE_MS = 1_000;

/** The Bash tool's timeout knobs, kept separate for deriveTimeout callers. */
export interface BashTimeoutOptions {
  /** Default when the model passes no/invalid `timeout_ms`. */
  defaultMs: number;
  /** Hard ceiling, clamped regardless of what the model requests. */
  capMs: number;
  /** Window between SIGTERM and SIGKILL after a timeout. */
  sigkillGraceMs: number;
}

/**
 * Tunable knobs for the Bash tool: the shared truncation caps plus the
 * timeout knobs. Options exist so tests can scale the timings and output
 * sizes down to milliseconds and bytes; production always uses the defaults.
 */
export interface BashToolOptions extends TruncationCaps, BashTimeoutOptions {}

export const DEFAULT_BASH_TIMEOUT_OPTIONS: BashTimeoutOptions = {
  defaultMs: BASH_TIMEOUT_DEFAULT_MS,
  capMs: BASH_TIMEOUT_CAP_MS,
  sigkillGraceMs: SIGKILL_GRACE_MS
};

export const DEFAULT_BASH_OPTIONS: BashToolOptions = {
  ...DEFAULT_BASH_TIMEOUT_OPTIONS,
  ...TRUNCATION_CAPS
};

/** Clamp/normalize the model-provided timeout against the active options. */
export function deriveTimeout(
  value: unknown,
  options: BashTimeoutOptions
): number {
  const requestedMs = coercePositiveInt(value);
  if (requestedMs === null) return options.defaultMs;
  return Math.min(requestedMs, options.capMs);
}

/**
 * The Bash tool factory. The schema description is built from the active
 * options so the model always sees the ceiling it is actually held to.
 * Output is funneled through the bounded-output seam, so a runaway command
 * is truncated with a continuation notice like every other tool.
 */
export function createBashTool(options: Partial<BashToolOptions> = {}): Tool {
  const settings = { ...DEFAULT_BASH_OPTIONS, ...options };

  const bound = (raw: string): string =>
    boundedOutput(raw, {
      maxLines: settings.maxLines,
      maxBytes: settings.maxBytes,
      maxLineChars: settings.maxLineChars
      // no resumeHint: a finished command's output is not pageable
    }).text;

  return {
    spec: {
      type: "function",
      function: {
        name: "Bash",
        description:
          "Execute a shell command in the agent's process cwd (stated in the " +
          `system prompt). Output is truncated to ${settings.maxLines} lines or ` +
          `${Math.round(settings.maxBytes / 1024)}KB (whichever is hit first); ` +
          "long lines are cut to " +
          `${settings.maxLineChars} chars.`,
        parameters: {
          type: "object",
          required: ["command"],
          properties: {
            command: {
              type: "string",
              description: "The command to execute"
            },
            timeout_ms: {
              type: "integer",
              description: `Optional maximum runtime in milliseconds (default ${settings.defaultMs}, capped at ${settings.capMs}). On timeout the process is killed and partial output is returned with exit code 124.`
            }
          }
        }
      }
    },
    async execute(args) {
      const timeoutMs = deriveTimeout(args.timeout_ms, settings);

      // Own process group so a timeout can kill the whole tree:
      // `bash -c "sleep 300"` forks `sleep`; killing bash alone leaves the
      // orphan holding the stdout pipe, so the close event never fires.
      const child = spawn("bash", ["-c", String(args.command)], {
        stdio: ["ignore", "pipe", "pipe"],
        detached: true
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf-8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf-8");
      });

      return new Promise<string>((resolve) => {
        // close and timeout race each other; settle exactly once.
        let settled = false;
        let sigkillTimer: NodeJS.Timeout | undefined;

        const killTree = (signal: NodeJS.Signals) => {
          // Negative pid targets the child's process group (it is the group
          // leader, thanks to detached).
          if (child.pid === undefined) return;

          try {
            process.kill(-child.pid, signal);
          } catch {
            // pids are recycled; the group may already be gone.
          }
        };

        const finish = (value: string) => {
          if (settled) return;

          settled = true;
          clearTimeout(timeoutTimer);

          if (sigkillTimer) clearTimeout(sigkillTimer);

          resolve(value);
        };

        const timeoutTimer = setTimeout(() => {
          killTree("SIGTERM");

          sigkillTimer = setTimeout(
            () => killTree("SIGKILL"),
            settings.sigkillGraceMs
          );
        }, timeoutMs);

        child.on("error", (err) => {
          finish(bound(`ERROR (spawn failed): ${err.message}`));
        });

        child.on("close", (code, signal) => {
          if (signal) {
            finish(
              bound(
                `ERROR (Exit Code 124, command timed out after ${timeoutMs}ms and was killed by ${signal}):\n${stdout}\n${stderr}`.trim()
              )
            );

            return;
          }

          const exitCode = code ?? 1;

          const body =
            exitCode === 0
              ? stdout
              : `ERROR (Exit Code ${exitCode}):\n${stdout}\n${stderr}`.trim();

          finish(bound(body));
        });
      });
    }
  };
}
