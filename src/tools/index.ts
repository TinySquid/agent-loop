/**
 * The tools package: the shared Tool contract plus one module per tool.
 * Callers who just want a working agent take `defaultTools`; individual
 * factories and their options are exported for tests and custom toolsets.
 */
import { createBashTool } from "./bash";
import { createReadTool } from "./read";
import type { Tool } from "./tool";

export type { Tool, ToolSpec } from "./tool";
export { toolSpecs } from "./tool";
export {
  BASH_TIMEOUT_CAP_MS,
  BASH_TIMEOUT_DEFAULT_MS,
  DEFAULT_BASH_OPTIONS,
  DEFAULT_BASH_TIMEOUT_OPTIONS,
  createBashTool,
  deriveTimeout,
  type BashTimeoutOptions,
  type BashToolOptions
} from "./bash";
export { DEFAULT_READ_OPTIONS, createReadTool, type ReadOptions } from "./read";
export {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_LINE_CHARS,
  TRUNCATION_CAPS,
  boundedOutput,
  coercePositiveInt,
  type BoundOptions,
  type BoundResult,
  type TruncationCaps
} from "./truncate";

/** The production toolset, assembled with default options. */
export const defaultTools: readonly Tool[] = [
  createReadTool(),
  createBashTool()
];
