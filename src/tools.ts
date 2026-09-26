import type { ChatFunctionToolFunction } from "@openrouter/sdk/models";
import { execSync, type ExecException } from "node:child_process";
import * as fs from "node:fs";

/** Tool contracts (schema + implementations) */
export interface Tool extends ChatFunctionToolFunction {
  execute(args: Record<string, unknown>): Promise<string>;
}

export const readFile: Tool = {
  type: "function",
  function: {
    name: "ReadFile",
    description: "Read the contents of a file",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "The path to the file to read"
        }
      },
      required: ["file_path"]
    }
  },
  async execute(args) {
    return fs.readFileSync(String(args.file_path), "utf-8");
  }
};

export const executeBashCommand: Tool = {
  type: "function",
  function: {
    name: "Bash",
    description: `Execute a shell command in the current working directory (${process.cwd()})`,
    parameters: {
      type: "object",
      required: ["command"],
      properties: {
        command: {
          type: "string",
          description: "The command to execute"
        }
      }
    }
  },
  async execute(args) {
    let stdout: string;
    let stderr: string;

    try {
      return execSync(String(args.command), {
        encoding: "utf-8"
      });
    } catch (error) {
      const err = error as ExecException;

      stdout = String(err.stdout ?? "");
      stderr = String(err.stderr ?? "");

      return `ERROR (Exit Code ${err.code ?? 1}):\n${stdout}\n${stderr}`.trim();
    }
  }
};
