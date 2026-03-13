import { FatHippoError } from "@/lib/errors";

function flagEnabled(name: string): boolean {
  return process.env[name] === "true";
}

function allowlistedAgents(name: string): Set<string> {
  return new Set(
    (process.env[name] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function assertBenchmarkRunsEnabled(): void {
  if (!flagEnabled("COGNITIVE_ENABLE_BENCHMARK_RUNS")) {
    throw new FatHippoError("AUTH_FORBIDDEN", {
      feature: "cognitive_benchmark_runs",
      reason: "disabled",
    });
  }
}

export function assertSkillPublicationEnabled(): void {
  if (!flagEnabled("COGNITIVE_ENABLE_SKILL_PUBLICATION")) {
    throw new FatHippoError("AUTH_FORBIDDEN", {
      feature: "cognitive_skill_publication",
      reason: "disabled",
    });
  }
}

export function canManageGlobalCognitiveArtifacts(agentId: string): boolean {
  return allowlistedAgents("COGNITIVE_GLOBAL_ARTIFACT_AGENT_IDS").has(agentId);
}

export function assertGlobalCognitiveArtifactAccess(agentId: string): void {
  if (!canManageGlobalCognitiveArtifacts(agentId)) {
    throw new FatHippoError("AUTH_FORBIDDEN", {
      feature: "cognitive_global_artifacts",
      reason: "agent_not_allowlisted",
    });
  }
}
