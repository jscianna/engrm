import { describe, it, expect } from "vitest";
import {
  detectModelFamily,
  getContextBudget,
  formatTieredContextForModel,
  formatMemoryListForModel,
  type TieredContext,
} from "../model-adapter.js";

describe("detectModelFamily", () => {
  it("detects Claude models", () => {
    expect(detectModelFamily("claude-sonnet-4-6")).toBe("claude");
    expect(detectModelFamily("claude-opus-4-5")).toBe("claude");
    expect(detectModelFamily("claude-3-haiku-20240307")).toBe("claude");
    expect(detectModelFamily("anthropic/claude-sonnet-4-6")).toBe("claude");
  });

  it("detects GPT models", () => {
    expect(detectModelFamily("gpt-4o")).toBe("gpt");
    expect(detectModelFamily("gpt-4o-mini")).toBe("gpt");
    expect(detectModelFamily("gpt-5.2")).toBe("gpt");
    expect(detectModelFamily("o3-mini")).toBe("gpt");
  });

  it("detects DeepSeek models", () => {
    expect(detectModelFamily("deepseek-coder-v2")).toBe("deepseek");
    expect(detectModelFamily("deepseek-chat")).toBe("deepseek");
  });

  it("detects Gemini models", () => {
    expect(detectModelFamily("gemini-2.5-pro")).toBe("gemini");
    expect(detectModelFamily("gemini-2.0-flash")).toBe("gemini");
  });

  it("detects small models", () => {
    expect(detectModelFamily("qwen-2.5-coder-7b")).toBe("small");
    expect(detectModelFamily("llama-3.1-8b")).toBe("small");
    expect(detectModelFamily("mistral-7b-instruct")).toBe("small");
    expect(detectModelFamily("phi-3-mini")).toBe("small");
  });

  it("returns unknown for null/empty", () => {
    expect(detectModelFamily(null)).toBe("unknown");
    expect(detectModelFamily("")).toBe("unknown");
    expect(detectModelFamily(undefined)).toBe("unknown");
  });

  it("returns unknown for unrecognized models", () => {
    expect(detectModelFamily("my-custom-model")).toBe("unknown");
  });
});

describe("getContextBudget", () => {
  it("returns larger budget for claude", () => {
    const budget = getContextBudget("claude");
    expect(budget.max_tokens).toBe(4000);
    expect(budget.max_memories).toBe(20);
    expect(budget.critical_only).toBe(false);
  });

  it("returns restricted budget for small models", () => {
    const budget = getContextBudget("small");
    expect(budget.max_tokens).toBe(1000);
    expect(budget.max_memories).toBe(6);
    expect(budget.critical_only).toBe(true);
  });
});

describe("formatTieredContextForModel", () => {
  const test_context: TieredContext = {
    critical: [
      { id: "1", title: "User prefers TypeScript", text: "Strict mode, functional style" },
      { id: "2", title: "Database", text: "Uses Turso with vector search" },
    ],
    working: [
      { id: "3", title: "Current task", text: "Building memory system" },
    ],
    high: [
      { id: "4", title: "Testing", text: "Uses vitest for tests" },
    ],
  };

  it("formats Claude context with XML tags", () => {
    const result = formatTieredContextForModel(test_context, "claude");
    expect(result).toContain("<fathippo_memory>");
    expect(result).toContain("</fathippo_memory>");
    expect(result).toContain("<critical>");
    expect(result).toContain('<memory title="User prefers TypeScript">');
  });

  it("formats GPT context with bold markdown", () => {
    const result = formatTieredContextForModel(test_context, "gpt");
    expect(result).toContain("## Critical Memory");
    expect(result).toContain("**User prefers TypeScript**");
  });

  it("formats small model context as compressed text", () => {
    const result = formatTieredContextForModel(test_context, "small");
    expect(result.startsWith("CONTEXT:")).toBe(true);
    // Should only have critical memories
    expect(result).not.toContain("Current task");
    expect(result).not.toContain("vitest");
  });

  it("formats unknown model with default markdown", () => {
    const result = formatTieredContextForModel(test_context, "unknown");
    expect(result).toContain("## Critical Memory");
    expect(result).toContain("- User prefers TypeScript:");
  });

  it("returns empty string for empty context", () => {
    expect(formatTieredContextForModel({}, "claude")).toBe("");
    expect(formatTieredContextForModel({}, "small")).toBe("");
  });

  it("enforces memory count budget", () => {
    const big_context: TieredContext = {
      critical: Array.from({ length: 10 }, (_, i) => ({
        id: `c${i}`, title: `Critical ${i}`, text: `Text ${i}`,
      })),
      high: Array.from({ length: 10 }, (_, i) => ({
        id: `h${i}`, title: `High ${i}`, text: `Text ${i}`,
      })),
    };
    // Small model budget: 6 memories, critical only
    const result = formatTieredContextForModel(big_context, "small");
    // Should be compressed and limited
    const items = result.replace("CONTEXT: ", "").split(". ").filter(Boolean);
    expect(items.length).toBeLessThanOrEqual(6);
  });
});

describe("formatMemoryListForModel", () => {
  const memories = [
    { id: "1", title: "TypeScript", text: "Strict mode" },
    { id: "2", title: "DB", text: "Turso" },
  ];

  it("returns XML for Claude", () => {
    const result = formatMemoryListForModel(memories, "claude");
    expect(result[0]).toContain("<memory");
    expect(result[0]).toContain("TypeScript");
  });

  it("returns bold markdown for GPT", () => {
    const result = formatMemoryListForModel(memories, "gpt");
    expect(result[0]).toContain("**TypeScript**");
  });

  it("returns truncated text for small", () => {
    const result = formatMemoryListForModel(memories, "small");
    expect(result[0]).toContain("TypeScript");
    expect(result[0].length).toBeLessThanOrEqual(60);
  });
});
