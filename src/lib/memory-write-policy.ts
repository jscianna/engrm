import type { MemoryKind } from "@/lib/types";

export const KNOWN_MEMORY_TYPES = [
  "episodic",
  "semantic",
  "procedural",
  "self-model",
  "reflected",
  "session_summary",
  "compacted",
  "constraint",
  "identity",
  "relationship",
  "preference",
  "how_to",
  "fact",
  "event",
  "belief",
  "decision",
] as const satisfies readonly MemoryKind[];

export const SYSTEM_DERIVED_MEMORY_TYPES = [
  "session_summary",
  "compacted",
] as const satisfies readonly Extract<MemoryKind, "session_summary" | "compacted">[];

type SystemDerivedMemoryType = (typeof SYSTEM_DERIVED_MEMORY_TYPES)[number];

const KNOWN_MEMORY_TYPE_SET = new Set<string>(KNOWN_MEMORY_TYPES);
const SYSTEM_DERIVED_MEMORY_TYPE_SET = new Set<string>(SYSTEM_DERIVED_MEMORY_TYPES);

const TRANSPORT_METADATA_PATTERNS = [
  /^\[media attached/i,
  /^if you must inline, use media:/i,
  /^successfully wrote \d+ bytes/i,
  /^\/users\/clawdaddy\/\.openclaw\/media\/inbound/i,
  /^replied message/i,
];

const MCP_TRANSCRIPT_PATTERNS = [
  /^conversation info \(untrusted/i,
  /^sender \(untrusted/i,
  /^main agent should /i,
  /^prefer plugin-local binary/i,
  /^resolve pinned version/i,
  /^first attempt automatic local repair/i,
  /\bprepareSubagentSpawn\(\)/i,
  /\bmessage[_-]?id\b/i,
  /\bsession[_-]?key\b/i,
  /\bmcp_[a-z0-9_-]+\b/i,
  /\btoolresult\b/i,
];

const AUDIT_FRAGMENT_PATTERNS = [
  /^##\s+[A-Z]\)/m,
  /^config\/key sources$/im,
  /^-\s+\*\*(recommendation|current guarantee|no hot-reload contract exists|in-process config memoization)\*\*/im,
  /\b(?:audit|rollout checklist|postmortem|blast radius)\b/i,
];

const CODE_OR_LOG_PATTERNS = [
  /```/,
  /^(?:const|let|var|function|class|import|export)\b/m,
  /\b(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b/,
  /Traceback \(most recent call last\)/,
  /error:\s*\w+Error/i,
  /npm (?:ERR!|WARN)/,
  /at\s+\w+\s+\([^)]+:\d+:\d+\)/,
];

const TERMINAL_OUTPUT_PATTERNS = [
  /\bexec completed\b/i,
  /\bprocess exited\b/i,
  /\bcommand still running\b/i,
  /\bbuild completed\b/i,
  /\binspect:\s*https?:\/\//i,
  /\bproduction:\s*https?:\/\//i,
  /^\$\s+/m,
  /^>\s+/m,
];

const LOW_SIGNAL_OPERATIONAL_PATTERNS = [
  /\b(?:done|completed|finished)\b/i,
  /\b(?:openclaw|telegram|discord|message_id|sessionkey)\b/i,
  /\b(?:install flag|cli flag|command output|stack trace)\b/i,
  /\bswitched to a new branch\b/i,
];

const DURABLE_SIGNAL_PATTERNS = [
  /\b(?:always|never|preference|prefers?|preferred|wants?|likes?|avoids?|style|principle|policy|rule|workflow|process|constraint|thesis|strategy|roadmap|default|standard)\b/i,
  /\b(?:my name is|i am|i'm|call me|work(?:s)? at|partner at|timezone|complete sentences|concise updates)\b/i,
  /\b(?:must not|do not|don't|should not|oauth only|no api key mode)\b/i,
];

const DECISION_SIGNAL_PATTERNS = [
  /\b(?:decide|decided|decision|approved|rejected|chose|choose|selected|going with|settled on|standardized on|switched to|migrated to)\b/i,
  /\b(?:will use|won't use|instead of|from now on|final choice|finalized|locked in)\b/i,
  /\b(?:team agreed|we agreed)\b/i,
];

const TRANSFERABLE_SIGNAL_PATTERNS = [
  /\bfor all\b/i,
  /\bacross (?:all|users|routes|clients|sessions)\b/i,
  /\b(?:pattern|playbook|guideline|best practice|backstop|cannot bypass|reusable rule)\b/i,
  /\bwhen .* then\b/i,
  /\bif .* then\b/i,
];

const STABLE_PREFERENCE_PATTERNS = [
  /\b(?:john|user|i|we)\s+(?:prefer|prefers|want|wants|like|likes|avoid|avoids)\b/i,
  /\b(?:concise updates|complete sentences|oauth only|no api key mode)\b/i,
];

const IDENTITY_PATTERNS = [
  /\b(?:my name is|i am|i'm)\b/i,
  /\b(?:partner at|work(?:s)? at|timezone)\b/i,
];

export type MemoryWriteReasonCode =
  | "stored"
  | "rejected_empty"
  | "rejected_low_quality"
  | "rejected_hard_deny";

export type MemoryWritePolicyCode =
  | "accepted_multi_signal"
  | "accepted_decision_record"
  | "accepted_stable_preference"
  | "accepted_transferable_rule"
  | "accepted_system_derived"
  | "rejected_empty"
  | "rejected_transport_metadata"
  | "rejected_audit_fragment"
  | "rejected_code_blob"
  | "rejected_terminal_output"
  | "rejected_mcp_transcript_debris"
  | "rejected_low_signal";

export type MemoryWriteSignals = {
  durable: boolean;
  durableHits: number;
  decisional: boolean;
  decisionalHits: number;
  transferable: boolean;
  transferableHits: number;
  stablePreference: boolean;
  identity: boolean;
  score: number;
};

export type MemoryWriteFeatures = {
  length: number;
  lineCount: number;
  headingCount: number;
  bulletCount: number;
  tablePipeLines: number;
  jsonishCount: number;
  codeKeywordHits: number;
  pathHits: number;
  transportHits: number;
  auditHits: number;
  mcpHits: number;
  terminalHits: number;
  operationalHits: number;
  codeFenceCount: number;
};

export type MemoryWriteAssessment = {
  allow: boolean;
  reasonCode: MemoryWriteReasonCode;
  policyCode: MemoryWritePolicyCode;
  warning: string;
  matchedRules: string[];
  signals: MemoryWriteSignals;
  features: MemoryWriteFeatures;
  bypassed: boolean;
};

export class MemoryTypeValidationError extends Error {
  field: "memoryType";
  memoryType: string;
  reason: string;

  constructor(memoryType: string, reason: string) {
    super(reason);
    this.name = "MemoryTypeValidationError";
    this.field = "memoryType";
    this.memoryType = memoryType;
    this.reason = reason;
  }
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[\t ]+/g, " ")
    .trim()
    .slice(0, 10_000);
}

function countMatches(text: string, pattern: RegExp): number {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  return Array.from(text.matchAll(globalPattern)).length;
}

function countPatternHits(text: string, patterns: RegExp[]): number {
  return patterns.reduce((total, pattern) => total + Number(pattern.test(text)), 0);
}

function extractFeatures(text: string): MemoryWriteFeatures {
  return {
    length: text.length,
    lineCount: text ? text.split(/\r?\n/).length : 0,
    headingCount: countMatches(text, /^#{1,6}\s+/gm),
    bulletCount: countMatches(text, /^\s*[-*]\s+/gm),
    tablePipeLines: countMatches(text, /^\|.*\|\s*$/gm),
    jsonishCount: countMatches(text, /[{}\[\]":]{2,}/g),
    codeKeywordHits: countMatches(
      text,
      /\b(?:const|let|var|function|class|import|export|SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b/g,
    ),
    pathHits: countMatches(text, /(?:^|\s)(?:\/Users\/|\/[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+)/g),
    transportHits: countPatternHits(text, TRANSPORT_METADATA_PATTERNS),
    auditHits: countPatternHits(text, AUDIT_FRAGMENT_PATTERNS),
    mcpHits: countPatternHits(text, MCP_TRANSCRIPT_PATTERNS),
    terminalHits: countPatternHits(text, TERMINAL_OUTPUT_PATTERNS),
    operationalHits: countPatternHits(text, LOW_SIGNAL_OPERATIONAL_PATTERNS),
    codeFenceCount: countMatches(text, /```/g),
  };
}

function extractSignals(text: string): MemoryWriteSignals {
  const durableHits = countPatternHits(text, DURABLE_SIGNAL_PATTERNS);
  const decisionalHits = countPatternHits(text, DECISION_SIGNAL_PATTERNS);
  const transferableHits = countPatternHits(text, TRANSFERABLE_SIGNAL_PATTERNS);
  const durable = durableHits > 0;
  const decisional = decisionalHits > 0;
  const transferable = transferableHits > 0;

  return {
    durable,
    durableHits,
    decisional,
    decisionalHits,
    transferable,
    transferableHits,
    stablePreference: STABLE_PREFERENCE_PATTERNS.some((pattern) => pattern.test(text)),
    identity: IDENTITY_PATTERNS.some((pattern) => pattern.test(text)),
    score: Number(durable) + Number(decisional) + Number(transferable),
  };
}

function acceptedAssessment(
  policyCode: Extract<MemoryWritePolicyCode, `accepted_${string}`>,
  signals: MemoryWriteSignals,
  features: MemoryWriteFeatures,
  matchedRules: string[],
  bypassed = false,
): MemoryWriteAssessment {
  return {
    allow: true,
    reasonCode: "stored",
    policyCode,
    warning: "Memory accepted by quality policy",
    matchedRules,
    signals,
    features,
    bypassed,
  };
}

function rejectedAssessment(
  policyCode: Extract<MemoryWritePolicyCode, `rejected_${string}`>,
  warning: string,
  signals: MemoryWriteSignals,
  features: MemoryWriteFeatures,
  matchedRules: string[],
): MemoryWriteAssessment {
  const reasonCode =
    policyCode === "rejected_empty"
      ? "rejected_empty"
      : policyCode === "rejected_low_signal"
        ? "rejected_low_quality"
        : "rejected_hard_deny";

  return {
    allow: false,
    reasonCode,
    policyCode,
    warning,
    matchedRules,
    signals,
    features,
    bypassed: false,
  };
}

export function memoryTypeBypassesWritePolicy(memoryType?: string | null): boolean {
  return memoryType ? SYSTEM_DERIVED_MEMORY_TYPE_SET.has(memoryType) : false;
}

export function assessMemoryWritePolicy(
  rawText: string,
  options?: { memoryType?: string | null; allowSystemDerivedBypass?: boolean },
): MemoryWriteAssessment {
  const text = normalizeText(rawText);
  const features = extractFeatures(text);
  const signals = extractSignals(text);
  const matchedRules: string[] = [];

  if (!text) {
    matchedRules.push("empty_text");
    return rejectedAssessment(
      "rejected_empty",
      "Empty memory text",
      signals,
      features,
      matchedRules,
    );
  }

  if (
    options?.allowSystemDerivedBypass &&
    memoryTypeBypassesWritePolicy(options?.memoryType)
  ) {
    matchedRules.push(`system_derived:${options?.memoryType}`);
    return acceptedAssessment(
      "accepted_system_derived",
      signals,
      features,
      matchedRules,
      true,
    );
  }

  if (features.transportHits > 0 && signals.score < 3) {
    matchedRules.push("transport_metadata");
    return rejectedAssessment(
      "rejected_transport_metadata",
      "Rejected transport or attachment metadata",
      signals,
      features,
      matchedRules,
    );
  }

  if (features.mcpHits >= 3 || (features.mcpHits >= 2 && (features.pathHits > 0 || features.transportHits > 0))) {
    matchedRules.push("mcp_transcript_debris_hard_deny");
    return rejectedAssessment(
      "rejected_mcp_transcript_debris",
      "Rejected MCP or transcript debris",
      signals,
      features,
      matchedRules,
    );
  }

  if (
    (features.mcpHits >= 2 || (features.mcpHits >= 1 && (features.pathHits > 0 || features.lineCount > 4))) &&
    signals.score < 3
  ) {
    matchedRules.push("mcp_transcript_debris");
    return rejectedAssessment(
      "rejected_mcp_transcript_debris",
      "Rejected MCP or transcript debris",
      signals,
      features,
      matchedRules,
    );
  }

  if (
    (features.codeFenceCount >= 2 ||
      features.codeKeywordHits >= 6 ||
      features.jsonishCount >= 12 ||
      CODE_OR_LOG_PATTERNS.some((pattern) => pattern.test(text))) &&
    signals.score < 3
  ) {
    matchedRules.push("code_or_log_blob");
    return rejectedAssessment(
      "rejected_code_blob",
      "Rejected code or log blob",
      signals,
      features,
      matchedRules,
    );
  }

  if (
    features.auditHits > 0 &&
    (features.headingCount >= 2 ||
      features.bulletCount >= 6 ||
      features.tablePipeLines >= 2 ||
      features.lineCount >= 10) &&
    signals.score < 3
  ) {
    matchedRules.push("audit_fragment");
    return rejectedAssessment(
      "rejected_audit_fragment",
      "Rejected audit or report fragment",
      signals,
      features,
      matchedRules,
    );
  }

  if (
    features.terminalHits > 0 &&
    signals.score < 2 &&
    !signals.stablePreference &&
    !signals.identity
  ) {
    matchedRules.push("terminal_output");
    return rejectedAssessment(
      "rejected_terminal_output",
      "Rejected terminal or status output",
      signals,
      features,
      matchedRules,
    );
  }

  if (signals.score >= 2) {
    matchedRules.push("multi_signal_accept");
    return acceptedAssessment("accepted_multi_signal", signals, features, matchedRules);
  }

  if (signals.decisional && signals.decisionalHits >= 2) {
    matchedRules.push("decision_accept");
    return acceptedAssessment("accepted_decision_record", signals, features, matchedRules);
  }

  if (signals.stablePreference || (signals.identity && signals.durable)) {
    matchedRules.push("stable_preference_accept");
    return acceptedAssessment("accepted_stable_preference", signals, features, matchedRules);
  }

  if (signals.transferable && signals.transferableHits >= 1) {
    matchedRules.push("transferable_rule_accept");
    return acceptedAssessment("accepted_transferable_rule", signals, features, matchedRules);
  }

  if (features.operationalHits > 0 && features.length < 180) {
    matchedRules.push("short_operational_low_signal");
  } else {
    matchedRules.push("low_signal");
  }

  return rejectedAssessment(
    "rejected_low_signal",
    "Rejected low-signal or operational memory",
    signals,
    features,
    matchedRules,
  );
}

export class MemoryWritePolicyError extends Error {
  reasonCode: MemoryWriteReasonCode;
  policyCode: MemoryWritePolicyCode;
  matchedRules: string[];
  signals: MemoryWriteSignals;
  features: MemoryWriteFeatures;
  warning: string;

  constructor(assessment: MemoryWriteAssessment) {
    super(assessment.warning);
    this.name = "MemoryWritePolicyError";
    this.reasonCode = assessment.reasonCode;
    this.policyCode = assessment.policyCode;
    this.matchedRules = assessment.matchedRules;
    this.signals = assessment.signals;
    this.features = assessment.features;
    this.warning = assessment.warning;
  }
}

export function assertMemoryWriteAllowed(
  rawText: string,
  options?: { memoryType?: string | null; allowSystemDerivedBypass?: boolean },
): MemoryWriteAssessment {
  const assessment = assessMemoryWritePolicy(rawText, options);
  if (!assessment.allow) {
    throw new MemoryWritePolicyError(assessment);
  }
  return assessment;
}

export function isKnownMemoryType(memoryType?: string | null): memoryType is MemoryKind {
  return memoryType ? KNOWN_MEMORY_TYPE_SET.has(memoryType) : false;
}

export function isSystemDerivedMemoryType(
  memoryType?: string | null,
): memoryType is SystemDerivedMemoryType {
  return memoryType ? SYSTEM_DERIVED_MEMORY_TYPE_SET.has(memoryType) : false;
}

export function isClientWritableMemoryType(memoryType?: string | null): memoryType is MemoryKind {
  return isKnownMemoryType(memoryType) && !isSystemDerivedMemoryType(memoryType);
}

export function assertKnownMemoryType(memoryType?: string | null): void {
  if (!memoryType) {
    return;
  }

  if (!isKnownMemoryType(memoryType)) {
    throw new MemoryTypeValidationError(
      memoryType,
      `Unsupported memoryType '${memoryType}'`,
    );
  }
}

export function assertClientWritableMemoryType(memoryType?: string | null): void {
  if (!memoryType) {
    return;
  }

  assertKnownMemoryType(memoryType);
  if (isSystemDerivedMemoryType(memoryType)) {
    throw new MemoryTypeValidationError(
      memoryType,
      `memoryType '${memoryType}' is reserved for internal system-generated memories`,
    );
  }
}

export function assertSystemDerivedBypassAllowed(
  memoryType?: string | null,
  allowSystemDerivedBypass = false,
): void {
  if (isSystemDerivedMemoryType(memoryType) && !allowSystemDerivedBypass) {
    throw new MemoryTypeValidationError(
      memoryType,
      `memoryType '${memoryType}' is reserved for internal system-generated memories`,
    );
  }
}
