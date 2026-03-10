import { describe, expect, it } from "vitest";
import { buildStructuredTrace } from "../../../packages/context-engine/src/cognitive/trace-capture.js";

describe("tool result parsing", () => {
  it("maps tool_result blocks back to the original tool name instead of using the opaque tool_use_id", () => {
    const trace = buildStructuredTrace({
      sessionId: "session-1",
      startTime: 0,
      endTime: 15_000,
      filesModified: ["src/app.ts"],
      messages: [
        {
          role: "user",
          content: "Fix the failing tests in this Next.js project.",
        },
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "I should run the test command first and inspect the failure." },
            { type: "tool_use", id: "toolu_123456", name: "shell", input: { command: "npm test" } },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_123456",
              content: "Tests passed successfully",
              exitCode: 0,
            },
          ],
        },
        {
          role: "assistant",
          content: "I fixed the issue and the tests now pass.",
        },
      ] as unknown as Array<{ type: string; thinking?: string; name?: string; input?: unknown; tool_use_id?: string; content?: string; exitCode?: number }>,
    });

    expect(trace).not.toBeNull();
    expect(trace?.toolsUsed).toContain("shell");
    expect(trace?.toolsUsed).not.toContain("toolu_123456");

    const automatedSignals = trace?.automatedSignals as {
      toolResults?: Array<{ toolName?: string; success?: boolean }>;
      testSignals?: { passed?: number; failed?: number };
    };
    expect(automatedSignals.toolResults?.[0]?.toolName).toBe("shell");
    expect(automatedSignals.toolResults?.[0]?.success).toBe(true);
    expect(automatedSignals.testSignals?.passed).toBe(1);
  });
});
