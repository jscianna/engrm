import { describe, expect, it } from "vitest";
import {
  evaluateAutoMemoryCandidate,
  evaluateExplicitMemoryCandidate,
  rankMemoriesForInjection,
} from "@/lib/memory-quality";

describe("memory quality gate", () => {
  it("keeps durable user corrections and config facts", () => {
    const result = evaluateAutoMemoryCandidate(
      "Actually we're using hosted mode now and the namespace is fathippo-prod for OpenClaw.",
      "user",
    );

    expect(result.keep).toBe(true);
    expect(result.reason).toBe("accepted");
  });

  it("rejects assistant progress chatter", () => {
    const result = evaluateAutoMemoryCandidate(
      "I'll check the logs and report back after I try a couple of fixes.",
      "assistant",
    );

    expect(result.keep).toBe(false);
    expect(result.reason).toBe("assistant_not_explicit");
  });

  it("rejects raw tool output", () => {
    const result = evaluateAutoMemoryCandidate(
      "Successfully wrote 3 files and updated /Users/clawdaddy/project/tmp.json",
      "tool",
    );

    expect(result.keep).toBe(false);
    expect(result.reason).toBe("role_disallowed");
  });

  it("keeps explicit remember facts even when they are simple declaratives", () => {
    const result = evaluateExplicitMemoryCandidate(
      "Production region is us-east-1 for the hosted deployment.",
    );

    expect(result.keep).toBe(true);
    expect(result.reason).toBe("accepted");
  });
});

describe("injection quality ranking", () => {
  it("prefers durable decisions over transient events", () => {
    const ranked = rankMemoriesForInjection([
      {
        id: "durable",
        text: "We decided to keep hosted mode enabled for OpenClaw because it improves recall precision.",
        memoryType: "decision",
        importanceTier: "high",
        durabilityClass: "durable",
        accessCount: 6,
        feedbackScore: 1,
        metadata: { capture: { qualityScore: 8.8 } },
      },
      {
        id: "ephemeral",
        text: "Yesterday we looked at a couple options and might revisit this later.",
        memoryType: "event",
        importanceTier: "normal",
        durabilityClass: "ephemeral",
        accessCount: 0,
        feedbackScore: 0,
        metadata: { capture: { qualityScore: 4.5 } },
      },
    ]);

    expect(ranked[0]?.memory.id).toBe("durable");
    expect(ranked.some((item) => item.memory.id === "ephemeral" && item.score >= 0.95)).toBe(false);
  });
});
