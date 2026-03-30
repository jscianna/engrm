import { scoreMemory, type ScoringResult } from "@/lib/memory-heuristics";
import type { MemoryImportanceTier, MemoryKind } from "@/lib/types";

type MemoryRole = "user" | "assistant" | "tool" | "toolresult" | "system" | string;

export type MemoryCaptureAssessment = {
  keep: boolean;
  finalScore: number;
  reason:
    | "accepted"
    | "noise"
    | "artifact"
    | "role_disallowed"
    | "assistant_not_explicit"
    | "below_threshold";
  scoringResult: ScoringResult;
};

export type InjectableMemory = {
  id: string;
  text: string;
  memoryType: MemoryKind;
  importanceTier: MemoryImportanceTier;
  durabilityClass?: string;
  feedbackScore?: number;
  accessCount?: number;
  metadata?: Record<string, unknown> | null;
};

export type RankedInjectableMemory<T extends InjectableMemory = InjectableMemory> = {
  memory: T;
  score: number;
};

const NOISE_PATTERNS = [
  /^```[\s\S]{0,50}```$/,
  /^\s*$/,
  /^(ok|okay|thanks|thx|ty|np|no problem|sure|yep|yes|no|maybe)\.?$/i,
  /^[\d\s./-]+$/,
  /^https?:\/\/\S+$/,
];

const ARTIFACT_PATTERNS = [
  /npm (ERR!|WARN)/,
  /error:\s*\w+Error/i,
  /Traceback \(most recent call last\)/,
  /^\s*\^\s*$/m,
  /^warning:/im,
  /^error:/im,
  /^Successfully (wrote|created|deleted|moved|copied|replaced|updated)\s+\d+/i,
  /^Successfully replaced text in\s/i,
  /^\d+ bytes? (written|saved|copied)/i,
  /^Command exited with code \d+/i,
  /^Process (started|stopped|completed|exited)/i,
  /<<<BEGIN_UNTRUSTED/i,
  /\[media attached:/i,
  /^\s*\{\s*"(status|error|result|data|accepted|childSession)":/i,
  /^\s*\[\s*\{/,
  /^st\.(subheader|write|markdown|header|sidebar|columns|tabs)\s*\(/,
];

const CODE_PATTERNS = [
  /^(?:const|let|var|function|class|interface|type|import|export|return|async|await)\s/,
  /^(?:if|else|for|while|switch|try|catch|throw)\s*[\({]/,
  /=>\s*\{/,
  /\.\w+\([^)]*\)/,
  /(?:===?|!==?|&&|\|\|)\s/,
  /^\s*(?:\/\/|\/\*|\*)/,
  /`\$\{/,
];

const SYSTEM_METADATA_PATTERNS = [
  /^\[?\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/,
  /\bsession_(?:key|id):\s/i,
  /\bOpenClaw\s+runtime/i,
  /\bsubagent\b.*\btask\b/i,
  /\bHEARTBEAT_OK\b/,
  /\bExec\s+(?:completed|failed)\b/i,
  /\bforward\s+(?:this|the)\s+(?:report|message|result)\b/i,
];

const DURABLE_SIGNAL_PATTERNS = [
  /\b(?:remember|don't forget|keep in mind|important)\b/i,
  /\b(?:always|never|must|must not|should|should not|cannot|can't)\b/i,
  /\b(?:we|i)\s+(?:decided|choose|chose|prefer|preferred|switched|migrated)\b/i,
  /\b(?:actually|correction|i meant|not .+ but)\b/i,
  /\b(?:root cause|resolved by|fix was|workaround is|solution is)\b/i,
  /\b(?:configured|set to|uses|using|namespace is|workspace is|endpoint is|base url is|mode is)\b/i,
  /\b(?:my name is|call me|i am|i'm in|timezone is)\b/i,
  /\b(?:workflow is|process is|the steps are|before you|start by)\b/i,
];

const ASSISTANT_EXPLICIT_PATTERNS = [
  /\b(?:we decided|i decided|we chose|i chose)\b/i,
  /\b(?:root cause|resolved by|fix was|workaround is|solution is)\b/i,
  /\b(?:policy is|rule is|default is|standard is)\b/i,
  /\b(?:configured|set to|migrated to|switched to|namespace is|workspace is|mode is)\b/i,
  /\b(?:remember this|don't forget)\b/i,
];

const TRANSIENT_STATUS_PATTERNS = [
  /\b(?:i can|i'll|let me|i am going to|i'm going to|working on|checking|trying|looking into)\b/i,
  /\b(?:report back|follow up|circle back|take a look)\b/i,
  /\b(?:might|maybe|probably|perhaps|could)\b/i,
];

const CONFIG_FACT_PATTERNS = [
  /\b(?:namespace|workspace|endpoint|base url|mode|runtime|repo|project|plugin|branch)\b.*\b(?:is|are|set to|configured|using|uses|now)\b/i,
  /\b(?:we(?:'re| are)?|i(?:'m| am)?)\s+using\b/i,
];

const DECLARATIVE_FACT_PATTERNS = [
  /\b(?:is|are|was|were|uses|using|set to|configured|named|called|runs on|lives in|located in)\b/i,
];

const STABLE_MEMORY_TYPES = new Set<MemoryKind>([
  "constraint",
  "identity",
  "preference",
  "how_to",
  "decision",
  "procedural",
  "self-model",
]);

function baseEmptyScoringResult(): ScoringResult {
  return {
    score: 0,
    type: "fact",
    signals: [],
    entities: [],
    shouldStore: false,
    breakdown: {
      explicit: 0,
      entityDensity: 0,
      emotional: 0,
      decision: 0,
      correction: 0,
      temporal: 0,
      causal: 0,
      completion: 0,
      context: 0,
      typeMultiplier: 0,
    },
  };
}

function alphaRatio(content: string): number {
  return (content.match(/[a-zA-Z]/g)?.length ?? 0) / Math.max(content.length, 1);
}

function looksLikeNoise(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < 12) {
    return true;
  }
  return NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function looksLikeArtifact(content: string): boolean {
  if (ARTIFACT_PATTERNS.some((pattern) => pattern.test(content))) {
    return true;
  }
  if (CODE_PATTERNS.some((pattern) => pattern.test(content.trim()))) {
    return true;
  }
  if (SYSTEM_METADATA_PATTERNS.some((pattern) => pattern.test(content))) {
    return true;
  }
  if (/^\s*[\[{]/.test(content) && /[\]}]\s*$/.test(content)) {
    return true;
  }
  return alphaRatio(content) < 0.45;
}

function hasDurableSignal(content: string): boolean {
  return DURABLE_SIGNAL_PATTERNS.some((pattern) => pattern.test(content));
}

function hasAssistantExplicitSignal(content: string): boolean {
  return ASSISTANT_EXPLICIT_PATTERNS.some((pattern) => pattern.test(content));
}

function looksTransientStatus(content: string): boolean {
  return TRANSIENT_STATUS_PATTERNS.some((pattern) => pattern.test(content));
}

function buildCaptureAssessment(
  content: string,
  role: MemoryRole,
  minScore: number,
  requireAssistantExplicit: boolean,
): MemoryCaptureAssessment {
  if (role === "tool" || role === "toolresult" || role === "system") {
    return {
      keep: false,
      finalScore: 0,
      reason: "role_disallowed",
      scoringResult: baseEmptyScoringResult(),
    };
  }

  if (looksLikeNoise(content)) {
    return {
      keep: false,
      finalScore: 0,
      reason: "noise",
      scoringResult: baseEmptyScoringResult(),
    };
  }

  if (looksLikeArtifact(content)) {
    return {
      keep: false,
      finalScore: 0,
      reason: "artifact",
      scoringResult: baseEmptyScoringResult(),
    };
  }

  const scoringResult = scoreMemory(content);
  const durableSignal = hasDurableSignal(content);
  const configFact = CONFIG_FACT_PATTERNS.some((pattern) => pattern.test(content));
  const assistantExplicit = !requireAssistantExplicit || hasAssistantExplicitSignal(content);
  const stableType =
    scoringResult.type === "constraint" ||
    scoringResult.type === "identity" ||
    scoringResult.type === "preference" ||
    scoringResult.type === "how_to";

  let finalScore = scoringResult.score;
  if (durableSignal) {
    finalScore += 1.1;
  }
  if (configFact) {
    finalScore += 3.1;
  }
  if (stableType) {
    finalScore += 0.8;
  }
  if (scoringResult.signals.includes("correction")) {
    finalScore += 0.6;
  }
  if (scoringResult.signals.includes("decision")) {
    finalScore += 0.5;
  }
  if (looksTransientStatus(content)) {
    finalScore -= 1.5;
  }
  if (content.length < 28) {
    finalScore -= 0.4;
  }

  if (role === "assistant" && !assistantExplicit) {
    return {
      keep: false,
      finalScore,
      reason: "assistant_not_explicit",
      scoringResult,
    };
  }

  const keep = (durableSignal || stableType || scoringResult.shouldStore) && finalScore >= minScore;
  return {
    keep,
    finalScore,
    reason: keep ? "accepted" : "below_threshold",
    scoringResult,
  };
}

function captureMetadataQualityScore(metadata: Record<string, unknown> | null | undefined): number | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const capture = metadata.capture;
  if (!capture || typeof capture !== "object" || Array.isArray(capture)) {
    return null;
  }
  const qualityScore = (capture as Record<string, unknown>).qualityScore;
  return typeof qualityScore === "number" && Number.isFinite(qualityScore) ? qualityScore : null;
}

export function evaluateAutoMemoryCandidate(
  content: string,
  role: MemoryRole,
): MemoryCaptureAssessment {
  return buildCaptureAssessment(content, role, role === "assistant" ? 7.8 : 6.25, true);
}

export function evaluateExplicitMemoryCandidate(content: string): MemoryCaptureAssessment {
  const assessment = buildCaptureAssessment(content, "user", 4.25, false);
  if (assessment.keep) {
    return assessment;
  }

  const declarativeFact = DECLARATIVE_FACT_PATTERNS.some((pattern) => pattern.test(content));
  if (
    assessment.reason === "below_threshold" &&
    declarativeFact &&
    content.trim().length >= 24 &&
    alphaRatio(content) >= 0.5
  ) {
    return {
      ...assessment,
      keep: true,
      reason: "accepted",
    };
  }

  return assessment;
}

export function deriveImportanceTierFromQuality(
  content: string,
  finalScore: number,
  scoringResult: ScoringResult,
): MemoryImportanceTier {
  const criticalConstraint =
    scoringResult.type === "constraint" &&
    /\b(?:must|must not|never|always|cannot|can't|required|critical)\b/i.test(content);

  if (criticalConstraint && finalScore >= 8.2) {
    return "critical";
  }
  if (finalScore >= 8.8) {
    return "critical";
  }
  if (finalScore >= 7.2) {
    return "high";
  }
  return "normal";
}

export function scoreMemoryForInjection(
  memory: InjectableMemory,
  options: { temporalQuery?: boolean } = {},
): number {
  const heuristics = scoreMemory(memory.text);
  const metadataCaptureScore = captureMetadataQualityScore(memory.metadata);

  let score = heuristics.score / 10;

  switch (memory.importanceTier) {
    case "critical":
      score += 0.85;
      break;
    case "high":
      score += 0.45;
      break;
    case "working":
      score += 0.3;
      break;
    default:
      score += 0.15;
      break;
  }

  switch (memory.durabilityClass) {
    case "durable":
      score += 0.35;
      break;
    case "working":
      score += 0.15;
      break;
    case "ephemeral":
      score -= 0.2;
      break;
    default:
      break;
  }

  if (STABLE_MEMORY_TYPES.has(memory.memoryType)) {
    score += 0.2;
  }

  if (memory.memoryType === "event" && !options.temporalQuery) {
    score -= 0.2;
  }

  if (metadataCaptureScore !== null) {
    score += Math.max(-0.25, Math.min(0.4, (metadataCaptureScore - 6.5) * 0.12));
  }

  score += Math.max(-0.25, Math.min(0.35, (memory.feedbackScore ?? 0) * 0.12));
  score += Math.min(memory.accessCount ?? 0, 10) * 0.03;

  if (hasDurableSignal(memory.text)) {
    score += 0.25;
  }
  if (looksTransientStatus(memory.text)) {
    score -= 0.45;
  }
  if (looksLikeArtifact(memory.text)) {
    score -= 0.9;
  }

  return Math.max(0, Math.min(3, score));
}

export function rankMemoriesForInjection<T extends InjectableMemory>(
  memories: T[],
  options: { temporalQuery?: boolean; minScore?: number } = {},
): RankedInjectableMemory<T>[] {
  const ranked = memories
    .map((memory, index) => ({
      memory,
      score: scoreMemoryForInjection(memory, options) + Math.max(0, 0.12 - index * 0.01),
    }))
    .sort((left, right) => right.score - left.score);

  const minScore = options.minScore ?? 0.95;
  const filtered = ranked.filter((item) => item.score >= minScore);
  if (filtered.length > 0) {
    return filtered;
  }

  return ranked.slice(0, Math.min(3, ranked.length));
}
