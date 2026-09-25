import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agent.js";

describe("runAgent", () => {
  it("is a stub that rejects until the agent loop is built", async () => {
    await expect(
      runAgent({ model: "qwen/qwen3.8-27b:free", prompt: "hello" })
    ).rejects.toThrow("not implemented");
  });
});
