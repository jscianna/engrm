import type { ApplicationMatch, CognitiveApplication } from "@/lib/cognitive-db";

function parseObject(raw: string | null): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function verificationSummary(application: CognitiveApplication): Record<string, unknown> {
  return parseObject(application.verificationSummaryJson);
}

function baselineSummary(application: CognitiveApplication): Record<string, unknown> {
  return parseObject(application.baselineSnapshotJson);
}

export function humanizeAdaptivePolicy(policyKey: string | null | undefined): string | null {
  switch (policyKey) {
    case "trace_first":
      return "trace-first retrieval";
    case "pattern_first":
      return "pattern-first retrieval";
    case "skill_first":
      return "skill-first retrieval";
    case "balanced_default":
      return "balanced retrieval";
    default:
      return null;
  }
}

export function humanizeWorkflowStrategy(strategyKey: string | null | undefined): string | null {
  switch (strategyKey) {
    case "verify_first":
      return "run verification first";
    case "search_codebase_first":
      return "search the codebase first";
    case "inspect_config_first":
      return "inspect config first";
    case "patch_then_verify":
      return "apply the likely fix, then verify";
    default:
      return null;
  }
}

function resolutionLabel(summary: Record<string, unknown>): string | null {
  const resolutionKind = typeof summary.resolutionKind === "string" ? summary.resolutionKind : null;
  switch (resolutionKind) {
    case "tests_passed":
      return "Verified with tests";
    case "build_passed":
      return "Verified with a clean build";
    case "lint_passed":
      return "Verified with lint";
    case "manual_only":
      return "Verified manually";
    default:
      return null;
  }
}

export type FathippoReceipt = {
  title: string;
  bullets: string[];
  score: number;
  status: "positive" | "neutral" | "warning";
};

export function buildFathippoReceipt(bundle: {
  application: CognitiveApplication;
  matches: ApplicationMatch[];
}): FathippoReceipt | null {
  const { application, matches } = bundle;
  const bullets: string[] = [];
  let score = 0;

  const acceptedPattern = Boolean(application.acceptedPatternId);
  const acceptedSkill = Boolean(application.acceptedSkillId);
  const acceptedTrace = Boolean(application.acceptedTraceId);
  const workflow = humanizeWorkflowStrategy(application.workflowStrategyKey);
  const retrievalPolicy = humanizeAdaptivePolicy(application.policyKey);
  const verification = resolutionLabel(verificationSummary(application));
  const baseline = baselineSummary(application);
  const baselineRetries =
    typeof baseline.medianRetries === "number" && Number.isFinite(baseline.medianRetries)
      ? Math.round(baseline.medianRetries)
      : null;
  const baselineTime =
    typeof baseline.medianTimeToResolutionMs === "number" && Number.isFinite(baseline.medianTimeToResolutionMs)
      ? Number(baseline.medianTimeToResolutionMs)
      : null;

  if (acceptedPattern) {
    bullets.push("Reused a learned fix pattern");
    score += 3;
  } else if (acceptedSkill) {
    bullets.push("Applied a synthesized skill");
    score += 3;
  } else if (acceptedTrace) {
    bullets.push("Recalled a similar past fix");
    score += 2;
  }

  if (workflow && application.workflowReward != null && application.workflowReward > 0) {
    bullets.push(`Suggested workflow: ${workflow}`);
    score += 2;
  }

  if (retrievalPolicy && application.policyReward != null && application.policyReward > 0) {
    bullets.push(`Adapted context using ${retrievalPolicy}`);
    score += 1;
  }

  if (verification) {
    bullets.push(verification);
    score += 2;
  }

  if (baselineRetries != null && application.retryCount != null && baselineRetries > application.retryCount) {
    bullets.push(`Likely saved ${baselineRetries - application.retryCount} retries`);
    score += 2;
  }

  if (baselineTime != null && application.timeToResolutionMs != null && baselineTime > application.timeToResolutionMs) {
    const savedMinutes = Math.round((baselineTime - application.timeToResolutionMs) / 60000);
    if (savedMinutes > 0) {
      bullets.push(`Likely resolved about ${savedMinutes}m faster than your baseline`);
      score += 1;
    }
  }

  const shownMatches = matches.length;
  if (shownMatches > 0 && bullets.length === 0 && application.finalOutcome === "success") {
    bullets.push(`Used ${shownMatches} Fathippo suggestion${shownMatches === 1 ? "" : "s"} in this session`);
    score += 1;
  }

  if (bullets.length === 0) {
    return null;
  }

  const title = application.problem.length > 88 ? `${application.problem.slice(0, 85)}...` : application.problem;
  const status =
    application.finalOutcome === "failed" || application.finalOutcome === "abandoned"
      ? "warning"
      : score >= 4
        ? "positive"
        : "neutral";

  return { title, bullets: bullets.slice(0, 4), score, status };
}

export function isOpenClawAgentName(agentName: string | null | undefined): boolean {
  if (!agentName) {
    return false;
  }
  return /\bopenclaw\b|fathippo-context-engine/i.test(agentName);
}
