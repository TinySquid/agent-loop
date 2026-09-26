import type { AgentEvent } from "../src/agent.js";
import { agentEventPrinter } from "../src/event-printer.js";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Capture everything the printer writes to stderr so assertions see the
 * exact sequence the CLI would render. Restored after each test so a
 * failing assertion cannot leak output into later tests.
 */
function captureStderr(): {
  text: () => string;
} {
  const writes: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  }) as never);
  return { text: () => writes.join("") };
}

afterEach(() => {
  vi.restoreAllMocks();
});

function toolCall(name: string, argsJson: string): AgentEvent {
  return {
    type: "tool-call",
    round: 1,
    call: {
      id: "call-1",
      type: "function",
      function: { name, arguments: argsJson }
    }
  };
}

const usage: AgentEvent = {
  type: "usage",
  usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 }
};

describe("agentEventPrinter", () => {
  it("streams assistant text to stderr without a trailing newline", () => {
    const captured = captureStderr();
    agentEventPrinter()({ type: "assistant-text", text: "thinking" });
    expect(captured.text()).toBe("thinking");
  });

  it("closes streamed text with a newline before a tool-call line", () => {
    const captured = captureStderr();
    const print = agentEventPrinter();
    print({ type: "assistant-text", text: "let me check." });
    print(toolCall("read", '{"file_path": "a.txt"}'));

    expect(captured.text()).toBe(
      "let me check.\n› round 1 · read(file_path=a.txt)\n"
    );
  });

  it("closes streamed text with a newline before the usage line", () => {
    const captured = captureStderr();
    const print = agentEventPrinter();
    print({ type: "assistant-text", text: "done." });
    print(usage);

    expect(captured.text()).toBe("done.\ntokens: in 3 · out 2\n");
  });

  it("previews tool arguments as key=value pairs", () => {
    const captured = captureStderr();
    agentEventPrinter()({
      type: "tool-call",
      round: 1,
      call: {
        id: "call-1",
        type: "function",
        function: {
          name: "read",
          arguments: '{"file_path": "a.txt", "offset": 3, "limit": 5}'
        }
      }
    });

    expect(captured.text()).toContain("file_path=a.txt, offset=3, limit=5");
  });

  it("falls back to the raw argument string when it is not JSON", () => {
    const captured = captureStderr();
    agentEventPrinter()(toolCall("Bash", "not json"));
    expect(captured.text()).toContain("not json");
  });

  it("renders round-start events as nothing", () => {
    const captured = captureStderr();
    agentEventPrinter()({ type: "round-start", round: 7 });
    expect(captured.text()).toBe("");
  });

  it("separates consecutive tool-call lines with newlines even without streamed text", () => {
    const captured = captureStderr();
    const print = agentEventPrinter();
    print(toolCall("Bash", '{"command": "ls"}'));
    print(toolCall("read", '{"file_path": "b.txt"}'));

    expect(captured.text()).toBe(
      "› round 1 · Bash(command=ls)\n› round 1 · read(file_path=b.txt)\n"
    );
  });
});
