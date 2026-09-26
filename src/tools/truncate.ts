/**
 * Pure head-truncation for tool outputs. Whichever limit is hit first wins;
 * never returns partial lines. The read (and future grep/list) tools call
 * this with their active options, so every tool bounds its own output
 * instead of trusting model discretion.
 */
export const DEFAULT_MAX_LINES = 2000;
export const DEFAULT_MAX_BYTES = 50 * 1024;
export const DEFAULT_MAX_LINE_CHARS = 2000;

export interface TruncateOptions {
  /** Hard line ceiling for the kept window. */
  maxLines: number;
  /** Hard byte ceiling for the kept window. */
  maxBytes: number;
  /** Characters kept per line before inline truncation (long-line guard). */
  maxLineChars: number;
}

export type TruncationCause = "lines" | "bytes" | null;

export interface TruncationResult {
  /** Kept lines, already per-line truncated. */
  lines: string[];
  /** Total lines in the input window, before truncation. */
  totalLines: number;
  truncated: boolean;
  truncatedBy: TruncationCause;
}

/**
 * Truncate content from the head: keep the first N lines subject to a byte
 * cap, cutting each oversized line to `maxLineChars` first. A trailing
 * newline does not count as an extra line.
 */
export function truncateHead(
  content: string,
  options: TruncateOptions
): TruncationResult {
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
      // is bounded by maxLineChars) so a bounded read is never empty.
      kept.push(line);
      break;
    }
    kept.push(line);
    bytes += size;
  }

  return {
    lines: kept,
    totalLines,
    truncated: truncatedBy !== null,
    truncatedBy
  };
}
