import { describe, expect, it } from "vitest";
import { systemPrompt } from "../src/system-prompt.js";

describe("systemPrompt", () => {
  it("sells the run context: date and working directory", () => {
    const prompt = systemPrompt();
    expect(prompt).toContain("current date");
    expect(prompt).toContain(process.cwd());
    expect(prompt).toContain("relative file paths");
  });
});
