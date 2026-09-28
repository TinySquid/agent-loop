import * as fs from "node:fs";
import {
  TRUNCATION_CAPS,
  boundedOutput,
  coercePositiveInt,
  type TruncationCaps
} from "./truncate";
import type { Tool } from "./tool";

/** The read tool's construction-time knobs: shared caps, injected for tests. */
export type ReadOptions = TruncationCaps;

export const DEFAULT_READ_OPTIONS: ReadOptions = TRUNCATION_CAPS;

/**
 * The read tool factory. Output is bounded at maxLines/maxBytes (whichever
 * first) and trimmed per line; the schema description tells the model the
 * active limits so it can page with offset/limit instead of guessing.
 */
export function createReadTool(
  options: ReadOptions = DEFAULT_READ_OPTIONS
): Tool {
  return {
    spec: {
      type: "function",
      function: {
        name: "read",
        description:
          "Read the contents of a file. For text files, output is " +
          `truncated to ${options.maxLines} lines or ` +
          `${Math.round(options.maxBytes / 1024)}KB (whichever is hit first); ` +
          "long lines are cut to " +
          `${options.maxLineChars} chars. Use offset/limit for large files; ` +
          "when you need the full file, continue with offset until complete.",
        parameters: {
          type: "object",
          required: ["file_path"],
          properties: {
            file_path: {
              type: "string",
              description: "The path to the file to read"
            },
            offset: {
              type: "integer",
              description:
                "Line number to start reading from (1-indexed, default 1)"
            },
            limit: {
              type: "integer",
              description: `Maximum number of lines to read (default/max ${options.maxLines})`
            }
          }
        }
      }
    },
    async execute(args) {
      const filePath = String(args.file_path);
      const raw = await fs.promises.readFile(filePath, "utf-8");

      // A trailing newline terminates the last line, it is not a line of its
      // own. Strip one so line counts match what an editor shows.
      const trimmed = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
      const allLines = trimmed.split("\n");

      // 1-indexed model input -> 0-indexed slice bounds.
      const start = clampOffset(args.offset, allLines);
      // The caller's limit and the tool's own line ceiling both cap the read;
      // a single bounded path decides truncation and the continuation notice.
      const limit = clampLimit(args.limit, options.maxLines);
      const result = boundedOutput(allLines.slice(start).join("\n"), {
        maxLines: limit,
        maxBytes: options.maxBytes,
        maxLineChars: options.maxLineChars,
        startLine: start + 1,
        totalLines: allLines.length,
        resumeHint: (next) => `Use offset=${next} to continue.`
      });

      const numberStart = start + 1; // display numbering is 1-indexed

      const numbered = result.lines.map(
        (line, i) => `${numberStart + i}: ${line}`
      );

      return result.notice === ""
        ? numbered.join("\n")
        : `${numbered.join("\n")}\n\n${result.notice}`;
    }
  };
}

/** Clamp the model's 1-indexed offset into a valid 0-indexed line index. */
function clampOffset(value: unknown, allLines: readonly string[]): number {
  // Offset's floor is 1 (head of file), so <= 1 clamps to the head rather
  // than falling back to a default the way limit and timeout do.
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 1) {
    return 0;
  }
  const start = Math.floor(value) - 1;
  if (start >= allLines.length) {
    throw new Error(
      `offset ${value} is beyond end of file (${allLines.length} lines total)`
    );
  }
  return start;
}

/** Clamp the model's limit to a sane positive integer. */
function clampLimit(value: unknown, maxLines: number): number {
  const requested = coercePositiveInt(value);
  if (requested === null) return maxLines;
  return Math.min(requested, maxLines);
}
