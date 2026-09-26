import { describe, expect, it } from "vitest";
import {
  truncateHead,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_LINE_CHARS,
  type TruncateOptions
} from "../src/tools/truncate.js";

const OPTS: TruncateOptions = {
  maxLines: DEFAULT_MAX_LINES,
  maxBytes: DEFAULT_MAX_BYTES,
  maxLineChars: DEFAULT_MAX_LINE_CHARS
};

describe("truncateHead", () => {
  it("returns content untouched when under all limits", () => {
    const result = truncateHead("a\nb\nc", OPTS);
    expect(result.lines).toEqual(["a", "b", "c"]);
    expect(result.totalLines).toBe(3);
    expect(result.truncated).toBe(false);
    expect(result.truncatedBy).toBeNull();
  });

  it("does not count a trailing newline as an extra line", () => {
    const result = truncateHead("a\nb\n", OPTS);
    expect(result.lines).toEqual(["a", "b"]);
    expect(result.totalLines).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it("handles empty content", () => {
    const result = truncateHead("", OPTS);
    expect(result.lines).toEqual([]);
    expect(result.totalLines).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("cuts by line limit when lines run out first", () => {
    const content = Array.from({ length: 50 }, (_, i) => `line-${i}`).join(
      "\n"
    );
    const result = truncateHead(content, { ...OPTS, maxLines: 10 });
    expect(result.lines).toHaveLength(10);
    expect(result.lines[0]).toBe("line-0");
    expect(result.truncated).toBe(true);
    expect(result.truncatedBy).toBe("lines");
  });

  it("cuts by byte limit and never returns a partial line", () => {
    const content = Array.from({ length: 50 }, (_, i) => `line-${i}`).join(
      "\n"
    );
    const result = truncateHead(content, { ...OPTS, maxBytes: 45 });
    // each line is 6-7 chars; must stop before exceeding 45 bytes total
    const joined = result.lines.join("\n");
    expect(Buffer.byteLength(joined, "utf-8")).toBeLessThanOrEqual(45);
    // full content is 320ish bytes -> definitely truncated
    expect(result.truncated).toBe(true);
    expect(result.truncatedBy).toBe("bytes");
  });

  it("byte limit wins over line limit when both are exceeded", () => {
    const content = Array.from({ length: 100 }, () => "x").join("\n");
    const result = truncateHead(content, {
      ...OPTS,
      maxLines: 50,
      maxBytes: 30
    });
    expect(result.truncatedBy).toBe("bytes");
  });

  it("inline-truncates oversized lines to maxLineChars", () => {
    const long = "a".repeat(3000);
    const result = truncateHead(`short\n${long}\nshort2`, {
      ...OPTS,
      maxLineChars: 100
    });
    expect(result.lines[1]).toBe(
      "a".repeat(100) + "\u2026 (line truncated to 100 chars)"
    );
    expect(result.lines).toContain("short");
    expect(result.truncated).toBe(false); // cap trims the line, not the line count
  });

  it("multi-byte characters are counted as bytes, not chars", () => {
    // é is 2 bytes in utf-8; 300 × é = 600 bytes > 100
    const content = "\u00e9".repeat(300);
    const result = truncateHead(content, { ...OPTS, maxBytes: 100 });
    // First line alone exceeds the cap: kept anyway (bounded by maxLineChars
    // to 2000 chars = up to 4000 bytes) so a bounded read is never empty.
    expect(result.lines).toHaveLength(1);
    expect(result.truncatedBy).toBe("bytes");
  });
});
