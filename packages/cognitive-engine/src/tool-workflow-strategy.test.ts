import { describe, expect, it } from "vitest";
import {
  buildAdaptivePolicyFeatures,
  buildToolWorkflowContextKey,
  classifyObservedToolWorkflow,
  recommendToolWorkflow,
  type ToolWorkflowStat,
} from "../../../src/lib/cognitive-learning";

describe("tool workflow strategy learning", () => {
  it("classifies verification-first traces from tool categories", () => {
    const features = buildAdaptivePolicyFeatures({
      problem: "Build fails in Next.js app",
      endpoint: "context-engine.assemble",
      technologies: ["nextjs", "typescript"],
      repoProfile: {
        workspaceRoot: "/workspace/apps/web",
        workspaceType: "web-app",
        projectType: "nextjs",
      },
    });

    const workflow = classifyObservedToolWorkflow({
      problem: "Build fails in Next.js app",
      features,
      automatedSignals: {
        toolCalls: [
          { toolName: "shell", category: "build", command: "npm run build" },
          { toolName: "shell", category: "search", command: "rg middleware" },
        ],
        toolResults: [{ toolName: "shell", category: "build", success: false }],
      },
      context: {},
    });

    expect(workflow).toBe("verify_first");
  });

  it("prefers inspect-config-first for auth/config-heavy contexts with good outcomes", () => {
    const features = buildAdaptivePolicyFeatures({
      problem: "Fix the Clerk middleware redirect loop in Next.js auth config",
      endpoint: "context-engine.assemble",
      technologies: ["nextjs", "clerk", "typescript"],
      repoProfile: {
        workspaceRoot: "/workspace/apps/web",
        workspaceType: "web-app",
        projectType: "nextjs",
      },
    });
    const contextKey = buildToolWorkflowContextKey(features);
    const contextStats: ToolWorkflowStat[] = [
      {
        strategyKey: "inspect_config_first",
        contextKey,
        sampleCount: 4,
        resolvedCount: 4,
        successCount: 4,
        verifiedSuccessCount: 3,
        avgReward: 0.68,
      },
      {
        strategyKey: "verify_first",
        contextKey,
        sampleCount: 4,
        resolvedCount: 4,
        successCount: 2,
        verifiedSuccessCount: 1,
        avgReward: 0.08,
      },
    ];

    const recommendation = recommendToolWorkflow({
      features,
      contextStats,
      globalStats: contextStats,
    });

    expect(recommendation.exploration).toBe(false);
    expect(recommendation.key).toBe("inspect_config_first");
    expect(recommendation.rationale).toBe("config_heavy_failures_prefer_config_inspection");
    expect(recommendation.steps[0]).toContain("config");
  });
});
