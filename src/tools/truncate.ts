/**
 * Bounded output for tools: the deepened truncation seam. A caller hands in
 * raw text and its caps; the module returns the kept lines plus the
 * continuation notice already built (or empty when nothing was cut), so no
 * tool ever hand-strings a notice again. Adding a new bounding tool needs
 * zero new truncation code.
 */
export const DEFAULT_MAX_LINES = 2000;
export const DEFAULT_MAX_BYTES = 50 * 1024;
export const DEFAULT_MAX_LINE_CHARS = 2000;

/**
 * The truncation caps: the triple every bounding tool carries (lines, bytes,
 * per-line chars). A type born from a data clump, not from speculation: three
 * fields, always together, never a fourth.
 */
export interface TruncationCaps {
  /** Hard line ceiling for returned output. */
  maxLines: number;
  /** Hard byte ceiling for returned output. */
  maxBytes: number;
  /** Characters kept per line before inline truncation (long-line guard). */
  maxLineChars: number;
}

/** The production values of the caps; tool option sets spread this. */
export const TRUNCATION_CAPS: TruncationCaps = {
  maxLines: DEFAULT_MAX_LINES,
  maxBytes: DEFAULT_MAX_BYTES,
  maxLineChars: DEFAULT_MAX_LINE_CHARS
};

/**
 * The one malformed-shape rule every numeric tool argument shares: a
 * well-formed positive number is floored and kept, anything else is null and
 * the caller supplies its axis-specific fallback (a default, a cap, an
 * error). One implementation instead of three near-clones.
 */
export function coercePositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.floor(value);
}

/** Notices are module-owned; a runaway resume hint is dropped past this. */
const MAX_NOTICE_CHARS = 200;

export interface BoundOptions extends TruncationCaps {
  /** 1-indexed display line of the window's first line (paging tools). */
  startLine?: number;
  /** Line total of the full content the window came from (paging tools). */
  totalLines?: number;
  /**
   * How the model gets what was cut, given the first line not shown. Omit
   * for output the model cannot page (e.g. a finished command's stdout).
   */
  resumeHint?: (nextLine: number) => string;
}

export type TruncationCause = "lines" | "bytes" | null;

export interface BoundResult {
  /** Kept lines, already per-line truncated. */
  lines: string[];
  /** Kept lines joined; the continuation notice appended when truncated. */
  text: string;
  /** Total lines in the input window, before truncation. */
  totalLines: number;
  truncated: boolean;
  truncatedBy: TruncationCause;
  /** The built continuation notice; empty string when nothing was cut. */
  notice: string;
}

/**
 * Bound raw text to the active caps: keep the first N lines subject to a
 * byte cap, cutting each oversized line to `maxLineChars` first. A trailing
 * newline does not count as an extra line. When content is cut, the result
 * carries the continuation notice telling the model exactly what it saw and
 * how to get more - the caller only places it.
 */
export function boundedOutput(
  content: string,
  options: BoundOptions
): BoundResult {
  const normalized =
    content.endsWith("\n") && content.length > 0
      ? content.slice(0, -1)
      : content;
  const lines = normalized.length === 0 ? [] : normalized.split("\n");
  const totalLines = lines.length;

  const capped = lines.map((line) =>
    line.length > options.maxLineChars
      ? `${line.slice(0, options.maxLineChars)}\u2026 (line truncated to ${options.maxLineChars} chars)`
      : line
  );

  const kept: string[] = [];
  let bytes = 0;
  let truncatedBy: TruncationCause = null;
  for (const line of capped) {
    if (kept.length >= options.maxLines) {
      truncatedBy = "lines";
      break;
    }
    // +1 for the newline separating this line from the previous kept one.
    const size = Buffer.byteLength(line, "utf-8") + (kept.length > 0 ? 1 : 0);
    if (bytes + size > options.maxBytes) {
      truncatedBy = "bytes";
      if (kept.length > 0) break;
      // The first line alone exceeds the byte cap: keep it anyway (its size
      // is bounded by maxLineChars) so bounded output is never empty.
      kept.push(line);
      break;
    }
    kept.push(line);
    bytes += size;
  }

  const notice =
    truncatedBy === null
      ? ""
      : buildNotice(kept.length, totalLines, truncatedBy, options);

  const body = kept.join("\n");
  return {
    lines: kept,
    text: notice === "" ? body : `${body}\n\n${notice}`,
    totalLines,
    truncated: truncatedBy !== null,
    truncatedBy,
    notice
  };
}

/**
 * The continuation notice: what the model saw and how to get more. The
 * module owns the format and the budget, so notices stay short and
 * consistent no matter which tool produced them.
 */
function buildNotice(
  keptCount: number,
  totalLines: number,
  truncatedBy: TruncationCause,
  options: BoundOptions
): string {
  const start = options.startLine ?? 1;
  const end = start + keptCount - 1;
  const total = options.totalLines ?? totalLines;
  const base = `[Showing lines ${start}-${end} of ${total} (${truncatedBy} limit).]`;
  if (!options.resumeHint) return base;
  const tail = options.resumeHint(end + 1);
  if (base.length + 1 + tail.length > MAX_NOTICE_CHARS) return base;
  return `${base.slice(0, -1)} ${tail}]`;
}
