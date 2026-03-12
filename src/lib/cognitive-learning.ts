import crypto from "node:crypto";

export type LearningTrace = {
  id: string;
  userId: string;
  type: string;
  problem: string;
  reasoning: string;
  solution: string | null;
  outcome: string;
  outcomeSource?: "heuristic" | "tool" | "explicit";
  outcomeConfidence?: number;
  context: {
    technologies?: string[];
    errorMessages?: string[];
  };
  automatedSignals?: Record<string, unknown>;
  sharedSignature: string | null;
  shareEligible: boolean;
  embedding?: number[] | null;
};

export type ClusteredTraceGroup = {
  key: string;
  scope: "local" | "global";
  userId: string | null;
  domain: string;
  traces: LearningTrace[];
  successRate: number;
  sharedSignature: string | null;
};

export type ExtractedPatternCandidate = {
  key: string;
  scope: "local" | "global";
  userId: string | null;
  domain: string;
  trigger: {
    keywords: string[];
    technologies?: string[];
    errorPatterns?: string[];
    problemTypes?: string[];
  };
  approach: string;
  steps: string[];
  pitfalls: string[];
  confidence: number;
  successCount: number;
  failCount: number;
  sourceTraceIds: string[];
  sourceTraceCount: number;
};

export type SharedPatternContent = {
  trigger: {
    keywords?: string[];
    technologies?: string[];
    errorPatterns?: string[];
    problemTypes?: string[];
  };
  approach: string;
  steps: string[];
  pitfalls: string[];
};

export type SkillDraft = {
  name: string;
  description: string;
  markdown: string;
};

export type PatternEvidenceSummary = {
  successCount: number;
  failCount: number;
  confidence: number;
  effectiveEvidence: number;
};

export type BaselineSnapshot = {
  successRate: number;
  medianTimeToResolutionMs: number | null;
  medianRetries: number | null;
  verificationPassRate: number;
  sampleSize: number;
};

export type ImpactObservation = {
  accepted: boolean;
  explicitNegative?: boolean;
  finalOutcome?: string | null;
  timeToResolutionMs?: number | null;
  retryCount?: number | null;
  verificationPassed?: boolean;
  baseline?: BaselineSnapshot | null;
};

export type EntityImpactSummary = {
  applications: number;
  acceptedApplications: number;
  successfulApplications: number;
  medianTimeToResolutionMs: number | null;
  medianRetries: number | null;
  verificationPassRate: number;
  impactScore: number;
  promotionReason: string;
};

export type PatternLifecycleStatus =
  | "candidate"
  | "active_local"
  | "active_org"
  | "active_global"
  | "synthesized_local"
  | "synthesized_org"
  | "synthesized_global"
  | "deprecated";

export type SkillLifecycleStatus = "draft" | "active" | "stale" | "deprecated";

export type AdaptivePolicyKey =
  | "balanced_default"
  | "trace_first"
  | "pattern_first"
  | "skill_first";

export type AdaptivePolicySection =
  | "local_patterns"
  | "global_patterns"
  | "traces"
  | "skills";

export type AdaptivePolicyFeatures = {
  endpoint: string;
  repoFamily: string | null;
  workspaceType: string | null;
  projectType: string | null;
  technologies: string[];
  problemClasses: string[];
};

export type AdaptivePolicyObservation = ImpactObservation & {
  acceptedEntity?: boolean;
  materializedEntity?: boolean;
};

export type AdaptivePolicyStat = {
  policyKey: AdaptivePolicyKey;
  contextKey: string;
  sampleCount: number;
  resolvedCount: number;
  successCount: number;
  verifiedSuccessCount: number;
  acceptedCount: number;
  avgReward: number;
  avgRetries: number | null;
  avgTimeToResolutionMs: number | null;
};

export type AdaptivePolicyRecommendation = {
  key: AdaptivePolicyKey;
  contextKey: string;
  traceLimit: number;
  patternLimit: number;
  skillLimit: number;
  sectionOrder: AdaptivePolicySection[];
  rationale: string;
  exploration: boolean;
  score: number;
  features: AdaptivePolicyFeatures;
};

type TraceEvidenceScore = {
  positive: number;
  negative: number;
  rationale: string;
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "agent",
  "also",
  "because",
  "build",
  "code",
  "debug",
  "error",
  "failed",
  "file",
  "from",
  "have",
  "into",
  "issue",
  "just",
  "need",
  "problem",
  "still",
  "that",
  "their",
  "there",
  "these",
  "this",
  "trace",
  "using",
  "with",
  "work",
]);

const SHARED_PROBLEM_CLASSES = [
  "auth",
  "middleware",
  "build",
  "test",
  "lint",
  "routing",
  "render",
  "schema",
  "migration",
  "query",
  "database",
  "vector",
  "embedding",
  "config",
  "deploy",
  "permission",
  "timeout",
  "session",
  "api",
  "cache",
  "state",
  "validation",
] as const;

const SHARED_TECH_FAMILIES: Array<{ pattern: RegExp; family: string }> = [
  { pattern: /\bnext(js)?\b/, family: "nextjs" },
  { pattern: /\breact\b/, family: "react" },
  { pattern: /\btypescript|ts\b/, family: "typescript" },
  { pattern: /\bjavascript|node(js)?\b/, family: "nodejs" },
  { pattern: /\bpython|pytest|django|flask\b/, family: "python" },
  { pattern: /\bpostgres|postgresql|sql\b/, family: "sql-database" },
  { pattern: /\bmysql|mariadb\b/, family: "sql-database" },
  { pattern: /\bsqlite|libsql|turso\b/, family: "sqlite-family" },
  { pattern: /\bprisma|drizzle|typeorm\b/, family: "orm" },
  { pattern: /\bredis\b/, family: "cache" },
  { pattern: /\bdocker|container|compose\b/, family: "container" },
  { pattern: /\bkubernetes|k8s\b/, family: "orchestration" },
  { pattern: /\bclerk|auth0|oauth|jwt\b/, family: "auth" },
  { pattern: /\bopenai|anthropic|llm|embedding|vector|qdrant|pinecone\b/, family: "ai-retrieval" },
  { pattern: /\bwebpack|vite|babel|rollup|esbuild\b/, family: "bundler" },
  { pattern: /\bjest|vitest|playwright|cypress\b/, family: "test-framework" },
];

const URL_PATTERN = /\bhttps?:\/\/[^\s]+/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const FILE_PATH_PATTERN = /(?:\/[\w.-]+)+(?:\.\w+)?/g;
const SECRET_PATTERN = /\b(?:sk|rk|pk|ghp|ghu|github_pat|xoxb|xoxp|AIza)[-_A-Za-z0-9]{8,}\b/g;
const LONG_IDENTIFIER_PATTERN = /\b[a-f0-9]{24,}\b/gi;

const ADAPTIVE_POLICY_DEFINITIONS: Record<
  AdaptivePolicyKey,
  {
    label: string;
    traceLimitDelta: number;
    patternLimit: number;
    skillLimit: number;
    sectionOrder: AdaptivePolicySection[];
    priorReward: number;
  }
> = {
  balanced_default: {
    label: "Balanced",
    traceLimitDelta: 0,
    patternLimit: 5,
    skillLimit: 3,
    sectionOrder: ["local_patterns", "global_patterns", "traces", "skills"],
    priorReward: 0.08,
  },
  trace_first: {
    label: "Trace First",
    traceLimitDelta: 2,
    patternLimit: 4,
    skillLimit: 2,
    sectionOrder: ["traces", "local_patterns", "global_patterns", "skills"],
    priorReward: 0.04,
  },
  pattern_first: {
    label: "Pattern First",
    traceLimitDelta: -1,
    patternLimit: 6,
    skillLimit: 2,
    sectionOrder: ["local_patterns", "global_patterns", "traces", "skills"],
    priorReward: 0.05,
  },
  skill_first: {
    label: "Skill First",
    traceLimitDelta: -1,
    patternLimit: 4,
    skillLimit: 4,
    sectionOrder: ["skills", "local_patterns", "global_patterns", "traces"],
    priorReward: 0.03,
  },
};

export function normalizeForFingerprint(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`"'.,:;()[\]{}<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractProblemKeywords(problem: string, limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const token of normalizeForFingerprint(problem).split(/\s+/)) {
    if (token.length < 4 || STOP_WORDS.has(token)) {
      continue;
    }
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([token]) => token);
}

export function getAdaptivePolicyDefinition(key: AdaptivePolicyKey) {
  return ADAPTIVE_POLICY_DEFINITIONS[key];
}

export function buildAdaptivePolicyFeatures(params: {
  problem: string;
  endpoint?: string;
  technologies?: string[];
  repoProfile?: Record<string, unknown> | null;
}): AdaptivePolicyFeatures {
  const repoProfile = params.repoProfile ?? {};
  const repoFamily =
    typeof repoProfile.repoFamily === "string" && repoProfile.repoFamily.trim()
      ? normalizeForFingerprint(repoProfile.repoFamily)
      : typeof repoProfile.workspaceRoot === "string" && repoProfile.workspaceRoot.trim()
        ? normalizeForFingerprint(repoProfile.workspaceRoot.split(/[\\/]/).filter(Boolean).slice(-2).join("/"))
        : null;
  const workspaceType =
    typeof repoProfile.workspaceType === "string" && repoProfile.workspaceType.trim()
      ? normalizeForFingerprint(repoProfile.workspaceType)
      : null;
  const projectType =
    typeof repoProfile.projectType === "string" && repoProfile.projectType.trim()
      ? normalizeForFingerprint(repoProfile.projectType)
      : null;

  return {
    endpoint: normalizeForFingerprint(params.endpoint ?? "context-engine"),
    repoFamily,
    workspaceType,
    projectType,
    technologies: coarsenSharedTechnologies(params.technologies).slice(0, 4),
    problemClasses: extractSharedProblemClasses(params.problem, 4),
  };
}

export function buildAdaptivePolicyContextKey(features: AdaptivePolicyFeatures): string {
  return [
    features.endpoint,
    features.repoFamily ?? "",
    features.workspaceType ?? "",
    features.projectType ?? "",
    features.problemClasses.join("+"),
    features.technologies.join("+"),
  ]
    .filter(Boolean)
    .join(":");
}

function deterministicPolicyIndex(seed: string, mod: number): number {
  if (mod <= 1) {
    return 0;
  }
  const digest = crypto.createHash("sha256").update(seed).digest();
  return digest.readUInt32BE(0) % mod;
}

export function computeAdaptivePolicyReward(observation: AdaptivePolicyObservation): number | null {
  if (!observation.finalOutcome) {
    return null;
  }

  let score = 0;
  if (observation.acceptedEntity) {
    score += 0.12;
  }
  if (observation.materializedEntity) {
    score += 0.08;
  }
  if (observation.finalOutcome === "success") {
    score += 0.45;
  } else if (observation.finalOutcome === "failed" || observation.finalOutcome === "abandoned") {
    score -= 0.45;
  }
  if (observation.verificationPassed === true) {
    score += 0.2;
  } else if (observation.verificationPassed === false) {
    score -= 0.2;
  }
  if (observation.explicitNegative) {
    score -= 0.25;
  }
  if (observation.baseline?.medianRetries != null && observation.retryCount != null) {
    const retryDelta = (observation.baseline.medianRetries - observation.retryCount) / Math.max(1, observation.baseline.medianRetries);
    score += clamp(retryDelta, -1, 1) * 0.1;
  }
  if (observation.baseline?.medianTimeToResolutionMs != null && observation.timeToResolutionMs != null) {
    const timeDelta =
      (observation.baseline.medianTimeToResolutionMs - observation.timeToResolutionMs) /
      Math.max(1, observation.baseline.medianTimeToResolutionMs);
    score += clamp(timeDelta, -1, 1) * 0.1;
  }
  return clamp(score, -1, 1);
}

export function recommendAdaptivePolicy(params: {
  features: AdaptivePolicyFeatures;
  baseTraceLimit?: number;
  contextStats?: AdaptivePolicyStat[];
  globalStats?: AdaptivePolicyStat[];
}): AdaptivePolicyRecommendation {
  const contextKey = buildAdaptivePolicyContextKey(params.features);
  const baseTraceLimit = clamp(Math.round(params.baseTraceLimit ?? 3), 2, 8);
  const policies = Object.keys(ADAPTIVE_POLICY_DEFINITIONS) as AdaptivePolicyKey[];
  const byContext = new Map((params.contextStats ?? []).map((stat) => [stat.policyKey, stat] as const));
  const byGlobal = new Map((params.globalStats ?? []).map((stat) => [stat.policyKey, stat] as const));

  const totalObservedSamples = policies.reduce((total, key) => {
    const contextStat = byContext.get(key);
    const globalStat = byGlobal.get(key);
    return total + (contextStat?.sampleCount ?? 0) + (globalStat?.sampleCount ?? 0);
  }, 0);
  const unseenPolicies = policies.filter((key) => {
    const contextStat = byContext.get(key);
    const globalStat = byGlobal.get(key);
    return (contextStat?.sampleCount ?? 0) + (globalStat?.sampleCount ?? 0) === 0;
  });

  if (totalObservedSamples === 0 && unseenPolicies.length > 0) {
    const key = unseenPolicies[deterministicPolicyIndex(contextKey, unseenPolicies.length)];
    const definition = ADAPTIVE_POLICY_DEFINITIONS[key];
    return {
      key,
      contextKey,
      traceLimit: clamp(baseTraceLimit + definition.traceLimitDelta, 2, 8),
      patternLimit: definition.patternLimit,
      skillLimit: definition.skillLimit,
      sectionOrder: definition.sectionOrder,
      rationale: "exploring_unseen_safe_policy",
      exploration: true,
      score: definition.priorReward,
      features: params.features,
    };
  }

  const totalSamples = totalObservedSamples;

  let bestKey: AdaptivePolicyKey = "balanced_default";
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestRationale = "fallback_balanced";

  for (const key of policies) {
    const definition = ADAPTIVE_POLICY_DEFINITIONS[key];
    const contextStat = byContext.get(key);
    const globalStat = byGlobal.get(key);
    const contextualWeight = (contextStat?.sampleCount ?? 0) >= 2 ? 0.7 : 0.35;
    const contextReward = contextStat?.avgReward ?? definition.priorReward;
    const globalReward = globalStat?.avgReward ?? definition.priorReward;
    const blendedReward =
      contextReward * contextualWeight +
      globalReward * (1 - contextualWeight) +
      definition.priorReward * 0.1;
    const effectiveSamples =
      (contextStat?.sampleCount ?? 0) * contextualWeight +
      (globalStat?.sampleCount ?? 0) * (1 - contextualWeight);
    const explorationBonus = Math.sqrt((2 * Math.log(totalSamples + policies.length + 1)) / (effectiveSamples + 1));

    let score = blendedReward + explorationBonus * 0.18;
    let rationale = "best_verified_recent_reward";

    if (params.features.problemClasses.includes("test") || params.features.problemClasses.includes("build") || params.features.problemClasses.includes("lint")) {
      if (key === "trace_first") {
        score += 0.03;
        rationale = "verification_heavy_problem_prefers_more_traces";
      }
    }
    if (params.features.problemClasses.includes("auth") || params.features.problemClasses.includes("config") || params.features.problemClasses.includes("migration")) {
      if (key === "pattern_first") {
        score += 0.025;
        rationale = "repeatable_bug_family_prefers_patterns";
      }
    }
    if (params.features.workspaceType === "web-app" && key === "skill_first" && (globalStat?.verifiedSuccessCount ?? 0) > 0) {
      score += 0.02;
      rationale = "verified_skill_usage_in_similar_workspace";
    }

    if (score > bestScore) {
      bestKey = key;
      bestScore = score;
      bestRationale = rationale;
    }
  }

  const bestDefinition = ADAPTIVE_POLICY_DEFINITIONS[bestKey];
  return {
    key: bestKey,
    contextKey,
    traceLimit: clamp(baseTraceLimit + bestDefinition.traceLimitDelta, 2, 8),
    patternLimit: bestDefinition.patternLimit,
    skillLimit: bestDefinition.skillLimit,
    sectionOrder: bestDefinition.sectionOrder,
    rationale: bestRationale,
    exploration: false,
    score: bestScore,
    features: params.features,
  };
}

export function extractSharedProblemClasses(problem: string, limit = 4): string[] {
  const normalized = normalizeForFingerprint(problem);
  const matches = SHARED_PROBLEM_CLASSES.filter((token) => normalized.includes(token));
  return matches.slice(0, limit);
}

export function coarsenSharedTechnologies(technologies?: string[]): string[] {
  const families = new Set<string>();
  for (const technology of technologies ?? []) {
    const normalized = normalizeForFingerprint(technology);
    const match = SHARED_TECH_FAMILIES.find((candidate) => candidate.pattern.test(normalized));
    if (match) {
      families.add(match.family);
    }
  }
  return Array.from(families).sort().slice(0, 4);
}

export function buildSharedSignature(params: {
  type: string;
  problem: string;
  technologies?: string[];
  errorMessages?: string[];
}): string {
  const technologies = coarsenSharedTechnologies(params.technologies);
  const problemClasses = extractSharedProblemClasses(params.problem, 4);
  const errorSignature = coarsenSharedErrorFamily(params.errorMessages?.[0] ?? "");
  const parts = [
    normalizeForFingerprint(params.type),
    technologies.join(","),
    problemClasses.join(","),
    errorSignature,
  ].filter(Boolean);

  return crypto.createHash("sha1").update(parts.join("|")).digest("hex");
}

export function normalizeErrorPattern(errorMessage: string): string {
  const normalized = normalizeForFingerprint(errorMessage);
  if (!normalized) {
    return "";
  }

  const match = normalized.match(/^(typeerror|referenceerror|syntaxerror|cannot [a-z0-9_]+|failed to [a-z0-9_]+)/);
  return match?.[1] ?? normalized.split(" ").slice(0, 4).join(" ");
}

export function coarsenSharedErrorFamily(errorMessage: string): string {
  const normalized = normalizeErrorPattern(errorMessage);
  if (!normalized) {
    return "";
  }
  if (normalized.startsWith("typeerror")) {
    return "typeerror";
  }
  if (normalized.startsWith("referenceerror")) {
    return "referenceerror";
  }
  if (normalized.startsWith("syntaxerror")) {
    return "syntaxerror";
  }
  if (normalized.includes("module") || normalized.includes("import")) {
    return "module-resolution";
  }
  if (normalized.includes("timeout")) {
    return "timeout";
  }
  if (normalized.includes("auth") || normalized.includes("session") || normalized.includes("token")) {
    return "auth";
  }
  if (normalized.includes("permission") || normalized.includes("forbidden") || normalized.includes("unauthorized")) {
    return "permission";
  }
  if (normalized.includes("schema") || normalized.includes("migration")) {
    return "schema";
  }
  if (normalized.includes("query") || normalized.includes("sql")) {
    return "query";
  }
  if (normalized.includes("build")) {
    return "build";
  }
  if (normalized.includes("test")) {
    return "test";
  }
  if (normalized.includes("cannot ")) {
    return "runtime";
  }
  if (normalized.includes("failed to ")) {
    return "operation-failed";
  }
  return normalized.split(" ").slice(0, 2).join(" ");
}

export function redactSharedText(value: string): string {
  return value
    .replace(URL_PATTERN, "[url]")
    .replace(EMAIL_PATTERN, "[email]")
    .replace(FILE_PATH_PATTERN, "[path]")
    .replace(SECRET_PATTERN, "[secret]")
    .replace(LONG_IDENTIFIER_PATTERN, "[id]")
    .replace(/\s+/g, " ")
    .trim();
}

export function redactSharedPatternContent(params: {
  trigger: SharedPatternContent["trigger"];
  approach: string;
  steps?: string[];
  pitfalls?: string[];
}): SharedPatternContent {
  return {
    trigger: {
      keywords: (params.trigger.keywords ?? [])
        .map((keyword) => redactSharedText(keyword))
        .filter(Boolean)
        .slice(0, 8),
      technologies: (params.trigger.technologies ?? [])
        .map((technology) => redactSharedText(technology))
        .filter(Boolean)
        .slice(0, 6),
      errorPatterns: (params.trigger.errorPatterns ?? [])
        .map((pattern) => redactSharedText(pattern))
        .filter(Boolean)
        .slice(0, 6),
      problemTypes: (params.trigger.problemTypes ?? []).slice(0, 6),
    },
    approach: redactSharedText(params.approach).slice(0, 1000),
    steps: (params.steps ?? []).map((step) => redactSharedText(step)).filter(Boolean).slice(0, 5),
    pitfalls: (params.pitfalls ?? []).map((pitfall) => redactSharedText(pitfall)).filter(Boolean).slice(0, 5),
  };
}

export function cosineSimilarity(left: number[] | null | undefined, right: number[] | null | undefined): number {
  if (!left || !right || left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  const magnitude = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  return magnitude === 0 ? 0 : dot / magnitude;
}

export function clusterLearningTraces(params: {
  traces: LearningTrace[];
  scope: "local" | "global";
  similarityThreshold?: number;
}): ClusteredTraceGroup[] {
  const similarityThreshold = params.similarityThreshold ?? 0.82;
  const clusters: Array<{
    key: string;
    scope: "local" | "global";
    userId: string | null;
    domain: string;
    sharedSignature: string | null;
    traces: LearningTrace[];
    centroid: number[] | null;
  }> = [];

  for (const trace of params.traces) {
    const domain = detectDomain(trace);
    const traceSignature = trace.sharedSignature ?? buildSharedSignature({
      type: trace.type,
      problem: trace.problem,
      technologies: trace.context.technologies,
      errorMessages: trace.context.errorMessages,
    });
    const existing = clusters.find((cluster) => {
      if (cluster.domain !== domain) {
        return false;
      }
      if (cluster.scope !== params.scope) {
        return false;
      }
      if (params.scope === "local" && cluster.userId !== trace.userId) {
        return false;
      }
      if (cluster.sharedSignature && cluster.sharedSignature === traceSignature) {
        return true;
      }
      if (!cluster.centroid || !trace.embedding) {
        return false;
      }
      return cosineSimilarity(cluster.centroid, trace.embedding) >= similarityThreshold;
    });

    if (existing) {
      existing.traces.push(trace);
      existing.centroid = recalculateCentroid(existing.traces);
      continue;
    }

    clusters.push({
      key: `${params.scope}:${trace.userId}:${domain}:${traceSignature}`,
      scope: params.scope,
      userId: params.scope === "local" ? trace.userId : null,
      domain,
      sharedSignature: traceSignature,
      traces: [trace],
      centroid: trace.embedding ?? null,
    });
  }

  return clusters.map((cluster) => {
    const evidence = cluster.traces.map(scoreTraceEvidence);
    const positive = evidence.reduce((total, item) => total + item.positive, 0);
    const negative = evidence.reduce((total, item) => total + item.negative, 0);
    return {
      key: cluster.key,
      scope: cluster.scope,
      userId: cluster.userId,
      domain: cluster.domain,
      traces: cluster.traces,
      successRate: positive + negative === 0 ? 0 : positive / (positive + negative),
      sharedSignature: cluster.sharedSignature,
    };
  });
}

function recalculateCentroid(traces: LearningTrace[]): number[] | null {
  const vectors = traces.map((trace) => trace.embedding).filter((value): value is number[] => Array.isArray(value) && value.length > 0);
  if (vectors.length === 0) {
    return null;
  }

  const dimension = vectors[0].length;
  const sum = new Array<number>(dimension).fill(0);
  for (const vector of vectors) {
    for (let index = 0; index < dimension; index += 1) {
      sum[index] += vector[index];
    }
  }

  return sum.map((value) => value / vectors.length);
}

export function extractPatternCandidate(cluster: ClusteredTraceGroup): ExtractedPatternCandidate | null {
  const scoredTraces = cluster.traces.map((trace) => ({
    trace,
    evidence: scoreTraceEvidence(trace),
  }));
  const positiveTraces = scoredTraces
    .filter(({ trace, evidence }) => evidence.positive >= 0.65 || (trace.outcome === "success" && evidence.positive >= evidence.negative))
    .sort((left, right) => right.evidence.positive - left.evidence.positive);
  if (positiveTraces.length === 0) {
    return null;
  }

  const weightedPositive = scoredTraces.reduce((total, item) => total + item.evidence.positive, 0);
  const weightedNegative = scoredTraces.reduce((total, item) => total + item.evidence.negative, 0);
  const failCount = scoredTraces.filter(({ trace, evidence }) => evidence.negative > evidence.positive || trace.outcome === "failed").length;
  const approachSource = positiveTraces
    .map(({ trace }) => trace.solution?.trim() || trace.reasoning.trim())
    .find(Boolean);
  if (!approachSource) {
    return null;
  }

  const keywords =
    cluster.scope === "global"
      ? mergeCommonValues(cluster.traces.flatMap((trace) => extractSharedProblemClasses(trace.problem, 4)))
      : mergeCommonKeywords(cluster.traces.map((trace) => extractProblemKeywords(trace.problem, 8)));
  const technologies =
    cluster.scope === "global"
      ? mergeCommonValues(cluster.traces.flatMap((trace) => coarsenSharedTechnologies(trace.context.technologies)))
      : mergeCommonValues(cluster.traces.flatMap((trace) => trace.context.technologies ?? []));
  const errorPatterns = mergeCommonValues(
    cluster.traces
      .flatMap((trace) => trace.context.errorMessages ?? [])
      .map((error) => (cluster.scope === "global" ? coarsenSharedErrorFamily(error) : normalizeErrorPattern(error)))
      .filter(Boolean),
  );
  const steps = summarizeStepsFromText(approachSource);
  const pitfalls = derivePitfalls(scoredTraces);
  const successCount = positiveTraces.length;
  const confidence =
    weightedPositive + weightedNegative === 0
      ? cluster.successRate
      : weightedPositive / (weightedPositive + weightedNegative);

  return {
    key: cluster.scope === "global" ? `global:${cluster.sharedSignature ?? cluster.key}` : `local:${cluster.userId}:${cluster.sharedSignature ?? cluster.key}`,
    scope: cluster.scope,
    userId: cluster.scope === "local" ? cluster.userId : null,
    domain: cluster.domain,
    trigger: {
      keywords,
      technologies: technologies.length > 0 ? technologies : undefined,
      errorPatterns: errorPatterns.length > 0 ? errorPatterns : undefined,
      problemTypes: mergeCommonValues(cluster.traces.map((trace) => trace.type)),
    },
    approach: approachSource.slice(0, 1000),
    steps,
    pitfalls,
    confidence,
    successCount,
    failCount,
    sourceTraceIds: cluster.traces.map((trace) => trace.id),
    sourceTraceCount: cluster.traces.length,
  };
}

function mergeCommonKeywords(groups: string[][]): string[] {
  const counts = new Map<string, number>();
  for (const group of groups) {
    for (const keyword of new Set(group)) {
      counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([keyword]) => keyword);
}

function mergeCommonValues(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values.map((item) => normalizeForFingerprint(item)).filter(Boolean)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([value]) => value);
}

function summarizeStepsFromText(text: string): string[] {
  return text
    .split(/\n+|\. /)
    .map((part) => part.trim())
    .filter((part) => part.length >= 15)
    .slice(0, 5);
}

function derivePitfalls(
  traces: Array<{ trace: LearningTrace; evidence: TraceEvidenceScore }>,
): string[] {
  const failures = traces
    .filter(({ trace, evidence }) => trace.outcome === "failed" || evidence.negative > evidence.positive)
    .sort((left, right) => right.evidence.negative - left.evidence.negative);
  const snippets = failures
    .map(({ trace, evidence }) => (trace.context.errorMessages ?? [])[0] ?? evidence.rationale ?? trace.reasoning.slice(0, 180))
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(snippets)).slice(0, 3);
}

function detectDomain(trace: LearningTrace): string {
  const technologies = trace.context.technologies ?? [];
  if (technologies.length > 0) {
    return technologies[0];
  }
  return normalizeForFingerprint(trace.type || "general") || "general";
}

export function buildSkillDraft(params: {
  patternId: string;
  domain: string;
  trigger: { keywords?: string[]; technologies?: string[]; errorPatterns?: string[] };
  approach: string;
  steps?: string[];
  pitfalls?: string[];
  confidence: number;
}): SkillDraft {
  const name = `${params.domain || "general"}-${(params.trigger.keywords ?? ["workflow"]).slice(0, 2).join("-")}`
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const description = `Synthesized troubleshooting skill for ${params.domain} issues with ${Math.round(params.confidence * 100)}% confidence.`;
  const procedure = (params.steps && params.steps.length > 0 ? params.steps : summarizeStepsFromText(params.approach)).slice(0, 5);
  const pitfalls = (params.pitfalls ?? []).slice(0, 5);
  const triggerWords = (params.trigger.keywords ?? []).slice(0, 6);
  const technologies = (params.trigger.technologies ?? []).slice(0, 6);

  const markdown = [
    `# ${name}`,
    "",
    description,
    "",
    "## When to use",
    triggerWords.length > 0 || technologies.length > 0
      ? `Use this when the problem mentions ${[...triggerWords, ...technologies].join(", ")}.`
      : `Use this for recurring ${params.domain} issues.`,
    "",
    "## Procedure",
    ...(procedure.length > 0 ? procedure.map((step) => `- ${step}`) : [`- ${params.approach}`]),
    "",
    "## Common pitfalls",
    ...(pitfalls.length > 0 ? pitfalls.map((pitfall) => `- ${pitfall}`) : ["- Do not assume the first failing symptom is the root cause."]),
    "",
    "## Verification",
    "- Re-run the failing command, test, or workflow that originally exposed the issue.",
  ].join("\n");

  return {
    name,
    description,
    markdown,
  };
}

export function resolveOutcome(params: {
  explicitOutcome?: string | null;
  automatedOutcome?: string | null;
  heuristicOutcome?: string | null;
}): { outcome: string; source: "explicit" | "tool" | "heuristic"; confidence: number } {
  if (params.explicitOutcome) {
    return { outcome: params.explicitOutcome, source: "explicit", confidence: 1 };
  }
  if (params.automatedOutcome) {
    return { outcome: params.automatedOutcome, source: "tool", confidence: 0.9 };
  }
  return {
    outcome: params.heuristicOutcome ?? "partial",
    source: "heuristic",
    confidence: 0.55,
  };
}

export function summarizePatternEvidence(traces: LearningTrace[]): PatternEvidenceSummary {
  const evidence = traces.map((trace) => ({
    trace,
    score: scoreTraceEvidence(trace),
  }));

  const successCount = evidence.filter(
    ({ trace, score }) =>
      score.positive >= 0.65 || (trace.outcome === "success" && score.positive >= score.negative),
  ).length;
  const failCount = evidence.filter(
    ({ trace, score }) =>
      score.negative > score.positive && (score.negative >= 0.55 || trace.outcome === "failed"),
  ).length;
  const weightedPositive = evidence.reduce((total, item) => total + item.score.positive, 0);
  const weightedNegative = evidence.reduce((total, item) => total + item.score.negative, 0);
  const effectiveEvidence = weightedPositive + weightedNegative;
  const confidence = effectiveEvidence === 0 ? 0 : weightedPositive / effectiveEvidence;

  return {
    successCount,
    failCount,
    confidence,
    effectiveEvidence,
  };
}

export function classifyPatternStatus(params: {
  effectiveEvidence: number;
  confidence: number;
  scope?: "local" | "global" | "org";
  activationEvidence?: number;
  activationConfidence?: number;
  deprecationConfidence?: number;
}): PatternLifecycleStatus {
  const activationEvidence = params.activationEvidence ?? 2.5;
  const activationConfidence = params.activationConfidence ?? 0.7;
  const deprecationConfidence = params.deprecationConfidence ?? 0.4;

  if (params.effectiveEvidence >= activationEvidence && params.confidence >= activationConfidence) {
    if (params.scope === "global") {
      return "active_global";
    }
    if (params.scope === "org") {
      return "active_org";
    }
    return "active_local";
  }
  if (params.effectiveEvidence >= activationEvidence && params.confidence < deprecationConfidence) {
    return "deprecated";
  }
  return "candidate";
}

export function synthesizedPatternStatus(scope: "local" | "global" | "org"): PatternLifecycleStatus {
  if (scope === "global") {
    return "synthesized_global";
  }
  if (scope === "org") {
    return "synthesized_org";
  }
  return "synthesized_local";
}

export function isInjectablePatternStatus(status: string): boolean {
  return (
    status === "active_local" ||
    status === "active_org" ||
    status === "active_global" ||
    status === "synthesized_local" ||
    status === "synthesized_org" ||
    status === "synthesized_global"
  );
}

export function isActivePatternStatus(status: string): boolean {
  return status === "active_local" || status === "active_org" || status === "active_global";
}

export function isSkillSynthesisEligible(params: {
  status: string;
  confidence: number;
  successCount: number;
  failCount: number;
  minConfidence?: number;
  minSuccesses?: number;
}): boolean {
  const minConfidence = params.minConfidence ?? 0.8;
  const minSuccesses = params.minSuccesses ?? 5;
  return (
    (
      params.status === "active_local" ||
      params.status === "synthesized_local" ||
      params.status === "active_global" ||
      params.status === "synthesized_global"
    ) &&
    params.confidence >= minConfidence &&
    params.successCount >= minSuccesses
  );
}

export function deriveSkillStatus(params: {
  patternStatus: string;
  confidence: number;
  minConfidence?: number;
}): SkillLifecycleStatus {
  const minConfidence = params.minConfidence ?? 0.8;
  if (params.patternStatus === "deprecated") {
    return "stale";
  }
  if (!isInjectablePatternStatus(params.patternStatus) || params.confidence < minConfidence) {
    return "draft";
  }
  return "active";
}

export function isInjectableSkillStatus(status: string): boolean {
  return status === "active";
}

export function scoreTraceEvidence(trace: LearningTrace): TraceEvidenceScore {
  const signals = trace.automatedSignals ?? {};
  const testPassed = nestedCount(signals, "testSignals", "passed");
  const testFailed = nestedCount(signals, "testSignals", "failed");
  const buildPassed = nestedCount(signals, "buildSignals", "passed");
  const buildFailed = nestedCount(signals, "buildSignals", "failed");
  const lintPassed = nestedCount(signals, "lintSignals", "passed");
  const lintFailed = nestedCount(signals, "lintSignals", "failed");
  const installPassed = nestedCount(signals, "installSignals", "passed");
  const installFailed = nestedCount(signals, "installSignals", "failed");
  const runPassed = nestedCount(signals, "runSignals", "passed");
  const runFailed = nestedCount(signals, "runSignals", "failed");
  const commandsSucceeded = numericValue(signals.commandsSucceeded);
  const commandsFailed = numericValue(signals.commandsFailed);
  const hadToolErrors = booleanValue(signals.hadToolErrors);
  const strongestSuccess = stringValue(signals.strongestSuccess);
  const strongestFailure = stringValue(signals.strongestFailure);
  const baseConfidence =
    typeof trace.outcomeConfidence === "number"
      ? clamp(trace.outcomeConfidence, 0.35, 1)
      : trace.outcomeSource === "explicit"
        ? 1
        : trace.outcomeSource === "tool"
          ? 0.9
          : 0.55;

  let positive = 0;
  let negative = 0;
  let rationale = trace.outcome;

  if (testPassed > 0) {
    positive = Math.max(positive, 1);
    rationale = "tests_passed";
  }
  if (buildPassed > 0) {
    positive = Math.max(positive, 0.95);
    rationale = rationale === trace.outcome ? "build_succeeded" : rationale;
  }
  if (lintPassed > 0) {
    positive = Math.max(positive, 0.88);
    rationale = rationale === trace.outcome ? "lint_passed" : rationale;
  }
  if (installPassed > 0) {
    positive = Math.max(positive, 0.74);
    rationale = rationale === trace.outcome ? "install_succeeded" : rationale;
  }
  if (runPassed > 0) {
    positive = Math.max(positive, 0.76);
    rationale = rationale === trace.outcome ? "command_succeeded" : rationale;
  }
  if (commandsSucceeded > 0) {
    positive = Math.max(positive, 0.7);
  }
  if (strongestSuccess) {
    positive = Math.max(positive, 0.68);
  }

  if (testFailed > 0) {
    negative = Math.max(negative, 1);
    rationale = "tests_failed";
  }
  if (buildFailed > 0) {
    negative = Math.max(negative, 0.97);
    rationale = rationale === trace.outcome ? "build_failed" : rationale;
  }
  if (lintFailed > 0) {
    negative = Math.max(negative, 0.9);
    rationale = rationale === trace.outcome ? "lint_failed" : rationale;
  }
  if (installFailed > 0) {
    negative = Math.max(negative, 0.82);
    rationale = rationale === trace.outcome ? "install_failed" : rationale;
  }
  if (runFailed > 0) {
    negative = Math.max(negative, 0.84);
    rationale = rationale === trace.outcome ? "command_failed" : rationale;
  }
  if (commandsFailed > 0) {
    negative = Math.max(negative, 0.84);
  }
  if (hadToolErrors) {
    negative = Math.max(negative, 0.8);
  }
  if (strongestFailure) {
    negative = Math.max(negative, 0.78);
  }

  if (trace.outcome === "success") {
    positive = Math.max(positive, baseConfidence);
  } else if (trace.outcome === "failed" || trace.outcome === "abandoned") {
    negative = Math.max(negative, baseConfidence);
  } else if (trace.outcome === "partial") {
    positive = Math.max(positive, Math.min(0.55, baseConfidence * 0.75));
    negative = Math.max(negative, Math.min(0.55, baseConfidence * 0.75));
  }

  if (positive === 0 && negative === 0) {
    if (trace.outcome === "success") {
      positive = 0.55;
    } else if (trace.outcome === "failed" || trace.outcome === "abandoned") {
      negative = 0.55;
    } else {
      positive = 0.35;
      negative = 0.35;
    }
  }

  return { positive, negative, rationale };
}

function nestedCount(value: Record<string, unknown>, key: string, nestedKey: string): number {
  const nested = value[key];
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
    return 0;
  }
  return numericValue((nested as Record<string, unknown>)[nestedKey]);
}

function numericValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function summarizeEntityImpact(observations: ImpactObservation[]): EntityImpactSummary {
  const applications = observations.length;
  if (applications === 0) {
    return {
      applications: 0,
      acceptedApplications: 0,
      successfulApplications: 0,
      medianTimeToResolutionMs: null,
      medianRetries: null,
      verificationPassRate: 0,
      impactScore: 0,
      promotionReason: "no_attribution_data",
    };
  }

  const acceptedApplications = observations.filter((observation) => observation.accepted).length;
  const successfulApplications = observations.filter((observation) => observation.finalOutcome === "success").length;
  const resolvedDurations = observations
    .map((observation) => observation.timeToResolutionMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const resolvedRetries = observations
    .map((observation) => observation.retryCount)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const verificationOutcomes = observations.filter((observation) => observation.verificationPassed != null);
  const verificationPassRate =
    verificationOutcomes.length === 0
      ? 0
      : verificationOutcomes.filter((observation) => observation.verificationPassed).length / verificationOutcomes.length;

  const impactScore =
    observations.reduce((total, observation) => {
      let score = 0;
      if (observation.accepted) {
        score += 0.15;
      }
      if (observation.finalOutcome === "success") {
        score += 0.45;
      } else if (observation.finalOutcome === "failed" || observation.finalOutcome === "abandoned") {
        score -= 0.45;
      }
      if (observation.verificationPassed === true) {
        score += 0.2;
      } else if (observation.verificationPassed === false) {
        score -= 0.2;
      }
      if (observation.explicitNegative) {
        score -= 0.25;
      }
      if (observation.baseline?.medianRetries != null && observation.retryCount != null) {
        const retryDelta = (observation.baseline.medianRetries - observation.retryCount) / Math.max(1, observation.baseline.medianRetries);
        score += clamp(retryDelta, -1, 1) * 0.1;
      }
      if (observation.baseline?.medianTimeToResolutionMs != null && observation.timeToResolutionMs != null) {
        const timeDelta =
          (observation.baseline.medianTimeToResolutionMs - observation.timeToResolutionMs) /
          Math.max(1, observation.baseline.medianTimeToResolutionMs);
        score += clamp(timeDelta, -1, 1) * 0.1;
      }
      return total + clamp(score, -1, 1);
    }, 0) / applications;

  let promotionReason = "insufficient_impact_data";
  if (impactScore >= 0.2 && verificationPassRate >= 0.65 && successfulApplications >= Math.max(2, Math.ceil(applications * 0.6))) {
    promotionReason = "verified_outcomes_above_baseline";
  } else if (impactScore <= -0.05 || verificationPassRate < 0.35) {
    promotionReason = "negative_or_unverified_recent_outcomes";
  } else if (acceptedApplications === 0) {
    promotionReason = "shown_but_not_accepted";
  }

  return {
    applications,
    acceptedApplications,
    successfulApplications,
    medianTimeToResolutionMs: median(resolvedDurations),
    medianRetries: median(resolvedRetries),
    verificationPassRate,
    impactScore,
    promotionReason,
  };
}

export function classifyPatternLifecycle(params: {
  scope: "local" | "global" | "org";
  effectiveEvidence: number;
  confidence: number;
  impact: EntityImpactSummary;
}): PatternLifecycleStatus {
  const evidenceReady = params.effectiveEvidence >= 2.5 && params.confidence >= 0.7;
  const impactReady =
    params.impact.applications >= 2 &&
    params.impact.successfulApplications >= 1 &&
    params.impact.impactScore >= 0.05 &&
    params.impact.verificationPassRate >= 0.5;

  if (evidenceReady && impactReady) {
    if (params.scope === "global") {
      return "active_global";
    }
    if (params.scope === "org") {
      return "active_org";
    }
    return "active_local";
  }
  if (
    params.impact.applications >= 3 &&
    (params.impact.impactScore <= -0.05 || params.impact.verificationPassRate < 0.35)
  ) {
    return "deprecated";
  }
  return "candidate";
}

export function deriveSkillLifecycle(params: {
  patternStatus: string;
  confidence: number;
  impact: EntityImpactSummary;
  minConfidence?: number;
}): SkillLifecycleStatus {
  const minConfidence = params.minConfidence ?? 0.8;
  if (params.patternStatus === "deprecated") {
    return "stale";
  }
  if (
    !isInjectablePatternStatus(params.patternStatus) ||
    params.confidence < minConfidence ||
    params.impact.acceptedApplications < 3 ||
    params.impact.successfulApplications < 3 ||
    params.impact.impactScore < 0.1 ||
    params.impact.verificationPassRate < 0.6
  ) {
    return params.impact.applications >= 3 && params.impact.impactScore < 0 ? "stale" : "draft";
  }
  return "active";
}
