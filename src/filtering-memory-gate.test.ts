import { describe, expect, it } from "vitest";
import { evaluateMemoryCandidate } from "../packages/context-engine/src/utils/filtering";

describe("memory gate hardening", () => {
  it("rejects media wrapper artifacts", () => {
    const d = evaluateMemoryCandidate("[media attached: /Users/clawdaddy/.openclaw/media/inbound/file.jpg]", "user");
    expect(d.keep).toBe(false);
    expect(d.reason).toBe("denylist");
  });

  it("accepts durable preference statements", () => {
    const d = evaluateMemoryCandidate("I prefer concise updates and we decided to keep briefs at 8am.", "user");
    expect(d.keep).toBe(true);
  });

  it("rejects non-explicit assistant content", () => {
    const d = evaluateMemoryCandidate("I can provide options and summarize this later.", "assistant");
    expect(d.keep).toBe(false);
    expect(["assistant_not_explicit", "low_signal"]).toContain(d.reason);
  });
});
