import { describe, expect, it } from "vitest";
import { formatProviderError } from "../src/provider-error.js";

function openRouterError(statusCode: number, body: string): Error {
  return Object.assign(new Error("Provider returned error"), {
    statusCode,
    body
  });
}

describe("formatProviderError", () => {
  it("returns null for a plain error", () => {
    expect(formatProviderError(new Error("boom"))).toBeNull();
  });

  it("formats status code and the nested provider message", () => {
    const formatted = formatProviderError(
      openRouterError(
        429,
        JSON.stringify({
          error: {
            message: "Provider returned error",
            code: 429,
            metadata: {
              raw: "qwen/qwen3.8-27b:free is temporarily rate-limited upstream."
            }
          }
        })
      )
    );
    expect(formatted).toContain("OpenRouter API error 429");
    expect(formatted).toContain("Provider returned error");
    expect(formatted).toContain(
      "qwen/qwen3.8-27b:free is temporarily rate-limited upstream."
    );
  });

  it("includes the remedy hint when present", () => {
    const formatted = formatProviderError(
      openRouterError(
        429,
        JSON.stringify({
          error: {
            message: "Provider returned error",
            metadata: { remedy_hint: "Retry shortly." }
          }
        })
      )
    );
    expect(formatted).toContain("Retry shortly.");
  });

  it("falls back to the raw body when it is not JSON", () => {
    const formatted = formatProviderError(
      openRouterError(502, "<html>bad gateway</html>")
    );
    expect(formatted).toContain("OpenRouter API error 502");
    expect(formatted).toContain("<html>bad gateway</html>");
  });

  it("returns null when statusCode or body is missing", () => {
    expect(formatProviderError(Object.assign(new Error("x"), {}))).toBeNull();

    expect(
      formatProviderError(Object.assign(new Error("x"), { statusCode: 429 }))
    ).toBeNull();
    expect(
      formatProviderError(Object.assign(new Error("x"), { body: "{}" }))
    ).toBeNull();
  });
});
