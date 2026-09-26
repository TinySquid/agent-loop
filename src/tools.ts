import type { ChatFunctionToolFunction } from "@openrouter/sdk/models";
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
