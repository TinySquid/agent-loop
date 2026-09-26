import { describe, expect, it } from "vitest";
import {
  HelpRequest,
  parseArgv,
  UsageError,
  type CliCommand
} from "../src/parse-args.js";

function parse(...argv: string[]): CliCommand {
  return parseArgv(argv);
}

describe("parseArgv", () => {
  it("parses -p with -m into run-agent", () => {
    expect(parse("-p", "hello", "-m", "google/gemma-4-31b-it:free")).toEqual({
      type: "run-agent",
      model: "google/gemma-4-31b-it:free",
      prompt: "hello",
      quiet: false
    });
  });

  it("parses --prompt as an alias of -p", () => {
    expect(
      parse("--prompt", "hello", "--model", "qwen/qwen3.8-27b:free")
    ).toEqual({
      type: "run-agent",
      model: "qwen/qwen3.8-27b:free",
      prompt: "hello",
      quiet: false
    });
  });

  it("parses --quiet alongside the prompt into run-agent", () => {
    expect(parse("-p", "hello", "-m", "m", "--quiet")).toEqual({
      type: "run-agent",
      model: "m",
      prompt: "hello",
      quiet: true
    });
  });

  it("parses --list-free-models", () => {
    expect(parse("--list-free-models")).toEqual({
      type: "list-free-models"
    });
  });

  it("parses --list-models", () => {
    expect(parse("--list-models")).toEqual({ type: "list-models" });
  });

  it("throws UsageError when --prompt has no --model", () => {
    expect(() => parse("-p", "hello")).toThrow(UsageError);
  });

  it("throws UsageError when no args are given", () => {
    expect(() => parse()).toThrow(UsageError);
  });

  it("throws UsageError when --model is given without --prompt", () => {
    expect(() => parse("-m", "qwen/qwen3.8-27b:free")).toThrow(UsageError);
  });

  it("throws UsageError for --list-models with --prompt", () => {
    expect(() =>
      parse("--list-models", "--prompt", "hello", "-m", "m")
    ).toThrow(UsageError);
  });

  it("throws UsageError for --list-free-models with --list-models", () => {
    expect(() => parse("--list-free-models", "--list-models")).toThrow(
      UsageError
    );
  });

  it("throws UsageError for -m with a list flag", () => {
    expect(() => parse("--list-models", "-m", "m")).toThrow(UsageError);
  });

  it("throws UsageError for unknown options", () => {
    expect(() => parse("--bogus")).toThrow(UsageError);
  });

  it("throws HelpRequest for -h", () => {
    try {
      parse("-h");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(HelpRequest);
      expect((error as HelpRequest).helpText).toContain("Usage:");
    }
  });

  it("throws HelpRequest for --help", () => {
    expect(() => parse("--help")).toThrow(HelpRequest);
  });

  it("throws HelpRequest for --version carrying the package version", () => {
    try {
      parse("--version");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(HelpRequest);
      expect((error as HelpRequest).helpText).toMatch(/^\d+\.\d+\.\d+/);
    }
  });
});
