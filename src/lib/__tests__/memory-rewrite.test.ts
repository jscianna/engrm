import { describe, expect, it } from "vitest";
import { buildRewriteSuggestion } from "@/lib/memory-rewrite";

describe("buildRewriteSuggestion", () => {
  it("extracts durable decision signal from noisy text", () => {
    const raw = `session_id=abc123 tool output...\nwe decided to always use snake_case for API fields\nstdout: done`;
    const suggestion = buildRewriteSuggestion(raw);
    expect(suggestion).not.toBeNull();
    expect(suggestion?.candidate_text.toLowerCase()).toContain("decided");
  });

  it("returns null when no durable signal exists", () => {
    const raw = "ok done logs complete";
    expect(buildRewriteSuggestion(raw)).toBeNull();
  });
});
