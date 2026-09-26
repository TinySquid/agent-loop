import { describe, expect, it } from "vitest";
import {
  boundedOutput,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_LINE_CHARS,
  type BoundOptions
} from "../src/tools/truncate.js";

const OPTS: BoundOptions = {
  maxLines: DEFAULT_MAX_LINES,
  maxBytes: DEFAULT_MAX_BYTES,
  maxLineChars: DEFAULT_MAX_LINE_CHARS
};

/** The paging tail read-style tools pass; offset is the shared paging vocabulary. */
const offsetTail = (next: number) => `Use offset=${next} to continue.`;

describe("boundedOutput windowing", () => {
  it("returns content untouched when under all limits", () => {
    const result = boundedOutput("a\nb\nc", OPTS);
    expect(result.lines).toEqual(["a", "b", "c"]);
    expect(result.totalLines).toBe(3);
    expect(result.truncated).toBe(false);
    expect(result.truncatedBy).toBeNull();
    expect(result.notice).toBe("");
    expect(result.text).toBe("a\nb\nc");
  });

  it("does not count a trailing newline as an extra line", () => {
    const result = boundedOutput("a\nb\n", OPTS);
    expect(result.lines).toEqual(["a", "b"]);
    expect(result.totalLines).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it("handles empty content", () => {
    const result = boundedOutput("", OPTS);
    expect(result.lines).toEqual([]);
    expect(result.totalLines).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("cuts by line limit when lines run out first", () => {
    const content = Array.from({ length: 50 }, (_, i) => `line-${i}`).join(
      "\n"
    );
    const result = boundedOutput(content, { ...OPTS, maxLines: 10 });
    expect(result.lines).toHaveLength(10);
    expect(result.lines[0]).toBe("line-0");
    expect(result.truncated).toBe(true);
    expect(result.truncatedBy).toBe("lines");
  });

  it("cuts by byte limit and never returns a partial line", () => {
    const content = Array.from({ length: 50 }, (_, i) => `line-${i}`).join(
      "\n"
    );
    const result = boundedOutput(content, { ...OPTS, maxBytes: 45 });
    // each line is 6-7 chars; must stop before exceeding 45 bytes total
    const joined = result.lines.join("\n");
    expect(Buffer.byteLength(joined, "utf-8")).toBeLessThanOrEqual(45);
    // full content is 320ish bytes -> definitely truncated
    expect(result.truncated).toBe(true);
    expect(result.truncatedBy).toBe("bytes");
  });

  it("byte limit wins over line limit when both are exceeded", () => {
    const content = Array.from({ length: 100 }, () => "x").join("\n");
    const result = boundedOutput(content, {
      ...OPTS,
      maxLines: 50,
      maxBytes: 30
    });
    expect(result.truncatedBy).toBe("bytes");
  });

  it("inline-truncates oversized lines to maxLineChars", () => {
    const long = "a".repeat(3000);
    const result = boundedOutput(`short\n${long}\nshort2`, {
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
    const result = boundedOutput(content, { ...OPTS, maxBytes: 100 });
    // First line alone exceeds the cap: kept anyway (bounded by maxLineChars
    // to 2000 chars = up to 4000 bytes) so bounded output is never empty.
    expect(result.lines).toHaveLength(1);
    expect(result.truncatedBy).toBe("bytes");
  });

  it("never returns empty text when the first line alone exceeds the cap", () => {
    const result = boundedOutput("only-line", { ...OPTS, maxBytes: 1 });
    expect(result.lines).toEqual(["only-line"]);
    expect(result.truncated).toBe(true);
  });
});

describe("boundedOutput continuation notice", () => {
  it("appends the notice for a lines-limit cut", () => {
    const result = boundedOutput("a\nb\nc", {
      ...OPTS,
      maxLines: 2,
      resumeHint: offsetTail
    });
    expect(result.notice).toBe(
      "[Showing lines 1-2 of 3 (lines limit). Use offset=3 to continue.]"
    );
  });

  it("appends the notice for a bytes-limit cut", () => {
    const result = boundedOutput("a\nbb\nc", {
      ...OPTS,
      maxBytes: 4,
      resumeHint: offsetTail
    });
    expect(result.notice).toContain("(bytes limit)");
    expect(result.notice).toContain("Use offset=");
  });

  it("numbers the window from startLine, not from 1", () => {
    const result = boundedOutput("c\nd\ne", {
      ...OPTS,
      maxLines: 2,
      startLine: 3,
      totalLines: 9,
      resumeHint: offsetTail
    });
    expect(result.notice).toBe(
      "[Showing lines 3-4 of 9 (lines limit). Use offset=5 to continue.]"
    );
  });

  it("totals against the full content, not just the window", () => {
    const result = boundedOutput("b\nc", {
      ...OPTS,
      maxLines: 1,
      totalLines: 3,
      startLine: 2,
      resumeHint: offsetTail
    });
    expect(result.notice).toContain("of 3");
  });

  it("omits the resume tail when the caller does not page", () => {
    const result = boundedOutput("a\nb\nc", { ...OPTS, maxLines: 2 });
    expect(result.notice).toBe("[Showing lines 1-2 of 3 (lines limit).]");
  });

  it("drops a resume hint that would blow the notice budget", () => {
    const result = boundedOutput("a\nb\nc", {
      ...OPTS,
      maxLines: 2,
      resumeHint: (next) => `Use offset=${next} and ${"x".repeat(300)}`
    });
    expect(result.notice).toBe("[Showing lines 1-2 of 3 (lines limit).]");
    expect(result.notice.length).toBeLessThan(200);
  });

  it("leaves the notice off entirely when nothing was cut", () => {
    const result = boundedOutput("a\nb", OPTS);
    expect(result.notice).toBe("");
    expect(result.text).toBe("a\nb");
  });
});
