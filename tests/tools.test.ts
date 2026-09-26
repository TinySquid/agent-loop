import { describe, expect, it } from "vitest";
import {
  BASH_TIMEOUT_CAP_MS,
  BASH_TIMEOUT_DEFAULT_MS,
  DEFAULT_BASH_TIMEOUT_OPTIONS,
  createBashTool,
  createReadTool,
  deriveTimeout,
  toolSpecs,
  type Tool
} from "../src/tools/index.js";

/** Production-style options, scaled down so timing tests stay fast. */
const FAST_OPTIONS = {
  defaultMs: 100,
  capMs: 200,
  sigkillGraceMs: 50
};

describe("toolSpecs", () => {
  const specOnly: Tool = {
    spec: {
      type: "function",
      function: {
        name: "Echo",
        description: "echo fixture",
        parameters: { type: "object", properties: {} },
        strict: true
      }
    },
    async execute() {
      return "implemented";
    }
  };

  it("projects the model half onto the wire, unchanged", () => {
    expect(toolSpecs([specOnly])).toEqual([specOnly.spec]);
  });

  it("never puts the implementation half on the wire", () => {
    const [onWire] = toolSpecs([specOnly]);
    expect(onWire).not.toHaveProperty("execute");
    expect(JSON.stringify(onWire)).not.toContain("implemented");
  });

  it("keeps schema-only fields the caller set (strict, cache control)", () => {
    const [onWire] = toolSpecs([specOnly]) as readonly unknown[] as [
      { function: { strict?: boolean } }
    ];
    expect(onWire.function.strict).toBe(true);
  });

  it("returns an empty projection for an empty toolset", () => {
    expect(toolSpecs([])).toEqual([]);
  });
});

describe("deriveTimeout (production options)", () => {
  it("defaults when timeout_ms is missing or invalid", () => {
    expect(deriveTimeout(undefined, DEFAULT_BASH_TIMEOUT_OPTIONS)).toBe(
      BASH_TIMEOUT_DEFAULT_MS
    );
    expect(deriveTimeout("not a number", DEFAULT_BASH_TIMEOUT_OPTIONS)).toBe(
      BASH_TIMEOUT_DEFAULT_MS
    );
    expect(deriveTimeout(Number.NaN, DEFAULT_BASH_TIMEOUT_OPTIONS)).toBe(
      BASH_TIMEOUT_DEFAULT_MS
    );
    expect(deriveTimeout(0, DEFAULT_BASH_TIMEOUT_OPTIONS)).toBe(
      BASH_TIMEOUT_DEFAULT_MS
    );
    expect(deriveTimeout(-5, DEFAULT_BASH_TIMEOUT_OPTIONS)).toBe(
      BASH_TIMEOUT_DEFAULT_MS
    );
  });

  it("clamps values above the 120s cap to exactly the cap", () => {
    expect(
      deriveTimeout(BASH_TIMEOUT_CAP_MS * 100, DEFAULT_BASH_TIMEOUT_OPTIONS)
    ).toBe(BASH_TIMEOUT_CAP_MS);
  });

  it("honors a request of exactly the cap unchanged", () => {
    expect(
      deriveTimeout(BASH_TIMEOUT_CAP_MS, DEFAULT_BASH_TIMEOUT_OPTIONS)
    ).toBe(BASH_TIMEOUT_CAP_MS);
  });

  it("passes through in-range values", () => {
    expect(deriveTimeout(1, DEFAULT_BASH_TIMEOUT_OPTIONS)).toBe(1);
  });
});

describe("deriveTimeout (fast options)", () => {
  it("clamps against the injected cap, not the production one", () => {
    expect(deriveTimeout(500, FAST_OPTIONS)).toBe(FAST_OPTIONS.capMs);
    expect(deriveTimeout(undefined, FAST_OPTIONS)).toBe(FAST_OPTIONS.defaultMs);
  });
});

describe("createBashTool", () => {
  it("defers the cwd fact to the run-context seam, not the literal path", () => {
    // factories that interpolate process.cwd() at build time are untestable
    // off the host and duplicated the system prompt's cwd fact
    const tool = createBashTool(FAST_OPTIONS);
    expect(tool.spec.function.description).not.toContain(process.cwd());
    expect(tool.spec.function.description).toContain("process cwd");
  });

  it("reflects the active options in the timeout_ms schema description", () => {
    const tool = createBashTool(FAST_OPTIONS);
    const parameters = tool.spec.function.parameters as
      | {
          properties?: { timeout_ms?: { description?: string } };
        }
      | undefined;
    const description = parameters?.properties?.timeout_ms?.description ?? "";
    expect(description).toContain("default 100");
    expect(description).toContain("capped at 200");
  });

  it("returns stdout on success", async () => {
    const result = await createBashTool(FAST_OPTIONS).execute({
      command: "echo hello"
    });
    // bounded output owns the trailing-newline rule: a final newline is a
    // line terminator, not content
    expect(result).toBe("hello");
  });

  it("includes stderr and exit code on failure", async () => {
    const result = await createBashTool(FAST_OPTIONS).execute({
      command: "echo oops >&2; exit 3"
    });
    expect(result).toContain("ERROR (Exit Code 3)");
    expect(result).toContain("oops");
  });

  it("kills the command at the injected cap and returns exit 124 with partial output", async () => {
    const tool = createBashTool(FAST_OPTIONS);
    const start = Date.now();
    const result = await tool.execute({
      command: "echo partial; sleep 10",
      timeout_ms: 500 // above the 200ms cap -> clamped to 200ms
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5_000);
    expect(result).toContain("timed out after 200ms");
    expect(result).toContain("partial");
    expect(result).toContain("Exit Code 124");
  });

  it("uses the injected default when timeout_ms is omitted", async () => {
    const tool = createBashTool({ ...FAST_OPTIONS, defaultMs: 150 });
    const start = Date.now();
    const result = await tool.execute({ command: "sleep 10" });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(140);
    expect(elapsed).toBeLessThan(5_000);
    expect(result).toContain("timed out after 150ms");
  });

  it("kills the whole process tree on timeout, not just bash", async () => {
    const tool = createBashTool(FAST_OPTIONS);
    const start = Date.now();
    // sleep 125 is the case that found the bug: bash dies but an orphaned
    // `sleep` holds the stdout pipe, so the result only arrives once the
    // whole group is gone. Fast, because the cap is milliseconds.
    const result = await tool.execute({
      command: "sleep 125 && echo late",
      timeout_ms: 500
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5_000);
    expect(result).toContain("Exit Code 124");
    expect(result).not.toContain("late");
  });

  it("truncates runaway stdout with a continuation notice", async () => {
    const tool = createBashTool({
      ...FAST_OPTIONS,
      maxLines: 3,
      maxBytes: 50_000,
      maxLineChars: 2000
    });
    const result = await tool.execute({ command: "seq 100" });
    expect(result.split("\n\n")[0]?.split("\n")).toHaveLength(3);
    expect(result).toContain("(lines limit)");
    // a finished command's output is not pageable: no offset tail
    expect(result).not.toContain("Use offset");
  });

  it("truncates error output too, keeping the error frame head", async () => {
    const tool = createBashTool({
      ...FAST_OPTIONS,
      maxLines: 3,
      maxBytes: 50_000,
      maxLineChars: 2000
    });
    const result = await tool.execute({
      command: "seq 100 >&2; exit 7"
    });
    expect(result).toContain("ERROR (Exit Code 7)");
    expect(result).toContain("(lines limit)");
    // 3 kept lines, blank separator, notice
    expect(result.split("\n")).toHaveLength(5);
    expect(result).not.toContain("\n99");
  });

  it("inline-truncates a single oversized output line", async () => {
    const tool = createBashTool({
      ...FAST_OPTIONS,
      maxLines: 100,
      maxBytes: 50_000,
      maxLineChars: 10
    });
    const result = await tool.execute({ command: "echo aaaaaaaaaaaaaaaaaaaa" });
    expect(result).toContain("line truncated to 10 chars");
  });
});

describe("createReadTool", () => {
  /** Small fixture file inside the repo (trailing newline included). */
  const FIXTURE = "tests/fixtures/read-sample.txt";
  /** One 40-char line, for long-line truncation tests. */
  const LONG_LINE = "tests/fixtures/read-long-line.txt";

  it("reads a file with numbered lines", async () => {
    const tool = createReadTool();
    const result = await tool.execute({ file_path: FIXTURE });
    expect(result).toContain("1: alpha");
    expect(result).toContain("3: gamma");
  });

  it("honors offset (1-indexed) and limit", async () => {
    const tool = createReadTool();
    const result = await tool.execute({
      file_path: FIXTURE,
      offset: 2,
      limit: 1
    });
    expect(result).toContain("2: beta");
    expect(result).not.toContain("alpha");
    expect(result).toContain("Showing lines 2-2 of 3");
  });

  it("appends a continuation notice when the line limit truncates", async () => {
    const tool = createReadTool({
      maxLines: 2,
      maxBytes: 50_000,
      maxLineChars: 2000
    });
    const result = await tool.execute({ file_path: FIXTURE });
    expect(result).toContain("Showing lines 1-2 of 3");
    expect(result).toContain("(lines limit)");
    expect(result).toContain("Use offset=3 to continue");
  });

  it("same continuation notice when a caller-supplied limit stops early", async () => {
    const tool = createReadTool();
    const result = await tool.execute({ file_path: FIXTURE, limit: 1 });
    expect(result).toContain("Showing lines 1-1 of 3");
  });

  it("enforces the byte cap with a continuation notice", async () => {
    const tool = createReadTool({
      maxLines: 2000,
      maxBytes: 12,
      maxLineChars: 2000
    });
    const result = await tool.execute({ file_path: FIXTURE });
    expect(result).toContain("bytes limit");
    expect(result).toContain("Use offset=");
  });

  it("inline-truncates an oversized line", async () => {
    const tool = createReadTool({
      maxLines: 2000,
      maxBytes: 50_000,
      maxLineChars: 5
    });
    const result = await tool.execute({ file_path: LONG_LINE });
    expect(result).toContain("line truncated to 5 chars");
  });

  it("errors on offset beyond end of file", async () => {
    const tool = createReadTool();
    await expect(
      tool.execute({ file_path: FIXTURE, offset: 999 })
    ).rejects.toThrow(/beyond end of file/);
  });

  it("errors on a missing file", async () => {
    const tool = createReadTool();
    await expect(
      tool.execute({ file_path: "tests/fixtures/no-such-file.txt" })
    ).rejects.toThrow(/ENOENT/);
  });

  it("reflects the active options in the schema description", () => {
    const tool = createReadTool({
      maxLines: 7,
      maxBytes: 1024,
      maxLineChars: 80
    });
    expect(tool.spec.function.description).toContain("truncated to 7 lines");
    expect(tool.spec.function.description).toContain("1KB");
  });
});
