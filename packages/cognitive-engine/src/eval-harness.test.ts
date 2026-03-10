import { describe, expect, it } from "vitest";
import { evaluateRetrievalFixtures } from "./eval/harness.js";

describe("evaluateRetrievalFixtures", () => {
  it("computes MRR, recall, hit rate, and weak outcome lift from labeled fixtures", () => {
    const result = evaluateRetrievalFixtures({
      fixtures: [
        {
          problem: "Fix the failing Turso vector query",
          technologies: ["turso", "typescript"],
          expectedTraceIds: ["trace-a"],
          expectedPatternIds: ["pattern-a"],
          expectedSkillIds: ["skill-a"],
          acceptedId: "trace-a",
        },
        {
          problem: "Resolve the Next.js build failure",
          technologies: ["nextjs"],
          expectedTraceIds: ["trace-b"],
          expectedPatternIds: ["pattern-b"],
          expectedSkillIds: [],
        },
      ],
      predictions: [
        {
          traces: [{ id: "trace-a" }, { id: "trace-x" }],
          patterns: [{ id: "pattern-a" }],
          skills: [{ id: "skill-a" }],
          finalOutcome: "success",
          acceptedTraceId: "trace-a",
          acceptedPatternId: "pattern-a",
        },
        {
          traces: [{ id: "trace-x" }, { id: "trace-b" }],
          patterns: [{ id: "pattern-b" }],
          skills: [],
          finalOutcome: "success",
        },
      ],
    });

    expect(result.cases).toBe(2);
    expect(result.traceMrr).toBeCloseTo(0.75, 5);
    expect(result.patternRecallAtK).toBe(1);
    expect(result.skillHitRate).toBe(0.5);
    expect(result.weakOutcomeLift).toBe(1);
  });
});
