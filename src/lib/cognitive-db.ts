import crypto from "node:crypto";
import type { Client } from "@libsql/client";
import { getDb } from "@/lib/turso";
import { embedText } from "@/lib/embeddings";
import {
  buildAdaptivePolicyContextKey,
  buildAdaptivePolicyFeatures,
  buildSharedSignature,
  buildToolWorkflowContextKey,
  classifyObservedToolWorkflow,
  computeAdaptivePolicyReward,
  buildSkillDraft,
  classifyPatternLifecycle,
  recommendAdaptivePolicy,
  recommendToolWorkflow,
  deriveSkillLifecycle,
  clusterLearningTraces,
  redactSharedPatternContent,
  extractPatternCandidate,
  extractProblemKeywords,
  isInjectablePatternStatus,
  isInjectableSkillStatus,
  isSkillSynthesisEligible,
  normalizeForFingerprint,
  resolveOutcome,
  scoreTraceEvidence,
  synthesizedPatternStatus,
  summarizeEntityImpact,
  summarizePatternEvidence,
  type AdaptivePolicyKey,
  type AdaptivePolicyRecommendation,
  type BaselineSnapshot,
  type ImpactObservation,
  type LearningTrace,
  type ToolWorkflowRecommendation,
  type ToolWorkflowStrategyKey,
} from "@/lib/cognitive-learning";

export interface CodingTrace {
  id: string;
  userId: string;
  sessionId: string;
  timestamp: string;
  type: string;
  problem: string;
  contextJson: string;
  reasoning: string;
  approachesJson: string;
  solution: string | null;
  outcome: string;
  outcomeSource: "heuristic" | "tool" | "explicit";
  outcomeConfidence: number;
  automatedSignalsJson: string;
  errorMessage: string | null;
  toolsUsedJson: string;
  filesModifiedJson: string;
  durationMs: number;
  sanitized: boolean;
  sanitizedAt: string | null;
  shareEligible: boolean;
  sharedSignature: string | null;
  traceHash: string;
  embeddingJson: string | null;
  explicitFeedbackNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CognitiveApplication {
  id: string;
  userId: string;
  sessionId: string;
  traceId: string | null;
  problem: string;
  endpoint: string;
  repoProfileJson: string | null;
  materializedPatternId: string | null;
  materializedSkillId: string | null;
  policyKey: AdaptivePolicyKey | null;
  policyContextKey: string | null;
  policySnapshotJson: string | null;
  policyReward: number | null;
  workflowStrategyKey: ToolWorkflowStrategyKey | null;
  workflowContextKey: string | null;
  workflowSnapshotJson: string | null;
  workflowObservedKey: ToolWorkflowStrategyKey | null;
  workflowReward: number | null;
  retryCount: number | null;
  baselineGroupKey: string | null;
  baselineSnapshotJson: string | null;
  acceptedTraceId: string | null;
  acceptedPatternId: string | null;
  acceptedSkillId: string | null;
  finalOutcome: string | null;
  timeToResolutionMs: number | null;
  verificationSummaryJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdaptivePolicySummary {
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
}

export interface ToolWorkflowSummary {
  strategyKey: ToolWorkflowStrategyKey;
  contextKey: string;
  sampleCount: number;
  resolvedCount: number;
  successCount: number;
  verifiedSuccessCount: number;
  avgReward: number;
}

export interface ApplicationMatch {
  id: string;
  applicationId: string;
  userId: string;
  sessionId: string;
  traceId: string | null;
  entityType: "trace" | "pattern" | "skill";
  entityId: string;
  entityScope: "local" | "global" | "org";
  rank: number;
  accepted: boolean;
  finalOutcome: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Pattern {
  id: string;
  userId: string | null;
  scope: "local" | "global" | "org";
  orgId: string | null;
  sourcePatternId: string | null;
  provenanceJson: string;
  patternKey: string;
  sharedSignature: string | null;
  domain: string;
  triggerJson: string;
  approach: string;
  stepsJson: string | null;
  pitfallsJson: string | null;
  confidence: number;
  successCount: number;
  failCount: number;
  sourceTraceCount: number;
  lastApplied: string | null;
  sourceTraceIdsJson: string;
  applicationCount: number;
  acceptedApplicationCount: number;
  successfulApplicationCount: number;
  medianTimeToResolutionMs: number | null;
  medianRetries: number | null;
  verificationPassRate: number;
  impactScore: number;
  promotionReason: string | null;
  status: string;
  synthesizedIntoSkill: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TracePatternMatch {
  id: string;
  userId: string;
  traceId: string;
  patternId: string;
  score: number;
  matchSource: string;
  explicitOutcome?: "success" | "failure" | null;
  feedbackNotes?: string | null;
  createdAt: string;
}

export interface SynthesizedSkill {
  id: string;
  userId: string | null;
  scope: "local" | "global";
  patternId: string;
  patternKey: string;
  name: string;
  description: string;
  markdown: string;
  contentJson: string;
  qualityScore: number;
  usageCount: number;
  successRate: number;
  acceptedApplicationCount: number;
  successfulApplicationCount: number;
  medianTimeToResolutionMs: number | null;
  medianRetries: number | null;
  verificationPassRate: number;
  impactScore: number;
  promotionReason: string | null;
  status: string;
  published: boolean;
  publishedTo: string | null;
  clawHubId: string | null;
  sourceTraceCount: number;
  sourcePatternIdsJson: string;
  sourceTraceIdsJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface CognitiveJobLease {
  jobName: string;
  leaseToken: string;
  leaseExpiresAt: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  checkpointJson?: string | null;
}

export interface CognitiveOrgMembership {
  userId: string;
  orgId: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface CognitiveOrgPolicy {
  orgId: string;
  orgPatternSharingEnabled: boolean;
  globalContributionEnabled: boolean;
  updatedAt: string;
}

export interface CreateTraceInput {
  userId: string;
  sessionId: string;
  type: string;
  problem: string;
  context: Record<string, unknown>;
  reasoning: string;
  approaches: Array<Record<string, unknown>>;
  solution?: string;
  outcome?: string;
  heuristicOutcome?: string;
  automatedOutcome?: string | null;
  automatedSignals?: Record<string, unknown>;
  errorMessage?: string;
  toolsUsed: string[];
  filesModified: string[];
  durationMs: number;
  sanitized: boolean;
  sanitizedAt?: string;
  shareEligible?: boolean;
  explicitFeedbackNotes?: string | null;
  applicationId?: string | null;
}

export interface CreatePatternInput {
  userId?: string | null;
  scope?: "local" | "global" | "org";
  orgId?: string | null;
  sourcePatternId?: string | null;
  provenance?: Record<string, unknown>;
  patternKey?: string;
  sharedSignature?: string | null;
  domain: string;
  trigger: Record<string, unknown>;
  approach: string;
  steps?: string[];
  pitfalls?: string[];
  confidence: number;
  successCount: number;
  failCount: number;
  sourceTraceIds: string[];
  sourceTraceCount?: number;
  status?: string;
}

export interface ApplicationEntityInput {
  id: string;
  scope: "local" | "global" | "org";
  rank: number;
}

export interface RetrievalEvalDatasetRecord {
  applicationId: string;
  sessionId: string;
  endpoint: string;
  labelSource: "explicit" | "weak";
  fixture: {
    applicationId: string;
    sessionId: string;
    endpoint: string;
    problem: string;
    technologies: string[];
    repoProfile?: Record<string, unknown>;
    expectedTraceIds: string[];
    expectedPatternIds: string[];
    expectedSkillIds: string[];
    acceptedId?: string;
    expectedOutcome?: "success" | "partial" | "failed" | "abandoned";
    maxRetries?: number;
    targetResolutionKind?: "tests_passed" | "build_passed" | "lint_passed" | "manual_only" | "failed";
    baseline?: BaselineSnapshot;
  };
  prediction: {
    applicationId: string;
    sessionId: string;
    policyKey?: AdaptivePolicyKey;
    policyContextKey?: string;
    workflowStrategyKey?: ToolWorkflowStrategyKey;
    workflowContextKey?: string;
    traces: Array<{ id: string }>;
    patterns: Array<{ id: string }>;
    skills: Array<{ id: string }>;
    finalOutcome?: "success" | "partial" | "failed" | "abandoned";
    acceptedTraceId?: string;
    acceptedPatternId?: string;
    acceptedSkillId?: string;
    retryCount?: number;
    timeToResolutionMs?: number;
    verificationResults?: {
      verified: boolean;
      resolutionKind?: "tests_passed" | "build_passed" | "lint_passed" | "manual_only" | "failed";
      passedChecks?: string[];
      failedChecks?: string[];
    };
  };
}

export interface RetrievalEvalDataset {
  fixtures: RetrievalEvalDatasetRecord["fixture"][];
  predictions: RetrievalEvalDatasetRecord["prediction"][];
  records: RetrievalEvalDatasetRecord[];
}

export interface CognitiveUserSettings {
  userId: string;
  sharedLearningEnabled: boolean;
  benchmarkInclusionEnabled: boolean;
  traceRetentionDays: number;
  updatedAt: string;
}

export interface CognitivePrivacyExport {
  exportedAt: string;
  settings: CognitiveUserSettings;
  traces: CodingTrace[];
  applications: Array<{
    application: CognitiveApplication;
    matches: ApplicationMatch[];
  }>;
  patterns: Pattern[];
  skills: SynthesizedSkill[];
  benchmarkRuns: Array<{
    id: string;
    dataset: string;
    fixtureCount: number;
    result: Record<string, unknown>;
    gate: Record<string, unknown> | null;
    createdAt: string;
  }>;
}

export interface CognitiveDataDeletionResult {
  deletedAt: string;
  tracesDeleted: number;
  applicationsDeleted: number;
  patternMatchesDeleted: number;
  applicationMatchesDeleted: number;
  localPatternsDeleted: number;
  localSkillsDeleted: number;
  benchmarkRunsDeleted: number;
  settingsDeleted: number;
  sharedLearningRevoked: boolean;
  globalPatternsRefreshed: number;
  globalSkillsRefreshed: number;
}

export interface CognitiveRetentionCleanupResult {
  cleanedAt: string;
  usersProcessed: number;
  tracesDeleted: number;
  applicationsDeleted: number;
  patternMatchesDeleted: number;
  applicationMatchesDeleted: number;
  benchmarkRunsDeleted: number;
  localPatternsDeleted: number;
  localSkillsDeleted: number;
  globalPatternsRefreshed: number;
  globalSkillsRefreshed: number;
}

let initialized = false;

async function ensureCognitiveIndexes(client: Client): Promise<void> {
  const statements = [
    `CREATE INDEX IF NOT EXISTS idx_traces_user ON coding_traces(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_traces_user_type ON coding_traces(user_id, type)`,
    `CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON coding_traces(timestamp DESC)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_traces_user_hash ON coding_traces(user_id, trace_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_traces_shared_signature ON coding_traces(shared_signature)`,
    `CREATE INDEX IF NOT EXISTS idx_patterns_user ON cognitive_patterns(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_patterns_org ON cognitive_patterns(org_id, scope, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_patterns_domain ON cognitive_patterns(domain)`,
    `CREATE INDEX IF NOT EXISTS idx_patterns_status ON cognitive_patterns(status)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_patterns_key ON cognitive_patterns(pattern_key)`,
    `CREATE INDEX IF NOT EXISTS idx_cognitive_org_memberships_org ON cognitive_org_memberships(org_id, role, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_trace_pattern_matches_trace ON trace_pattern_matches(trace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_trace_pattern_matches_pattern ON trace_pattern_matches(pattern_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_trace_pattern_matches ON trace_pattern_matches(trace_id, pattern_id)`,
    `CREATE INDEX IF NOT EXISTS idx_skills_user_scope ON synthesized_skills(user_id, scope)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_skills_pattern_key ON synthesized_skills(pattern_key)`,
    `CREATE INDEX IF NOT EXISTS idx_cognitive_applications_user ON cognitive_applications(user_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_cognitive_applications_session ON cognitive_applications(session_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_cognitive_applications_baseline ON cognitive_applications(user_id, baseline_group_key, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_pattern_applications_application ON pattern_applications(application_id, rank ASC)`,
    `CREATE INDEX IF NOT EXISTS idx_pattern_applications_entity ON pattern_applications(entity_type, entity_id, updated_at DESC)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_pattern_applications ON pattern_applications(application_id, entity_type, entity_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cognitive_benchmark_runs_user ON cognitive_benchmark_runs(user_id, created_at DESC)`,
  ];

  for (const statement of statements) {
    await client.execute(statement).catch(() => {});
  }
}

async function ensureInitialized(): Promise<void> {
  if (initialized) {
    return;
  }

  const client = getDb();
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS coding_traces (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      problem TEXT NOT NULL,
      context_json TEXT NOT NULL,
      reasoning TEXT NOT NULL,
      approaches_json TEXT NOT NULL,
      solution TEXT,
      outcome TEXT NOT NULL DEFAULT 'partial',
      error_message TEXT,
      tools_used_json TEXT NOT NULL,
      files_modified_json TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      sanitized INTEGER NOT NULL DEFAULT 0,
      sanitized_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      embedding F32_BLOB(384),
      embedding_json TEXT,
      trace_hash TEXT,
      outcome_source TEXT NOT NULL DEFAULT 'heuristic',
      outcome_confidence REAL NOT NULL DEFAULT 0.55,
      automated_signals_json TEXT NOT NULL DEFAULT '{}',
      share_eligible INTEGER NOT NULL DEFAULT 0,
      shared_signature TEXT,
      explicit_feedback_notes TEXT
    );

    CREATE TABLE IF NOT EXISTS cognitive_patterns (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      scope TEXT NOT NULL DEFAULT 'local',
      org_id TEXT,
      source_pattern_id TEXT,
      provenance_json TEXT NOT NULL DEFAULT '{}',
      pattern_key TEXT,
      shared_signature TEXT,
      domain TEXT NOT NULL,
      trigger_json TEXT NOT NULL,
      approach TEXT NOT NULL,
      steps_json TEXT,
      pitfalls_json TEXT,
      confidence REAL NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      fail_count INTEGER NOT NULL DEFAULT 0,
      source_trace_count INTEGER NOT NULL DEFAULT 0,
      last_applied TEXT,
      source_trace_ids_json TEXT NOT NULL DEFAULT '[]',
      application_count INTEGER NOT NULL DEFAULT 0,
      accepted_application_count INTEGER NOT NULL DEFAULT 0,
      successful_application_count INTEGER NOT NULL DEFAULT 0,
      median_time_to_resolution_ms INTEGER,
      median_retries REAL,
      verification_pass_rate REAL NOT NULL DEFAULT 0,
      impact_score REAL NOT NULL DEFAULT 0,
      promotion_reason TEXT,
      status TEXT NOT NULL DEFAULT 'candidate',
      synthesized_into_skill TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cognitive_org_memberships (
      user_id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cognitive_org_policies (
      org_id TEXT PRIMARY KEY,
      org_pattern_sharing_enabled INTEGER NOT NULL DEFAULT 0,
      global_contribution_enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trace_pattern_matches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      trace_id TEXT NOT NULL,
      pattern_id TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      match_source TEXT NOT NULL DEFAULT 'trace_capture',
      explicit_outcome TEXT,
      feedback_notes TEXT,
      updated_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS synthesized_skills (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      scope TEXT NOT NULL DEFAULT 'local',
      pattern_id TEXT NOT NULL,
      pattern_key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      markdown TEXT NOT NULL,
      content_json TEXT NOT NULL,
      quality_score REAL NOT NULL DEFAULT 0,
      usage_count INTEGER NOT NULL DEFAULT 0,
      success_rate REAL NOT NULL DEFAULT 0,
      accepted_application_count INTEGER NOT NULL DEFAULT 0,
      successful_application_count INTEGER NOT NULL DEFAULT 0,
      median_time_to_resolution_ms INTEGER,
      median_retries REAL,
      verification_pass_rate REAL NOT NULL DEFAULT 0,
      impact_score REAL NOT NULL DEFAULT 0,
      promotion_reason TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      published INTEGER NOT NULL DEFAULT 0,
      published_to TEXT,
      clawhub_id TEXT,
      source_trace_count INTEGER NOT NULL DEFAULT 0,
      source_pattern_ids_json TEXT NOT NULL DEFAULT '[]',
      source_trace_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cognitive_jobs (
      job_name TEXT PRIMARY KEY,
      lease_token TEXT,
      lease_expires_at TEXT,
      last_run_at TEXT,
      last_success_at TEXT,
      checkpoint_json TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cognitive_applications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      trace_id TEXT,
      problem TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      repo_profile_json TEXT,
      materialized_pattern_id TEXT,
      materialized_skill_id TEXT,
      policy_key TEXT,
      policy_context_key TEXT,
      policy_snapshot_json TEXT,
      policy_reward REAL,
      workflow_strategy_key TEXT,
      workflow_context_key TEXT,
      workflow_snapshot_json TEXT,
      workflow_observed_key TEXT,
      workflow_reward REAL,
      retry_count INTEGER,
      baseline_group_key TEXT,
      baseline_snapshot_json TEXT,
      accepted_trace_id TEXT,
      accepted_pattern_id TEXT,
      accepted_skill_id TEXT,
      final_outcome TEXT,
      time_to_resolution_ms INTEGER,
      verification_summary_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pattern_applications (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      trace_id TEXT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      entity_scope TEXT NOT NULL,
      rank INTEGER NOT NULL DEFAULT 0,
      accepted INTEGER NOT NULL DEFAULT 0,
      final_outcome TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cognitive_benchmark_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      dataset TEXT NOT NULL,
      fixture_count INTEGER NOT NULL DEFAULT 0,
      result_json TEXT NOT NULL,
      gate_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cognitive_user_settings (
      user_id TEXT PRIMARY KEY,
      shared_learning_enabled INTEGER NOT NULL DEFAULT 0,
      benchmark_inclusion_enabled INTEGER NOT NULL DEFAULT 0,
      trace_retention_days INTEGER NOT NULL DEFAULT 30,
      updated_at TEXT NOT NULL
    );
  `);

  await client.execute(`ALTER TABLE coding_traces ADD COLUMN updated_at TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE coding_traces ADD COLUMN embedding_json TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE coding_traces ADD COLUMN trace_hash TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE coding_traces ADD COLUMN outcome_source TEXT DEFAULT 'heuristic'`).catch(() => {});
  await client.execute(`ALTER TABLE coding_traces ADD COLUMN outcome_confidence REAL DEFAULT 0.55`).catch(() => {});
  await client.execute(`ALTER TABLE coding_traces ADD COLUMN automated_signals_json TEXT DEFAULT '{}'`).catch(() => {});
  await client.execute(`ALTER TABLE coding_traces ADD COLUMN share_eligible INTEGER DEFAULT 0`).catch(() => {});
  await client.execute(`ALTER TABLE coding_traces ADD COLUMN shared_signature TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE coding_traces ADD COLUMN explicit_feedback_notes TEXT`).catch(() => {});
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_traces_shared_signature ON coding_traces(shared_signature)`).catch(() => {});

  await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN scope TEXT DEFAULT 'local'`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN org_id TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN source_pattern_id TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN provenance_json TEXT DEFAULT '{}'`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN pattern_key TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN shared_signature TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN source_trace_count INTEGER DEFAULT 0`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN application_count INTEGER DEFAULT 0`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN accepted_application_count INTEGER DEFAULT 0`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN successful_application_count INTEGER DEFAULT 0`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN median_time_to_resolution_ms INTEGER`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN median_retries REAL`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN verification_pass_rate REAL DEFAULT 0`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN impact_score REAL DEFAULT 0`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN promotion_reason TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE trace_pattern_matches ADD COLUMN explicit_outcome TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE trace_pattern_matches ADD COLUMN feedback_notes TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE trace_pattern_matches ADD COLUMN updated_at TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE synthesized_skills ADD COLUMN scope TEXT DEFAULT 'local'`).catch(() => {});
  await client.execute(`ALTER TABLE synthesized_skills ADD COLUMN pattern_key TEXT DEFAULT ''`).catch(() => {});
  await client.execute(`ALTER TABLE synthesized_skills ADD COLUMN source_trace_count INTEGER DEFAULT 0`).catch(() => {});
  await client.execute(`ALTER TABLE synthesized_skills ADD COLUMN accepted_application_count INTEGER DEFAULT 0`).catch(() => {});
  await client.execute(`ALTER TABLE synthesized_skills ADD COLUMN successful_application_count INTEGER DEFAULT 0`).catch(() => {});
  await client.execute(`ALTER TABLE synthesized_skills ADD COLUMN median_time_to_resolution_ms INTEGER`).catch(() => {});
  await client.execute(`ALTER TABLE synthesized_skills ADD COLUMN median_retries REAL`).catch(() => {});
  await client.execute(`ALTER TABLE synthesized_skills ADD COLUMN verification_pass_rate REAL DEFAULT 0`).catch(() => {});
  await client.execute(`ALTER TABLE synthesized_skills ADD COLUMN impact_score REAL DEFAULT 0`).catch(() => {});
  await client.execute(`ALTER TABLE synthesized_skills ADD COLUMN promotion_reason TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN accepted_trace_id TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN repo_profile_json TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN materialized_pattern_id TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN materialized_skill_id TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN policy_key TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN policy_context_key TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN policy_snapshot_json TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN policy_reward REAL`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN workflow_strategy_key TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN workflow_context_key TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN workflow_snapshot_json TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN workflow_observed_key TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN workflow_reward REAL`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN retry_count INTEGER`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN baseline_group_key TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN baseline_snapshot_json TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_user_settings ADD COLUMN shared_learning_enabled INTEGER DEFAULT 0`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_user_settings ADD COLUMN benchmark_inclusion_enabled INTEGER DEFAULT 0`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_user_settings ADD COLUMN trace_retention_days INTEGER DEFAULT 30`).catch(() => {});

  // Shared/global learning derives cluster keys in memory from sanitized content.
  // Persisted reusable signatures are cleared to reduce cross-session linkability.
  await client.execute(`UPDATE coding_traces SET shared_signature = NULL WHERE shared_signature IS NOT NULL`).catch(() => {});
  await client.execute(`UPDATE cognitive_patterns SET shared_signature = NULL WHERE scope = 'global'`).catch(() => {});
  await ensureCognitiveIndexes(client);

  initialized = true;
}

function rowToCognitiveUserSettings(row: Record<string, unknown>): CognitiveUserSettings {
  return {
    userId: row.user_id as string,
    sharedLearningEnabled: Number(row.shared_learning_enabled ?? 0) === 1,
    benchmarkInclusionEnabled: Number(row.benchmark_inclusion_enabled ?? 0) === 1,
    traceRetentionDays: Math.max(1, Math.min(365, Number(row.trace_retention_days ?? 30))),
    updatedAt: (row.updated_at as string) ?? new Date(0).toISOString(),
  };
}

function parseStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === "string");
  }
  if (typeof raw !== "string" || !raw.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function parseObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== "string" || !raw.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseNumberArray(raw: unknown): number[] | null {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is number => typeof value === "number") : null;
  } catch {
    return null;
  }
}

function medianValue(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function hashTrace(input: {
  sessionId: string;
  type: string;
  problem: string;
  reasoning: string;
  solution?: string | null;
  toolsUsed: string[];
  filesModified: string[];
}): string {
  const normalized = JSON.stringify({
    sessionId: normalizeForFingerprint(input.sessionId),
    type: normalizeForFingerprint(input.type),
    problem: normalizeForFingerprint(input.problem),
    reasoning: normalizeForFingerprint(input.reasoning).slice(0, 2000),
    solution: normalizeForFingerprint(input.solution ?? "").slice(0, 1200),
    toolsUsed: [...input.toolsUsed].sort(),
    filesModified: [...input.filesModified].sort(),
  });
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function rowToTrace(row: Record<string, unknown>): CodingTrace {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    sessionId: row.session_id as string,
    timestamp: row.timestamp as string,
    type: row.type as string,
    problem: row.problem as string,
    contextJson: (row.context_json as string) ?? "{}",
    reasoning: (row.reasoning as string) ?? "",
    approachesJson: (row.approaches_json as string) ?? "[]",
    solution: (row.solution as string | null) ?? null,
    outcome: ((row.outcome as string) ?? "partial"),
    outcomeSource: (((row.outcome_source as string) ?? "heuristic") as CodingTrace["outcomeSource"]),
    outcomeConfidence: Number(row.outcome_confidence ?? 0.55),
    automatedSignalsJson: (row.automated_signals_json as string) ?? "{}",
    errorMessage: (row.error_message as string | null) ?? null,
    toolsUsedJson: (row.tools_used_json as string) ?? "[]",
    filesModifiedJson: (row.files_modified_json as string) ?? "[]",
    durationMs: Number(row.duration_ms ?? 0),
    sanitized: Number(row.sanitized ?? 0) === 1,
    sanitizedAt: (row.sanitized_at as string | null) ?? null,
    shareEligible: Number(row.share_eligible ?? 0) === 1,
    sharedSignature: (row.shared_signature as string | null) ?? null,
    traceHash: (row.trace_hash as string) ?? "",
    embeddingJson: (row.embedding_json as string | null) ?? null,
    explicitFeedbackNotes: (row.explicit_feedback_notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string | null) ?? (row.created_at as string),
  };
}

function rowToPattern(row: Record<string, unknown>): Pattern {
  return {
    id: row.id as string,
    userId: (row.user_id as string | null) ?? null,
    scope: (((row.scope as string) ?? "local") as Pattern["scope"]),
    orgId: (row.org_id as string | null) ?? null,
    sourcePatternId: (row.source_pattern_id as string | null) ?? null,
    provenanceJson: (row.provenance_json as string) ?? "{}",
    patternKey: (row.pattern_key as string) ?? "",
    sharedSignature: (row.shared_signature as string | null) ?? null,
    domain: row.domain as string,
    triggerJson: row.trigger_json as string,
    approach: row.approach as string,
    stepsJson: (row.steps_json as string | null) ?? null,
    pitfallsJson: (row.pitfalls_json as string | null) ?? null,
    confidence: Number(row.confidence ?? 0),
    successCount: Number(row.success_count ?? 0),
    failCount: Number(row.fail_count ?? 0),
    sourceTraceCount: Number(row.source_trace_count ?? 0),
    lastApplied: (row.last_applied as string | null) ?? null,
    sourceTraceIdsJson: (row.source_trace_ids_json as string) ?? "[]",
    applicationCount: Number(row.application_count ?? 0),
    acceptedApplicationCount: Number(row.accepted_application_count ?? 0),
    successfulApplicationCount: Number(row.successful_application_count ?? 0),
    medianTimeToResolutionMs: row.median_time_to_resolution_ms == null ? null : Number(row.median_time_to_resolution_ms),
    medianRetries: row.median_retries == null ? null : Number(row.median_retries),
    verificationPassRate: Number(row.verification_pass_rate ?? 0),
    impactScore: Number(row.impact_score ?? 0),
    promotionReason: (row.promotion_reason as string | null) ?? null,
    status: (row.status as string) ?? "candidate",
    synthesizedIntoSkill: (row.synthesized_into_skill as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToCognitiveOrgMembership(row: Record<string, unknown>): CognitiveOrgMembership {
  return {
    userId: row.user_id as string,
    orgId: row.org_id as string,
    role: (row.role as string) ?? "member",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToCognitiveOrgPolicy(row: Record<string, unknown>): CognitiveOrgPolicy {
  return {
    orgId: row.org_id as string,
    orgPatternSharingEnabled: Number(row.org_pattern_sharing_enabled ?? 0) === 1,
    globalContributionEnabled: Number(row.global_contribution_enabled ?? 0) === 1,
    updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
  };
}

function rowToSkill(row: Record<string, unknown>): SynthesizedSkill {
  return {
    id: row.id as string,
    userId: (row.user_id as string | null) ?? null,
    scope: (((row.scope as string) ?? "local") as SynthesizedSkill["scope"]),
    patternId: row.pattern_id as string,
    patternKey: row.pattern_key as string,
    name: row.name as string,
    description: row.description as string,
    markdown: row.markdown as string,
    contentJson: row.content_json as string,
    qualityScore: Number(row.quality_score ?? 0),
    usageCount: Number(row.usage_count ?? 0),
    successRate: Number(row.success_rate ?? 0),
    acceptedApplicationCount: Number(row.accepted_application_count ?? 0),
    successfulApplicationCount: Number(row.successful_application_count ?? 0),
    medianTimeToResolutionMs: row.median_time_to_resolution_ms == null ? null : Number(row.median_time_to_resolution_ms),
    medianRetries: row.median_retries == null ? null : Number(row.median_retries),
    verificationPassRate: Number(row.verification_pass_rate ?? 0),
    impactScore: Number(row.impact_score ?? 0),
    promotionReason: (row.promotion_reason as string | null) ?? null,
    status: (row.status as string) ?? "draft",
    published: Number(row.published ?? 0) === 1,
    publishedTo: (row.published_to as string | null) ?? null,
    clawHubId: (row.clawhub_id as string | null) ?? null,
    sourceTraceCount: Number(row.source_trace_count ?? 0),
    sourcePatternIdsJson: (row.source_pattern_ids_json as string) ?? "[]",
    sourceTraceIdsJson: (row.source_trace_ids_json as string) ?? "[]",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToApplication(row: Record<string, unknown>): CognitiveApplication {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    sessionId: row.session_id as string,
    traceId: (row.trace_id as string | null) ?? null,
    problem: row.problem as string,
    endpoint: row.endpoint as string,
    repoProfileJson: (row.repo_profile_json as string | null) ?? null,
    materializedPatternId: (row.materialized_pattern_id as string | null) ?? null,
    materializedSkillId: (row.materialized_skill_id as string | null) ?? null,
    policyKey: (row.policy_key as AdaptivePolicyKey | null) ?? null,
    policyContextKey: (row.policy_context_key as string | null) ?? null,
    policySnapshotJson: (row.policy_snapshot_json as string | null) ?? null,
    policyReward: row.policy_reward == null ? null : Number(row.policy_reward),
    workflowStrategyKey: (row.workflow_strategy_key as ToolWorkflowStrategyKey | null) ?? null,
    workflowContextKey: (row.workflow_context_key as string | null) ?? null,
    workflowSnapshotJson: (row.workflow_snapshot_json as string | null) ?? null,
    workflowObservedKey: (row.workflow_observed_key as ToolWorkflowStrategyKey | null) ?? null,
    workflowReward: row.workflow_reward == null ? null : Number(row.workflow_reward),
    retryCount: row.retry_count == null ? null : Number(row.retry_count),
    baselineGroupKey: (row.baseline_group_key as string | null) ?? null,
    baselineSnapshotJson: (row.baseline_snapshot_json as string | null) ?? null,
    acceptedTraceId: (row.accepted_trace_id as string | null) ?? null,
    acceptedPatternId: (row.accepted_pattern_id as string | null) ?? null,
    acceptedSkillId: (row.accepted_skill_id as string | null) ?? null,
    finalOutcome: (row.final_outcome as string | null) ?? null,
    timeToResolutionMs: row.time_to_resolution_ms == null ? null : Number(row.time_to_resolution_ms),
    verificationSummaryJson: (row.verification_summary_json as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getCognitiveUserSettings(userId: string): Promise<CognitiveUserSettings> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  const result = await client.execute({
    sql: `
      SELECT user_id, shared_learning_enabled, benchmark_inclusion_enabled, trace_retention_days, updated_at
      FROM cognitive_user_settings
      WHERE user_id = ?
      LIMIT 1
    `,
    args: [userId],
  });
  return rowToCognitiveUserSettings((result.rows[0] as Record<string, unknown>) ?? {
    user_id: userId,
    shared_learning_enabled: 0,
    benchmark_inclusion_enabled: 0,
    trace_retention_days: 30,
    updated_at: now,
  });
}

function orgMembershipFromEnv(userId: string): CognitiveOrgMembership | null {
  const mappings = (process.env.FATHIPPO_ORG_MEMBERSHIPS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  for (const mapping of mappings) {
    const [mappedUserId, mappedOrgId] = mapping.split(":", 2);
    if (mappedUserId === userId && mappedOrgId) {
      return {
        userId,
        orgId: mappedOrgId,
        role: "member",
        createdAt: "",
        updatedAt: "",
      };
    }
  }

  return null;
}

export async function getCognitiveOrgMembership(userId: string): Promise<CognitiveOrgMembership | null> {
  await ensureInitialized();
  const envMembership = orgMembershipFromEnv(userId);
  if (envMembership) {
    return envMembership;
  }

  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT user_id, org_id, role, created_at, updated_at
      FROM cognitive_org_memberships
      WHERE user_id = ?
      LIMIT 1
    `,
    args: [userId],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? rowToCognitiveOrgMembership(row) : null;
}

export async function setCognitiveOrgMembership(
  userId: string,
  orgId: string,
  role = "member",
): Promise<CognitiveOrgMembership> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  await client.execute({
    sql: `
      INSERT INTO cognitive_org_memberships (user_id, org_id, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        org_id = excluded.org_id,
        role = excluded.role,
        updated_at = excluded.updated_at
    `,
    args: [userId, orgId, role, now, now],
  });
  return {
    userId,
    orgId,
    role,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getCognitiveOrgPolicy(orgId: string): Promise<CognitiveOrgPolicy> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  const result = await client.execute({
    sql: `
      SELECT org_id, org_pattern_sharing_enabled, global_contribution_enabled, updated_at
      FROM cognitive_org_policies
      WHERE org_id = ?
      LIMIT 1
    `,
    args: [orgId],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return rowToCognitiveOrgPolicy(
    row ?? {
      org_id: orgId,
      org_pattern_sharing_enabled: 0,
      global_contribution_enabled: 0,
      updated_at: now,
    },
  );
}

export async function updateCognitiveOrgPolicy(params: {
  orgId: string;
  orgPatternSharingEnabled?: boolean;
  globalContributionEnabled?: boolean;
}): Promise<CognitiveOrgPolicy> {
  await ensureInitialized();
  const client = getDb();
  const current = await getCognitiveOrgPolicy(params.orgId);
  const nextPolicy = {
    orgPatternSharingEnabled: params.orgPatternSharingEnabled ?? current.orgPatternSharingEnabled,
    globalContributionEnabled: params.globalContributionEnabled ?? current.globalContributionEnabled,
  };
  const now = new Date().toISOString();
  await client.execute({
    sql: `
      INSERT INTO cognitive_org_policies (
        org_id, org_pattern_sharing_enabled, global_contribution_enabled, updated_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(org_id) DO UPDATE SET
        org_pattern_sharing_enabled = excluded.org_pattern_sharing_enabled,
        global_contribution_enabled = excluded.global_contribution_enabled,
        updated_at = excluded.updated_at
    `,
    args: [
      params.orgId,
      nextPolicy.orgPatternSharingEnabled ? 1 : 0,
      nextPolicy.globalContributionEnabled ? 1 : 0,
      now,
    ],
  });
  if (!nextPolicy.globalContributionEnabled) {
    const members = await client.execute({
      sql: `SELECT user_id FROM cognitive_org_memberships WHERE org_id = ?`,
      args: [params.orgId],
    });
    for (const row of members.rows) {
      if (typeof row.user_id === "string") {
        await revokeSharedLearningForUser(row.user_id);
      }
    }
  }
  return {
    orgId: params.orgId,
    ...nextPolicy,
    updatedAt: now,
  };
}

function promotedOrgPatternStatus(sourceStatus: string): Pattern["status"] {
  return sourceStatus.startsWith("synthesized_") ? "synthesized_org" : "active_org";
}

async function getVisiblePatternForUser(userId: string, patternId: string): Promise<Pattern | null> {
  await ensureInitialized();
  const client = getDb();
  const membership = await getCognitiveOrgMembership(userId);
  const policy = membership?.orgId ? await getCognitiveOrgPolicy(membership.orgId) : null;
  const orgId = policy?.orgPatternSharingEnabled ? membership?.orgId ?? null : null;
  const result = await client.execute({
    sql: `
      SELECT *
      FROM cognitive_patterns
      WHERE id = ?
        AND (
          user_id = ?
          OR scope = 'global'
          OR (scope = 'org' AND org_id = ?)
        )
      LIMIT 1
    `,
    args: [patternId, userId, orgId],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? rowToPattern(row) : null;
}

export async function updateCognitiveUserSettings(params: {
  userId: string;
  sharedLearningEnabled?: boolean;
  benchmarkInclusionEnabled?: boolean;
  traceRetentionDays?: number;
}): Promise<CognitiveUserSettings> {
  await ensureInitialized();
  const client = getDb();
  const existing = await getCognitiveUserSettings(params.userId);
  const now = new Date().toISOString();
  const next = {
    sharedLearningEnabled: params.sharedLearningEnabled ?? existing.sharedLearningEnabled,
    benchmarkInclusionEnabled: params.benchmarkInclusionEnabled ?? existing.benchmarkInclusionEnabled,
    traceRetentionDays: Math.max(1, Math.min(365, params.traceRetentionDays ?? existing.traceRetentionDays)),
  };
  await client.execute({
    sql: `
      INSERT INTO cognitive_user_settings (user_id, shared_learning_enabled, benchmark_inclusion_enabled, trace_retention_days, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        shared_learning_enabled = excluded.shared_learning_enabled,
        benchmark_inclusion_enabled = excluded.benchmark_inclusion_enabled,
        trace_retention_days = excluded.trace_retention_days,
        updated_at = excluded.updated_at
    `,
    args: [
      params.userId,
      next.sharedLearningEnabled ? 1 : 0,
      next.benchmarkInclusionEnabled ? 1 : 0,
      next.traceRetentionDays,
      now,
    ],
  });
  if (existing.sharedLearningEnabled && !next.sharedLearningEnabled) {
    await revokeSharedLearningForUser(params.userId);
  }
  if (existing.benchmarkInclusionEnabled && !next.benchmarkInclusionEnabled) {
    await client.execute({
      sql: `DELETE FROM cognitive_benchmark_runs WHERE user_id = ?`,
      args: [params.userId],
    });
  }
  return {
    userId: params.userId,
    sharedLearningEnabled: next.sharedLearningEnabled,
    benchmarkInclusionEnabled: next.benchmarkInclusionEnabled,
    traceRetentionDays: next.traceRetentionDays,
    updatedAt: now,
  };
}

async function getApplicationsWithMatches(userId: string, limit?: number): Promise<Array<{
  application: CognitiveApplication;
  matches: ApplicationMatch[];
}>> {
  await ensureInitialized();
  const client = getDb();
  const limitClause = typeof limit === "number" ? "LIMIT ?" : "";
  const applicationArgs: Array<string | number> = [userId];
  if (typeof limit === "number") {
    applicationArgs.push(Math.max(1, Math.min(limit, 500)));
  }
  const applicationsResult = await client.execute({
    sql: `
      SELECT *
      FROM cognitive_applications
      WHERE user_id = ?
      ORDER BY created_at DESC
      ${limitClause}
    `,
    args: applicationArgs,
  });
  const applications = applicationsResult.rows.map((row) => rowToApplication(row as Record<string, unknown>));
  if (applications.length === 0) {
    return [];
  }

  const matchesResult = await client.execute({
    sql: `
      SELECT *
      FROM pattern_applications
      WHERE application_id IN (${applications.map(() => "?").join(",")})
      ORDER BY rank ASC, created_at DESC
    `,
    args: applications.map((application) => application.id),
  });
  const matches = matchesResult.rows.map((row) => rowToApplicationMatch(row as Record<string, unknown>));
  return applications.map((application) => ({
    application,
    matches: matches.filter((match) => match.applicationId === application.id),
  }));
}

async function getAllUserTraces(userId: string): Promise<CodingTrace[]> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT *
      FROM coding_traces
      WHERE user_id = ?
      ORDER BY created_at DESC
    `,
    args: [userId],
  });
  return result.rows.map((row) => rowToTrace(row as Record<string, unknown>));
}

async function getUserLocalPatterns(userId: string): Promise<Pattern[]> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT *
      FROM cognitive_patterns
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `,
    args: [userId],
  });
  return result.rows.map((row) => rowToPattern(row as Record<string, unknown>));
}

async function getUserLocalSkills(userId: string): Promise<SynthesizedSkill[]> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT *
      FROM synthesized_skills
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `,
    args: [userId],
  });
  return result.rows.map((row) => rowToSkill(row as Record<string, unknown>));
}

async function getUserBenchmarkRuns(userId: string): Promise<Array<{
  id: string;
  dataset: string;
  fixtureCount: number;
  result: Record<string, unknown>;
  gate: Record<string, unknown> | null;
  createdAt: string;
}>> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, dataset, fixture_count, result_json, gate_json, created_at
      FROM cognitive_benchmark_runs
      WHERE user_id = ?
      ORDER BY created_at DESC
    `,
    args: [userId],
  });
  return result.rows.map((row) => ({
    id: row.id as string,
    dataset: row.dataset as string,
    fixtureCount: Number(row.fixture_count ?? 0),
    result: parseObject(row.result_json),
    gate: row.gate_json ? parseObject(row.gate_json) : null,
    createdAt: row.created_at as string,
  }));
}

async function getSkillIdsForPatternIds(patternIds: string[]): Promise<string[]> {
  const uniquePatternIds = Array.from(new Set(patternIds.filter(Boolean)));
  if (uniquePatternIds.length === 0) {
    return [];
  }
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id
      FROM synthesized_skills
      WHERE pattern_id IN (${uniquePatternIds.map(() => "?").join(",")})
    `,
    args: uniquePatternIds,
  });
  return result.rows
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string");
}

async function pruneOrphanedLocalArtifacts(userId: string): Promise<{
  patternsDeleted: number;
  skillsDeleted: number;
}> {
  const traces = await getAllUserTraces(userId);
  const existingTraceIds = new Set(traces.map((trace) => trace.id));
  const patterns = await getUserLocalPatterns(userId);
  const orphanedPatternIds = patterns
    .filter((pattern) => {
      const sourceTraceIds = parseStringArray(pattern.sourceTraceIdsJson);
      return sourceTraceIds.length === 0 || sourceTraceIds.every((traceId) => !existingTraceIds.has(traceId));
    })
    .map((pattern) => pattern.id);

  if (orphanedPatternIds.length === 0) {
    return { patternsDeleted: 0, skillsDeleted: 0 };
  }

  await ensureInitialized();
  const client = getDb();
  const skillDeleteResult = await client.execute({
    sql: `
      DELETE FROM synthesized_skills
      WHERE user_id = ?
        AND pattern_id IN (${orphanedPatternIds.map(() => "?").join(",")})
    `,
    args: [userId, ...orphanedPatternIds],
  });
  const patternDeleteResult = await client.execute({
    sql: `
      DELETE FROM cognitive_patterns
      WHERE user_id = ?
        AND id IN (${orphanedPatternIds.map(() => "?").join(",")})
    `,
    args: [userId, ...orphanedPatternIds],
  });

  return {
    patternsDeleted: patternDeleteResult.rowsAffected ?? 0,
    skillsDeleted: skillDeleteResult.rowsAffected ?? 0,
  };
}

export async function revokeSharedLearningForUser(userId: string): Promise<{
  tracesUpdated: number;
  globalMatchesDeleted: number;
  globalPatternsRefreshed: number;
  globalSkillsRefreshed: number;
}> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  const traceResult = await client.execute({
    sql: `
      SELECT id
      FROM coding_traces
      WHERE user_id = ? AND share_eligible = 1
    `,
    args: [userId],
  });
  const traceIds = traceResult.rows
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string");

  const updateResult = await client.execute({
    sql: `
      UPDATE coding_traces
      SET share_eligible = 0,
          shared_signature = NULL,
          updated_at = ?
      WHERE user_id = ? AND share_eligible = 1
    `,
    args: [now, userId],
  });

  if (traceIds.length === 0) {
    return {
      tracesUpdated: updateResult.rowsAffected ?? 0,
      globalMatchesDeleted: 0,
      globalPatternsRefreshed: 0,
      globalSkillsRefreshed: 0,
    };
  }

  const patternResult = await client.execute({
    sql: `
      SELECT DISTINCT m.pattern_id
      FROM trace_pattern_matches m
      JOIN cognitive_patterns p ON p.id = m.pattern_id
      WHERE m.trace_id IN (${traceIds.map(() => "?").join(",")})
        AND p.scope = 'global'
    `,
    args: traceIds,
  });
  const globalPatternIds = patternResult.rows
    .map((row) => row.pattern_id)
    .filter((value): value is string => typeof value === "string");

  const deleteResult = await client.execute({
    sql: `
      DELETE FROM trace_pattern_matches
      WHERE trace_id IN (${traceIds.map(() => "?").join(",")})
        AND pattern_id IN (
          SELECT id FROM cognitive_patterns WHERE scope = 'global'
        )
    `,
    args: traceIds,
  });

  const globalSkillIds = await getSkillIdsForPatternIds(globalPatternIds);
  await recomputePatternStats(globalPatternIds);
  await recomputeSkillStats(globalSkillIds);

  return {
    tracesUpdated: updateResult.rowsAffected ?? 0,
    globalMatchesDeleted: deleteResult.rowsAffected ?? 0,
    globalPatternsRefreshed: globalPatternIds.length,
    globalSkillsRefreshed: globalSkillIds.length,
  };
}

export async function exportCognitiveUserData(userId: string): Promise<CognitivePrivacyExport> {
  const [settings, traces, applications, patterns, skills, benchmarkRuns] = await Promise.all([
    getCognitiveUserSettings(userId),
    getAllUserTraces(userId),
    getApplicationsWithMatches(userId),
    getUserLocalPatterns(userId),
    getUserLocalSkills(userId),
    getUserBenchmarkRuns(userId),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    settings,
    traces,
    applications,
    patterns,
    skills,
    benchmarkRuns,
  };
}

export async function deleteCognitiveUserData(userId: string): Promise<CognitiveDataDeletionResult> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();

  const localPatternIds = (await client.execute({
    sql: `SELECT id FROM cognitive_patterns WHERE user_id = ?`,
    args: [userId],
  })).rows
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string");

  const localSkillIds = (await client.execute({
    sql: `SELECT id FROM synthesized_skills WHERE user_id = ?`,
    args: [userId],
  })).rows
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string");

  const sharedRevoke = await revokeSharedLearningForUser(userId);

  const applicationMatchesDeleted = (await client.execute({
    sql: `DELETE FROM pattern_applications WHERE user_id = ?`,
    args: [userId],
  })).rowsAffected ?? 0;

  const applicationsDeleted = (await client.execute({
    sql: `DELETE FROM cognitive_applications WHERE user_id = ?`,
    args: [userId],
  })).rowsAffected ?? 0;

  const patternMatchesDeleted = (await client.execute({
    sql: `
      DELETE FROM trace_pattern_matches
      WHERE trace_id IN (SELECT id FROM coding_traces WHERE user_id = ?)
         OR pattern_id IN (SELECT id FROM cognitive_patterns WHERE user_id = ?)
    `,
    args: [userId, userId],
  })).rowsAffected ?? 0;

  const benchmarkRunsDeleted = (await client.execute({
    sql: `DELETE FROM cognitive_benchmark_runs WHERE user_id = ?`,
    args: [userId],
  })).rowsAffected ?? 0;

  const localSkillsDeleted = (await client.execute({
    sql: `DELETE FROM synthesized_skills WHERE user_id = ?`,
    args: [userId],
  })).rowsAffected ?? 0;

  const localPatternsDeleted = (await client.execute({
    sql: `DELETE FROM cognitive_patterns WHERE user_id = ?`,
    args: [userId],
  })).rowsAffected ?? 0;

  const tracesDeleted = (await client.execute({
    sql: `DELETE FROM coding_traces WHERE user_id = ?`,
    args: [userId],
  })).rowsAffected ?? 0;

  const settingsDeleted = (await client.execute({
    sql: `DELETE FROM cognitive_user_settings WHERE user_id = ?`,
    args: [userId],
  })).rowsAffected ?? 0;

  if (localPatternIds.length > 0 || localSkillIds.length > 0) {
    await recomputePatternStats(localPatternIds);
    await recomputeSkillStats(localSkillIds);
  }

  return {
    deletedAt: now,
    tracesDeleted,
    applicationsDeleted,
    patternMatchesDeleted,
    applicationMatchesDeleted,
    localPatternsDeleted,
    localSkillsDeleted,
    benchmarkRunsDeleted,
    settingsDeleted,
    sharedLearningRevoked: sharedRevoke.tracesUpdated > 0,
    globalPatternsRefreshed: sharedRevoke.globalPatternsRefreshed,
    globalSkillsRefreshed: sharedRevoke.globalSkillsRefreshed,
  };
}

export async function cleanupExpiredCognitiveData(params?: {
  userId?: string;
  benchmarkRetentionDays?: number;
}): Promise<CognitiveRetentionCleanupResult> {
  await ensureInitialized();
  const client = getDb();
  const cleanedAt = new Date().toISOString();
  const benchmarkRetentionDays = Math.max(1, Math.min(params?.benchmarkRetentionDays ?? 90, 3650));
  const benchmarkCutoff = new Date(Date.now() - benchmarkRetentionDays * 24 * 60 * 60 * 1000).toISOString();

  const userRows = await client.execute({
    sql: params?.userId
      ? `
        SELECT DISTINCT ? as user_id
      `
      : `
        SELECT DISTINCT user_id
        FROM (
          SELECT user_id FROM coding_traces
          UNION
          SELECT user_id FROM cognitive_applications
          UNION
          SELECT user_id FROM cognitive_benchmark_runs
          UNION
          SELECT user_id FROM cognitive_user_settings
        )
      `,
    args: params?.userId ? [params.userId] : [],
  });
  const userIds = userRows.rows
    .map((row) => row.user_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  const touchedGlobalPatternIds = new Set<string>();
  const touchedApplicationPatternIds = new Set<string>();
  const touchedSkillIds = new Set<string>();
  let tracesDeleted = 0;
  let applicationsDeleted = 0;
  let patternMatchesDeleted = 0;
  let applicationMatchesDeleted = 0;
  let benchmarkRunsDeleted = 0;
  let localPatternsDeleted = 0;
  let localSkillsDeleted = 0;

  for (const userId of userIds) {
    const settings = await getCognitiveUserSettings(userId);
    const traceCutoff = new Date(Date.now() - settings.traceRetentionDays * 24 * 60 * 60 * 1000).toISOString();
    const expiredTraceRows = await client.execute({
      sql: `
        SELECT id
        FROM coding_traces
        WHERE user_id = ? AND created_at < ?
      `,
      args: [userId, traceCutoff],
    });
    const expiredTraceIds = expiredTraceRows.rows
      .map((row) => row.id)
      .filter((value): value is string => typeof value === "string");

    if (expiredTraceIds.length > 0) {
      const globalPatternRows = await client.execute({
        sql: `
          SELECT DISTINCT m.pattern_id
          FROM trace_pattern_matches m
          JOIN cognitive_patterns p ON p.id = m.pattern_id
          WHERE m.trace_id IN (${expiredTraceIds.map(() => "?").join(",")})
            AND p.scope = 'global'
        `,
        args: expiredTraceIds,
      });
      for (const row of globalPatternRows.rows) {
        if (typeof row.pattern_id === "string") {
          touchedGlobalPatternIds.add(row.pattern_id);
        }
      }
    }

    const affectedApplicationEntities = await client.execute({
      sql: `
        SELECT DISTINCT p.entity_type, p.entity_id
        FROM pattern_applications p
        JOIN cognitive_applications a ON a.id = p.application_id
        WHERE a.user_id = ? AND a.created_at < ?
      `,
      args: [userId, traceCutoff],
    });
    for (const row of affectedApplicationEntities.rows) {
      if (row.entity_type === "pattern" && typeof row.entity_id === "string") {
        touchedApplicationPatternIds.add(row.entity_id);
      }
      if (row.entity_type === "skill" && typeof row.entity_id === "string") {
        touchedSkillIds.add(row.entity_id);
      }
    }

    applicationMatchesDeleted += (await client.execute({
      sql: `
        DELETE FROM pattern_applications
        WHERE application_id IN (
          SELECT id FROM cognitive_applications WHERE user_id = ? AND created_at < ?
        )
      `,
      args: [userId, traceCutoff],
    })).rowsAffected ?? 0;

    applicationsDeleted += (await client.execute({
      sql: `
        DELETE FROM cognitive_applications
        WHERE user_id = ? AND created_at < ?
      `,
      args: [userId, traceCutoff],
    })).rowsAffected ?? 0;

    patternMatchesDeleted += (await client.execute({
      sql: `
        DELETE FROM trace_pattern_matches
        WHERE trace_id IN (
          SELECT id FROM coding_traces WHERE user_id = ? AND created_at < ?
        )
      `,
      args: [userId, traceCutoff],
    })).rowsAffected ?? 0;

    tracesDeleted += (await client.execute({
      sql: `
        DELETE FROM coding_traces
        WHERE user_id = ? AND created_at < ?
      `,
      args: [userId, traceCutoff],
    })).rowsAffected ?? 0;

    benchmarkRunsDeleted += (await client.execute({
      sql: `
        DELETE FROM cognitive_benchmark_runs
        WHERE user_id = ? AND created_at < ?
      `,
      args: [userId, benchmarkCutoff],
    })).rowsAffected ?? 0;

    const pruned = await pruneOrphanedLocalArtifacts(userId);
    localPatternsDeleted += pruned.patternsDeleted;
    localSkillsDeleted += pruned.skillsDeleted;
  }

  const patternIdsToRefresh = Array.from(new Set([...touchedGlobalPatternIds, ...touchedApplicationPatternIds]));
  const derivedSkillIds = await getSkillIdsForPatternIds(patternIdsToRefresh);
  const derivedGlobalSkillIds = await getSkillIdsForPatternIds([...touchedGlobalPatternIds]);
  const skillIdsToRefresh = Array.from(new Set([...touchedSkillIds, ...derivedSkillIds]));
  await recomputePatternStats(patternIdsToRefresh);
  await recomputeSkillStats(skillIdsToRefresh);

  return {
    cleanedAt,
    usersProcessed: userIds.length,
    tracesDeleted,
    applicationsDeleted,
    patternMatchesDeleted,
    applicationMatchesDeleted,
    benchmarkRunsDeleted,
    localPatternsDeleted,
    localSkillsDeleted,
    globalPatternsRefreshed: touchedGlobalPatternIds.size,
    globalSkillsRefreshed: derivedGlobalSkillIds.length,
  };
}

function rowToApplicationMatch(row: Record<string, unknown>): ApplicationMatch {
  return {
    id: row.id as string,
    applicationId: row.application_id as string,
    userId: row.user_id as string,
    sessionId: row.session_id as string,
    traceId: (row.trace_id as string | null) ?? null,
    entityType: (row.entity_type as "trace" | "pattern" | "skill") ?? "pattern",
    entityId: row.entity_id as string,
    entityScope: ((row.entity_scope as "local" | "global" | "org") ?? "local"),
    rank: Number(row.rank ?? 0),
    accepted: Number(row.accepted ?? 0) === 1,
    finalOutcome: (row.final_outcome as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string | null) ?? (row.created_at as string),
  };
}

function scorePatternMatch(params: {
  pattern: Pattern;
  problem: string;
  technologies: string[];
}): number {
  const trigger = parseObject(params.pattern.triggerJson);
  const problemLower = params.problem.toLowerCase();
  let score = 0;

  for (const keyword of parseStringArray(trigger.keywords)) {
    if (problemLower.includes(keyword.toLowerCase())) {
      score += 2;
    }
  }
  for (const technology of parseStringArray(trigger.technologies)) {
    if (params.technologies.some((value) => value.toLowerCase() === technology.toLowerCase())) {
      score += 3;
    }
  }
  for (const errorPattern of parseStringArray(trigger.errorPatterns)) {
    try {
      if (new RegExp(errorPattern, "i").test(params.problem)) {
        score += 5;
      }
    } catch {
      // Ignore invalid patterns already stored.
    }
  }

  return score * Math.max(params.pattern.confidence, 0.1);
}

function asLearningTrace(trace: CodingTrace): LearningTrace {
  const context = parseObject(trace.contextJson);
  return {
    id: trace.id,
    userId: trace.userId,
    type: trace.type,
    problem: trace.problem,
    reasoning: trace.reasoning,
    solution: trace.solution,
    outcome: trace.outcome,
    outcomeSource: trace.outcomeSource,
    outcomeConfidence: trace.outcomeConfidence,
    context: {
      technologies: parseStringArray(context.technologies),
      errorMessages: parseStringArray(context.errorMessages),
    },
    automatedSignals: parseObject(trace.automatedSignalsJson),
    sharedSignature: trace.sharedSignature,
    shareEligible: trace.shareEligible,
    embedding: parseNumberArray(trace.embeddingJson),
  };
}

function outcomeSourcePriority(source: CodingTrace["outcomeSource"] | string | null | undefined): number {
  if (source === "explicit") {
    return 3;
  }
  if (source === "tool") {
    return 2;
  }
  return 1;
}

function mergeStringArrays(left: string[], right: string[]): string[] {
  return [...new Set([...left.filter(Boolean), ...right.filter(Boolean)])];
}

function mergeTraceContext(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...existing,
    ...incoming,
    technologies: mergeStringArrays(
      parseStringArray(existing.technologies),
      parseStringArray(incoming.technologies),
    ),
    errorMessages: mergeStringArrays(
      parseStringArray(existing.errorMessages),
      parseStringArray(incoming.errorMessages),
    ),
  };
}

function hasTraceRefreshSignal(
  existing: CodingTrace,
  incoming: {
    outcome: string;
    outcomeSource: CodingTrace["outcomeSource"];
    outcomeConfidence: number;
    automatedSignals: Record<string, unknown>;
    context: Record<string, unknown>;
    solution?: string | null;
    errorMessage?: string | null;
    toolsUsed: string[];
    filesModified: string[];
    durationMs: number;
    shareEligible: boolean;
    sharedSignature?: string | null;
  },
): boolean {
  const existingSignals = parseObject(existing.automatedSignalsJson);
  const existingContext = parseObject(existing.contextJson);
  const sourceUpgraded =
    outcomeSourcePriority(incoming.outcomeSource) > outcomeSourcePriority(existing.outcomeSource);
  const confidenceUpgraded = incoming.outcomeConfidence > existing.outcomeConfidence + 0.01;
  const outcomeChanged = incoming.outcome !== existing.outcome;
  const signalsChanged = JSON.stringify(existingSignals) !== JSON.stringify(incoming.automatedSignals);
  const contextChanged = JSON.stringify(existingContext) !== JSON.stringify(incoming.context);
  const solutionChanged = Boolean(incoming.solution && incoming.solution !== existing.solution);
  const errorChanged = Boolean(incoming.errorMessage && incoming.errorMessage !== existing.errorMessage);
  const toolsChanged =
    JSON.stringify(parseStringArray(existing.toolsUsedJson)) !== JSON.stringify(incoming.toolsUsed);
  const filesChanged =
    JSON.stringify(parseStringArray(existing.filesModifiedJson)) !== JSON.stringify(incoming.filesModified);
  const durationChanged = incoming.durationMs > existing.durationMs;
  const sharingChanged =
    incoming.shareEligible !== existing.shareEligible || (incoming.sharedSignature ?? null) !== existing.sharedSignature;

  return (
    sourceUpgraded ||
    confidenceUpgraded ||
    outcomeChanged ||
    signalsChanged ||
    contextChanged ||
    solutionChanged ||
    errorChanged ||
    toolsChanged ||
    filesChanged ||
    durationChanged ||
    sharingChanged
  );
}

export async function logCognitiveApplication(params: {
  userId: string;
  sessionId: string;
  problem: string;
  endpoint: string;
  repoProfile?: Record<string, unknown> | null;
  policy?: Pick<AdaptivePolicyRecommendation, "key" | "contextKey" | "rationale" | "exploration" | "score" | "traceLimit" | "patternLimit" | "skillLimit" | "sectionOrder" | "features"> | null;
  workflow?: Pick<ToolWorkflowRecommendation, "key" | "contextKey" | "rationale" | "exploration" | "score" | "title" | "steps"> | null;
  traces: ApplicationEntityInput[];
  patterns: ApplicationEntityInput[];
  skills: ApplicationEntityInput[];
}): Promise<{ application: CognitiveApplication; matches: ApplicationMatch[] }> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  const applicationId = crypto.randomUUID();

  await client.execute({
    sql: `
      INSERT INTO cognitive_applications (
        id, user_id, session_id, trace_id, problem, endpoint,
        repo_profile_json, materialized_pattern_id, materialized_skill_id,
        policy_key, policy_context_key, policy_snapshot_json, policy_reward,
        workflow_strategy_key, workflow_context_key, workflow_snapshot_json, workflow_observed_key, workflow_reward,
        retry_count, baseline_group_key, baseline_snapshot_json,
        accepted_trace_id, accepted_pattern_id, accepted_skill_id, final_outcome, time_to_resolution_ms,
        verification_summary_json, created_at, updated_at
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)
    `,
    args: [
      applicationId,
      params.userId,
      params.sessionId,
      params.problem,
      params.endpoint,
      params.repoProfile ? JSON.stringify(params.repoProfile) : null,
      params.policy?.key ?? null,
      params.policy?.contextKey ?? null,
      params.policy ? JSON.stringify(params.policy) : null,
      params.workflow?.key ?? null,
      params.workflow?.contextKey ?? null,
      params.workflow ? JSON.stringify(params.workflow) : null,
      now,
      now,
    ],
  });

  const matches: ApplicationMatch[] = [];
  for (const [entityType, entities] of [
    ["trace", params.traces] as const,
    ["pattern", params.patterns] as const,
    ["skill", params.skills] as const,
  ]) {
    for (const entity of entities) {
      const matchId = crypto.randomUUID();
      await client.execute({
        sql: `
          INSERT INTO pattern_applications (
            id, application_id, user_id, session_id, trace_id,
            entity_type, entity_id, entity_scope, rank, accepted, final_outcome, created_at, updated_at
          ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 0, NULL, ?, ?)
        `,
        args: [
          matchId,
          applicationId,
          params.userId,
          params.sessionId,
          entityType,
          entity.id,
          entity.scope,
          entity.rank,
          now,
          now,
        ],
      });
      matches.push({
        id: matchId,
        applicationId,
        userId: params.userId,
        sessionId: params.sessionId,
        traceId: null,
        entityType,
        entityId: entity.id,
        entityScope: entity.scope,
        rank: entity.rank,
        accepted: false,
        finalOutcome: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return {
    application: {
      id: applicationId,
      userId: params.userId,
      sessionId: params.sessionId,
      traceId: null,
      problem: params.problem,
      endpoint: params.endpoint,
      repoProfileJson: params.repoProfile ? JSON.stringify(params.repoProfile) : null,
      materializedPatternId: null,
      materializedSkillId: null,
      policyKey: params.policy?.key ?? null,
      policyContextKey: params.policy?.contextKey ?? null,
      policySnapshotJson: params.policy ? JSON.stringify(params.policy) : null,
      policyReward: null,
      workflowStrategyKey: params.workflow?.key ?? null,
      workflowContextKey: params.workflow?.contextKey ?? null,
      workflowSnapshotJson: params.workflow ? JSON.stringify(params.workflow) : null,
      workflowObservedKey: null,
      workflowReward: null,
      retryCount: null,
      baselineGroupKey: null,
      baselineSnapshotJson: null,
      acceptedTraceId: null,
      acceptedPatternId: null,
      acceptedSkillId: null,
      finalOutcome: null,
      timeToResolutionMs: null,
      verificationSummaryJson: null,
      createdAt: now,
      updatedAt: now,
    },
    matches,
  };
}

async function attachTraceToApplication(params: {
  userId: string;
  applicationId: string;
  traceId: string;
}): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  await client.execute({
    sql: `
      UPDATE cognitive_applications
      SET trace_id = COALESCE(trace_id, ?),
          updated_at = ?
      WHERE id = ? AND user_id = ?
    `,
    args: [params.traceId, now, params.applicationId, params.userId],
  });
  await client.execute({
    sql: `
      UPDATE pattern_applications
      SET trace_id = COALESCE(trace_id, ?),
          updated_at = ?
      WHERE application_id = ? AND user_id = ?
    `,
    args: [params.traceId, now, params.applicationId, params.userId],
  });
}

export async function createTrace(input: CreateTraceInput): Promise<CodingTrace> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  const normalizedContext = input.context ?? {};
  const automatedSignals = input.automatedSignals ?? {};
  const userSettings = input.shareEligible == null ? await getCognitiveUserSettings(input.userId) : null;
  const membership = await getCognitiveOrgMembership(input.userId);
  const orgPolicy = membership?.orgId ? await getCognitiveOrgPolicy(membership.orgId) : null;
  const requestedShareEligibility = input.shareEligible ?? userSettings?.sharedLearningEnabled ?? false;
  const shareEligible =
    requestedShareEligibility &&
    (membership?.orgId ? Boolean(orgPolicy?.globalContributionEnabled) : true);
  const traceHash = hashTrace({
    sessionId: input.sessionId,
    type: input.type,
    problem: input.problem,
    reasoning: input.reasoning,
    solution: input.solution ?? null,
    toolsUsed: input.toolsUsed,
    filesModified: input.filesModified,
  });
  const heuristicOutcome = input.heuristicOutcome ?? input.outcome ?? "partial";
  const resolved = resolveOutcome({
    heuristicOutcome,
    automatedOutcome: input.automatedOutcome,
  });
  const sharedSignature = null;

  const existing = await client.execute({
    sql: `SELECT * FROM coding_traces WHERE user_id = ? AND trace_hash = ? LIMIT 1`,
    args: [input.userId, traceHash],
  });
  if (existing.rows[0]) {
    const existingTrace = rowToTrace(existing.rows[0] as Record<string, unknown>);
    const mergedContext = mergeTraceContext(parseObject(existingTrace.contextJson), normalizedContext);
    const mergedAutomatedSignals = {
      ...parseObject(existingTrace.automatedSignalsJson),
      ...automatedSignals,
    };
    const mergedToolsUsed = mergeStringArrays(parseStringArray(existingTrace.toolsUsedJson), input.toolsUsed);
    const mergedFilesModified = mergeStringArrays(parseStringArray(existingTrace.filesModifiedJson), input.filesModified);
    const mergedSolution = input.solution ?? existingTrace.solution;
    const mergedErrorMessage = input.errorMessage ?? existingTrace.errorMessage;
    const mergedDurationMs = Math.max(existingTrace.durationMs, input.durationMs);
    const shouldRefresh = hasTraceRefreshSignal(existingTrace, {
      outcome: resolved.outcome,
      outcomeSource: resolved.source,
      outcomeConfidence: resolved.confidence,
      automatedSignals: mergedAutomatedSignals,
      context: mergedContext,
      solution: mergedSolution,
      errorMessage: mergedErrorMessage,
      toolsUsed: mergedToolsUsed,
      filesModified: mergedFilesModified,
      durationMs: mergedDurationMs,
      shareEligible,
      sharedSignature,
    });

    if (!shouldRefresh) {
      return existingTrace;
    }

    await client.execute({
      sql: `
        UPDATE coding_traces
        SET context_json = ?,
            solution = ?,
            outcome = ?,
            error_message = ?,
            tools_used_json = ?,
            files_modified_json = ?,
            duration_ms = ?,
            updated_at = ?,
            outcome_source = ?,
            outcome_confidence = ?,
            automated_signals_json = ?,
            share_eligible = ?,
            shared_signature = ?,
            explicit_feedback_notes = COALESCE(?, explicit_feedback_notes)
        WHERE id = ?
      `,
      args: [
        JSON.stringify(mergedContext),
        mergedSolution ?? null,
        resolved.outcome,
        mergedErrorMessage ?? null,
        JSON.stringify(mergedToolsUsed),
        JSON.stringify(mergedFilesModified),
        mergedDurationMs,
        now,
        resolved.source,
        resolved.confidence,
        JSON.stringify(mergedAutomatedSignals),
        shareEligible ? 1 : 0,
        sharedSignature,
        input.explicitFeedbackNotes ?? null,
        existingTrace.id,
      ],
    });

    if (input.applicationId) {
      await attachTraceToApplication({
        userId: input.userId,
        applicationId: input.applicationId,
        traceId: existingTrace.id,
      });
    }

    const refreshed = await getTraceById(existingTrace.id, input.userId);
    return refreshed ?? existingTrace;
  }

  let embedding: number[] | null = null;
  try {
    embedding = await embedText(`${input.problem}\n${input.reasoning}`.slice(0, 8000));
  } catch {
    // Embeddings are best effort.
  }

  const id = crypto.randomUUID();
  const embeddingSql = embedding ? "vector(?)" : "NULL";
  const insertArgs: Array<string | number | null> = [
    id,
    input.userId,
    input.sessionId,
    now,
    input.type,
    input.problem,
    JSON.stringify(normalizedContext),
    input.reasoning,
    JSON.stringify(input.approaches),
    input.solution ?? null,
    resolved.outcome,
    input.errorMessage ?? null,
    JSON.stringify(input.toolsUsed),
    JSON.stringify(input.filesModified),
    input.durationMs,
    input.sanitized ? 1 : 0,
    input.sanitizedAt ?? null,
    now,
    now,
  ];
  if (embedding) {
    insertArgs.push(JSON.stringify(embedding));
  }
  insertArgs.push(
    embedding ? JSON.stringify(embedding) : null,
    traceHash,
    resolved.source,
    resolved.confidence,
    JSON.stringify(automatedSignals),
    shareEligible ? 1 : 0,
    sharedSignature,
    input.explicitFeedbackNotes ?? null,
  );

  await client.execute({
    sql: `
      INSERT INTO coding_traces (
        id, user_id, session_id, timestamp, type, problem, context_json,
        reasoning, approaches_json, solution, outcome, error_message,
        tools_used_json, files_modified_json, duration_ms, sanitized,
        sanitized_at, created_at, updated_at, embedding, embedding_json,
        trace_hash, outcome_source, outcome_confidence, automated_signals_json,
        share_eligible, shared_signature, explicit_feedback_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${embeddingSql}, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: insertArgs,
  });

  const result = await client.execute({
    sql: `SELECT * FROM coding_traces WHERE id = ? LIMIT 1`,
    args: [id],
  });
  if (input.applicationId) {
    await attachTraceToApplication({
      userId: input.userId,
      applicationId: input.applicationId,
      traceId: id,
    });
  }
  return rowToTrace(result.rows[0] as Record<string, unknown>);
}

export async function getTraceById(traceId: string, userId?: string): Promise<CodingTrace | null> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `SELECT * FROM coding_traces WHERE id = ? ${userId ? "AND user_id = ?" : ""} LIMIT 1`,
    args: userId ? [traceId, userId] : [traceId],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? rowToTrace(row) : null;
}

export async function getRecentTraces(userId: string, limit = 20): Promise<CodingTrace[]> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT * FROM coding_traces
      WHERE user_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `,
    args: [userId, Math.max(1, Math.min(limit, 100))],
  });
  return result.rows.map((row) => rowToTrace(row as Record<string, unknown>));
}

export async function getRelevantTraces(userId: string, problem: string, limit = 5): Promise<CodingTrace[]> {
  await ensureInitialized();
  const client = getDb();

  let embedding: number[] | null = null;
  try {
    embedding = await embedText(problem);
  } catch {
    // Fall back to lexical scoring.
  }

  if (embedding) {
    const result = await client.execute({
      sql: `
        SELECT *, vector_distance_cos(embedding, vector(?)) as distance
        FROM coding_traces
        WHERE user_id = ? AND embedding IS NOT NULL
        ORDER BY distance ASC, timestamp DESC
        LIMIT ?
      `,
      args: [JSON.stringify(embedding), userId, Math.max(1, Math.min(limit, 20))],
    });
    return result.rows.map((row) => rowToTrace(row as Record<string, unknown>));
  }

  const keywords = extractProblemKeywords(problem, 5);
  if (keywords.length === 0) {
    return getRecentTraces(userId, limit);
  }

  const result = await client.execute({
    sql: `
      SELECT * FROM coding_traces
      WHERE user_id = ?
        AND (${keywords.map(() => "LOWER(problem) LIKE ?").join(" OR ")})
      ORDER BY timestamp DESC
      LIMIT ?
    `,
    args: [userId, ...keywords.map((keyword) => `%${keyword}%`), Math.max(1, Math.min(limit, 20))],
  });
  return result.rows.map((row) => rowToTrace(row as Record<string, unknown>));
}

export async function updateTraceOutcome(params: {
  userId: string;
  traceId: string;
  outcome: "success" | "partial" | "failed" | "abandoned";
  notes?: string | null;
  automatedSignals?: Record<string, unknown> | null;
  applicationId?: string | null;
  repoProfile?: Record<string, unknown> | null;
  materializedPatternId?: string | null;
  materializedSkillId?: string | null;
  retryCount?: number | null;
  baselineGroupKey?: string | null;
  acceptedTraceId?: string | null;
  acceptedPatternId?: string | null;
  acceptedSkillId?: string | null;
  timeToResolutionMs?: number | null;
  verificationSummary?: Record<string, unknown> | null;
}): Promise<CodingTrace | null> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();

  await client.execute({
    sql: `
      UPDATE coding_traces
      SET outcome = ?,
          outcome_source = 'explicit',
          outcome_confidence = 1.0,
          explicit_feedback_notes = ?,
          automated_signals_json = COALESCE(?, automated_signals_json),
          updated_at = ?
      WHERE id = ? AND user_id = ?
    `,
    args: [
      params.outcome,
      params.notes ?? null,
      params.automatedSignals ? JSON.stringify(params.automatedSignals) : null,
      now,
      params.traceId,
      params.userId,
    ],
  });

  const trace = await getTraceById(params.traceId, params.userId);
  if (!trace) {
    return null;
  }

  const matchedPatterns = await getTracePatternMatches(params.traceId);
  await recomputePatternStats(matchedPatterns.map((match) => match.patternId));
  if (params.applicationId) {
    await updateApplicationOutcome({
      userId: params.userId,
      applicationId: params.applicationId,
      traceId: params.traceId,
      finalOutcome: params.outcome,
      repoProfile: params.repoProfile,
      materializedPatternId: params.materializedPatternId,
      materializedSkillId: params.materializedSkillId,
      retryCount: params.retryCount,
      baselineGroupKey: params.baselineGroupKey,
      acceptedTraceId: params.acceptedTraceId,
      acceptedPatternId: params.acceptedPatternId,
      acceptedSkillId: params.acceptedSkillId,
      timeToResolutionMs: params.timeToResolutionMs,
      verificationSummary: params.verificationSummary,
    });
  }
  return trace;
}

export async function createPattern(input: CreatePatternInput): Promise<Pattern> {
  await ensureInitialized();
  const client = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const scope = input.scope ?? (input.userId ? "local" : "global");
  const scopeKey = scope === "org" ? input.orgId ?? "org" : input.userId ?? "global";
  const patternKey = input.patternKey ?? `${scope}:${scopeKey}:${normalizeForFingerprint(input.domain)}:${crypto.randomUUID()}`;
  const sharedSignature = scope === "global" || scope === "org" ? null : (input.sharedSignature ?? null);

  await client.execute({
    sql: `
      INSERT INTO cognitive_patterns (
        id, user_id, scope, org_id, source_pattern_id, provenance_json, pattern_key, shared_signature, domain, trigger_json,
        approach, steps_json, pitfalls_json, confidence, success_count, fail_count,
        source_trace_count, last_applied, source_trace_ids_json, status, synthesized_into_skill,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?)
    `,
    args: [
      id,
      input.userId ?? null,
      scope,
      input.orgId ?? null,
      input.sourcePatternId ?? null,
      JSON.stringify(input.provenance ?? {}),
      patternKey,
      sharedSignature,
      input.domain,
      JSON.stringify(input.trigger),
      input.approach,
      input.steps ? JSON.stringify(input.steps) : null,
      input.pitfalls ? JSON.stringify(input.pitfalls) : null,
      input.confidence,
      input.successCount,
      input.failCount,
      input.sourceTraceCount ?? input.sourceTraceIds.length,
      JSON.stringify(input.sourceTraceIds),
      input.status ?? "candidate",
      now,
      now,
    ],
  });

  const result = await client.execute({
    sql: `SELECT * FROM cognitive_patterns WHERE id = ? LIMIT 1`,
    args: [id],
  });
  return rowToPattern(result.rows[0] as Record<string, unknown>);
}

export async function getPatterns(userId: string, domain?: string): Promise<Pattern[]> {
  await ensureInitialized();
  const client = getDb();
  const membership = await getCognitiveOrgMembership(userId);
  const policy = membership?.orgId ? await getCognitiveOrgPolicy(membership.orgId) : null;
  const orgId = policy?.orgPatternSharingEnabled ? membership?.orgId ?? null : null;
  const result = await client.execute({
    sql: `
      SELECT * FROM cognitive_patterns
      WHERE (
          user_id = ?
          OR scope = 'global'
          OR (scope = 'org' AND org_id = ?)
        )
        ${domain ? "AND domain = ?" : ""}
      ORDER BY scope ASC, confidence DESC, updated_at DESC
    `,
    args: domain ? [userId, orgId, domain] : [userId, orgId],
  });
  return result.rows.map((row) => rowToPattern(row as Record<string, unknown>));
}

export async function getMatchingPatterns(params: {
  userId: string;
  problem: string;
  technologies?: string[];
  limit?: number;
}): Promise<Array<Pattern & { score: number }>> {
  const patterns = await getPatterns(params.userId);
  const scored = patterns
    .filter((pattern) => isInjectablePatternStatus(pattern.status))
    .map((pattern) => ({
      ...pattern,
      score: scorePatternMatch({
        pattern,
        problem: params.problem,
        technologies: params.technologies ?? [],
      }),
    }))
    .filter((pattern) => pattern.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.confidence - left.confidence ||
        right.updatedAt.localeCompare(left.updatedAt),
    )
    .slice(0, params.limit ?? 5);

  return scored;
}

export async function getRelevantSkills(params: {
  userId: string;
  problem: string;
  technologies?: string[];
  limit?: number;
}): Promise<SynthesizedSkill[]> {
  await ensureInitialized();
  await refreshSkillStatuses(params.userId);
  const matches = await getMatchingPatterns({
    userId: params.userId,
    problem: params.problem,
    technologies: params.technologies,
    limit: params.limit ?? 5,
  });
  if (matches.length === 0) {
    return [];
  }

  const client = getDb();
  const scoreByPatternKey = new Map(matches.map((pattern) => [pattern.patternKey, pattern.score]));
  const patternKeys = matches.map((pattern) => pattern.patternKey);
  const result = await client.execute({
    sql: `
      SELECT * FROM synthesized_skills
      WHERE pattern_key IN (${patternKeys.map(() => "?").join(",")})
        AND (user_id = ? OR scope = 'global')
      ORDER BY updated_at DESC
    `,
    args: [...patternKeys, params.userId],
  });
  return result.rows
    .map((row) => rowToSkill(row as Record<string, unknown>))
    .filter((skill) => isInjectableSkillStatus(skill.status))
    .sort(
      (left, right) =>
        (scoreByPatternKey.get(right.patternKey) ?? 0) - (scoreByPatternKey.get(left.patternKey) ?? 0) ||
        right.successRate - left.successRate ||
        right.updatedAt.localeCompare(left.updatedAt),
    )
    .slice(0, params.limit ?? 3);
}

export async function updatePatternFeedback(params: {
  userId: string;
  patternId: string;
  traceId: string;
  outcome: "success" | "failure";
  notes?: string | null;
}): Promise<boolean> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  const pattern = await getVisiblePatternForUser(params.userId, params.patternId);
  if (!pattern) {
    return false;
  }

  const traceResult = await client.execute({
    sql: `
      SELECT id
      FROM coding_traces
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `,
    args: [params.traceId, params.userId],
  });
  if (!traceResult.rows[0]) {
    return false;
  }

  const existingMatch = await client.execute({
    sql: `
      SELECT id, user_id, match_source, score, created_at
      FROM trace_pattern_matches
      WHERE trace_id = ? AND pattern_id = ?
      LIMIT 1
    `,
    args: [params.traceId, params.patternId],
  });

  if (existingMatch.rows[0]) {
    await client.execute({
      sql: `
        UPDATE trace_pattern_matches
        SET explicit_outcome = ?,
            feedback_notes = ?,
            updated_at = ?
        WHERE trace_id = ? AND pattern_id = ?
      `,
      args: [params.outcome, params.notes ?? null, now, params.traceId, params.patternId],
    });
  } else {
    const matchUserId =
      pattern.scope === "global"
        ? "__global__"
        : pattern.scope === "org"
          ? `org:${pattern.orgId ?? "unknown"}`
          : params.userId;
    await client.execute({
      sql: `
        INSERT INTO trace_pattern_matches (
          id, user_id, trace_id, pattern_id, score, match_source, explicit_outcome, feedback_notes, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, 'explicit_feedback', ?, ?, ?, ?)
      `,
      args: [
        crypto.randomUUID(),
        matchUserId,
        params.traceId,
        params.patternId,
        1,
        params.outcome,
        params.notes ?? null,
        now,
        now,
      ],
    });
  }

  await recomputePatternStats([params.patternId]);
  return true;
}

export async function getSkillCandidates(userId: string): Promise<Pattern[]> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT * FROM cognitive_patterns
      WHERE (user_id = ? OR scope = 'global')
        AND status IN ('active_local', 'active_global', 'synthesized_local', 'synthesized_global')
        AND confidence >= 0.8
        AND success_count >= 5
      ORDER BY confidence DESC, updated_at DESC
    `,
    args: [userId],
  });
  return result.rows
    .map((row) => rowToPattern(row as Record<string, unknown>))
    .filter((pattern) =>
      isSkillSynthesisEligible({
        status: pattern.status,
        confidence: pattern.confidence,
        successCount: pattern.successCount,
        failCount: pattern.failCount,
      }),
    );
}

async function syncPatternExtractionMatches(params: {
  patternId: string;
  traceIds: string[];
  score?: number;
  includeUserScopedMatches?: boolean;
}): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  const traceIds = Array.from(new Set(params.traceIds.filter(Boolean)));

  await client.execute({
    sql: `DELETE FROM trace_pattern_matches WHERE pattern_id = ? AND match_source = 'pattern_extraction'`,
    args: [params.patternId],
  });

  if (traceIds.length === 0) {
    return;
  }

  const traces = await client.execute({
    sql: `
      SELECT id, user_id
      FROM coding_traces
      WHERE id IN (${traceIds.map(() => "?").join(",")})
    `,
    args: traceIds,
  });

  const now = new Date().toISOString();
  for (const row of traces.rows) {
    const userId = params.includeUserScopedMatches === false ? "__global__" : (row.user_id as string);
    await client.execute({
      sql: `
        INSERT INTO trace_pattern_matches (
          id, user_id, trace_id, pattern_id, score, match_source, created_at
        ) VALUES (?, ?, ?, ?, ?, 'pattern_extraction', ?)
        ON CONFLICT(trace_id, pattern_id) DO NOTHING
      `,
      args: [
        crypto.randomUUID(),
        userId,
        row.id as string,
        params.patternId,
        params.score ?? 1,
        now,
      ],
    });
  }
}

async function clearPatternExtractionMatches(patternId: string): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  await client.execute({
    sql: `DELETE FROM trace_pattern_matches WHERE pattern_id = ? AND match_source = 'pattern_extraction'`,
    args: [patternId],
  });
}

export async function getTracePatternMatches(traceId: string, userId?: string): Promise<TracePatternMatch[]> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT *
      FROM trace_pattern_matches
      WHERE trace_id = ?
      ${userId ? "AND user_id = ?" : ""}
      ORDER BY score DESC, created_at DESC
    `,
    args: userId ? [traceId, userId] : [traceId],
  });
  return result.rows.map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    traceId: row.trace_id as string,
    patternId: row.pattern_id as string,
    score: Number(row.score ?? 0),
    matchSource: (row.match_source as string) ?? "trace_capture",
    explicitOutcome: ((row.explicit_outcome as "success" | "failure" | null | undefined) ?? null),
    feedbackNotes: (row.feedback_notes as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

export async function syncTracePatternMatches(params: {
  userId: string;
  traceId: string;
  patterns: Array<{ id: string; score: number }>;
  matchSource?: string;
}): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  const existingMatches = await client.execute({
    sql: `
      SELECT pattern_id
      FROM trace_pattern_matches
      WHERE trace_id = ? AND user_id = ?
        AND match_source NOT IN ('pattern_extraction', 'explicit_feedback')
    `,
    args: [params.traceId, params.userId],
  });
  await client.execute({
    sql: `
      DELETE FROM trace_pattern_matches
      WHERE trace_id = ? AND user_id = ?
        AND match_source NOT IN ('pattern_extraction', 'explicit_feedback')
    `,
    args: [params.traceId, params.userId],
  });

  const now = new Date().toISOString();
  for (const pattern of params.patterns) {
    await client.execute({
      sql: `
        INSERT INTO trace_pattern_matches (
          id, user_id, trace_id, pattern_id, score, match_source, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        crypto.randomUUID(),
        params.userId,
        params.traceId,
        pattern.id,
        pattern.score,
        params.matchSource ?? "trace_capture",
        now,
      ],
    });
  }

  const touchedPatternIds = new Set<string>(params.patterns.map((pattern) => pattern.id));
  for (const row of existingMatches.rows) {
    if (typeof row.pattern_id === "string") {
      touchedPatternIds.add(row.pattern_id);
    }
  }

  await recomputePatternStats([...touchedPatternIds]);
}

export async function recomputePatternStats(patternIds: string[]): Promise<void> {
  await ensureInitialized();
  const uniquePatternIds = Array.from(new Set(patternIds.filter(Boolean)));
  if (uniquePatternIds.length === 0) {
    return;
  }

  await recomputePatternImpactStats(uniquePatternIds);
  const client = getDb();
  const now = new Date().toISOString();
  for (const patternId of uniquePatternIds) {
    const patternResult = await client.execute({
      sql: `
        SELECT scope, status, confidence, success_count, fail_count, source_trace_count,
               application_count, accepted_application_count, successful_application_count,
               median_time_to_resolution_ms, median_retries, verification_pass_rate, impact_score, promotion_reason
        FROM cognitive_patterns
        WHERE id = ?
        LIMIT 1
      `,
      args: [patternId],
    });
    const patternRow = patternResult.rows[0] as Record<string, unknown> | undefined;
    if (!patternRow) {
      continue;
    }
    const patternScope = ((patternRow.scope as "local" | "global" | "org" | undefined) ?? "local");
    const currentStatus = (patternRow.status as string | undefined) ?? "candidate";
    const stats = await client.execute({
      sql: `
        SELECT t.*, m.explicit_outcome, m.feedback_notes
        FROM trace_pattern_matches m
        JOIN coding_traces t ON t.id = m.trace_id
        WHERE m.pattern_id = ?
      `,
      args: [patternId],
    });
    const evidence = stats.rows.map((row) => {
      const traceRow = rowToTrace(row as Record<string, unknown>);
      const trace = asLearningTrace(traceRow);
      const explicitOutcome = row.explicit_outcome as string | null | undefined;
      if (explicitOutcome === "success" || explicitOutcome === "failure") {
        trace.outcome = explicitOutcome === "failure" ? "failed" : "success";
        trace.outcomeSource = "explicit";
        trace.outcomeConfidence = 1;
      }
      return {
        trace,
        updatedAt: traceRow.updatedAt || traceRow.createdAt,
        score: scoreTraceEvidence(trace),
      };
    });

    const summary = summarizePatternEvidence(evidence.map((item) => item.trace));
    let successCount = summary.successCount;
    let failCount = summary.failCount;
    let confidence = summary.confidence;
    let effectiveEvidence = summary.effectiveEvidence;
    if (patternScope === "org" && effectiveEvidence < 2.5 && Number(patternRow.source_trace_count ?? 0) > 0) {
      successCount = Number(patternRow.success_count ?? 0);
      failCount = Number(patternRow.fail_count ?? 0);
      confidence = Number(patternRow.confidence ?? 0);
      effectiveEvidence = Math.max(Number(patternRow.source_trace_count ?? 0), effectiveEvidence);
    }
    const lastApplied = evidence.reduce<string | null>(
      (latest, item) => (!latest || item.updatedAt > latest ? item.updatedAt : latest),
      null,
    );
    const status = classifyPatternLifecycle({
      effectiveEvidence,
      confidence,
      scope: patternScope,
      impact: {
        applications: Number(patternRow.application_count ?? 0),
        acceptedApplications: Number(patternRow.accepted_application_count ?? 0),
        successfulApplications: Number(patternRow.successful_application_count ?? 0),
        medianTimeToResolutionMs:
          patternRow.median_time_to_resolution_ms == null ? null : Number(patternRow.median_time_to_resolution_ms),
        medianRetries: patternRow.median_retries == null ? null : Number(patternRow.median_retries),
        verificationPassRate: Number(patternRow.verification_pass_rate ?? 0),
        impactScore: Number(patternRow.impact_score ?? 0),
        promotionReason: (patternRow.promotion_reason as string | null) ?? "pattern_impact_refresh",
      },
    });
    const nextStatus =
      currentStatus.startsWith("synthesized_") && status !== "deprecated"
        ? synthesizedPatternStatus(patternScope)
        : status;

    await client.execute({
      sql: `
        UPDATE cognitive_patterns
        SET success_count = ?,
            fail_count = ?,
            confidence = ?,
            status = ?,
            last_applied = ?,
            updated_at = ?
        WHERE id = ?
      `,
      args: [successCount, failCount, confidence, nextStatus, lastApplied, now, patternId],
    });
  }
}

export async function runPatternExtraction(params: {
  userId: string;
  includeGlobal?: boolean;
  minTraces?: number;
  minSuccessRate?: number;
}): Promise<{
  localPatterns: number;
  globalPatterns: number;
  touchedPatternIds: string[];
}> {
  await ensureInitialized();
  const client = getDb();
  const minTraces = params.minTraces ?? 3;
  const minSuccessRate = params.minSuccessRate ?? 0.7;
  const existingLocalResult = await client.execute({
    sql: `SELECT id, pattern_key FROM cognitive_patterns WHERE scope = 'local' AND user_id = ?`,
    args: [params.userId],
  });
  const existingLocalByKey = new Map(
    existingLocalResult.rows.map((row) => [row.pattern_key as string, row.id as string]),
  );

  const localRows = await client.execute({
    sql: `SELECT * FROM coding_traces WHERE user_id = ? AND sanitized = 1 ORDER BY created_at DESC LIMIT 500`,
    args: [params.userId],
  });
  const localTraces = localRows.rows.map((row) => asLearningTrace(rowToTrace(row as Record<string, unknown>)));
  const localClusters = clusterLearningTraces({ traces: localTraces, scope: "local" });
  const localCandidates = localClusters
    .filter((cluster) => cluster.traces.length >= minTraces)
    .map(extractPatternCandidate)
    .filter(
      (pattern): pattern is NonNullable<typeof pattern> =>
        pattern != null && pattern.confidence >= minSuccessRate,
    );

  let localPatterns = 0;
  const touchedPatternIds: string[] = [];
  const localCandidateKeys = new Set<string>();
  for (const candidate of localCandidates) {
    localCandidateKeys.add(candidate.key);
    const pattern = await upsertPatternCandidate({
      ...candidate,
      status: classifyPatternLifecycle({
        effectiveEvidence: candidate.sourceTraceCount,
        confidence: candidate.confidence,
        scope: candidate.scope,
        impact: {
          applications: 0,
          acceptedApplications: 0,
          successfulApplications: 0,
          medianTimeToResolutionMs: null,
          medianRetries: null,
          verificationPassRate: 0,
          impactScore: 0,
          promotionReason: "pending_application_impact",
        },
      }),
    });
    await syncPatternExtractionMatches({
      patternId: pattern.id,
      traceIds: candidate.sourceTraceIds,
      score: Math.max(candidate.confidence, 0.1),
    });
    touchedPatternIds.push(pattern.id);
    localPatterns += 1;
  }

  for (const [patternKey, patternId] of existingLocalByKey.entries()) {
    if (localCandidateKeys.has(patternKey)) {
      continue;
    }
    await clearPatternExtractionMatches(patternId);
    touchedPatternIds.push(patternId);
  }

  let globalPatterns = 0;
  if (params.includeGlobal) {
    const existingGlobalResult = await client.execute({
      sql: `SELECT id, pattern_key FROM cognitive_patterns WHERE scope = 'global'`,
      args: [],
    });
    const existingGlobalByKey = new Map(
      existingGlobalResult.rows.map((row) => [row.pattern_key as string, row.id as string]),
    );
    const globalRows = await client.execute({
      sql: `
        SELECT * FROM coding_traces
        WHERE share_eligible = 1 AND sanitized = 1
        ORDER BY created_at DESC
        LIMIT 1000
      `,
      args: [],
    });
    const globalTraces = globalRows.rows
      .map((row) => asLearningTrace(rowToTrace(row as Record<string, unknown>)))
      .filter((trace) => trace.shareEligible);
    const globalClusters = clusterLearningTraces({ traces: globalTraces, scope: "global" });
    const globalCandidates = globalClusters
      .filter((cluster) => cluster.traces.length >= minTraces)
      .map(extractPatternCandidate)
      .filter(
        (pattern): pattern is NonNullable<typeof pattern> =>
          pattern != null && pattern.confidence >= minSuccessRate,
      );

    const globalCandidateKeys = new Set<string>();
    for (const candidate of globalCandidates) {
      globalCandidateKeys.add(candidate.key);
      const pattern = await upsertPatternCandidate({
        ...candidate,
        status: classifyPatternLifecycle({
          effectiveEvidence: candidate.sourceTraceCount,
          confidence: candidate.confidence,
          scope: candidate.scope,
          impact: {
            applications: 0,
            acceptedApplications: 0,
            successfulApplications: 0,
            medianTimeToResolutionMs: null,
            medianRetries: null,
            verificationPassRate: 0,
            impactScore: 0,
            promotionReason: "pending_application_impact",
          },
        }),
      });
      await syncPatternExtractionMatches({
        patternId: pattern.id,
        traceIds: candidate.sourceTraceIds,
        score: Math.max(candidate.confidence, 0.1),
        includeUserScopedMatches: false,
      });
      touchedPatternIds.push(pattern.id);
      globalPatterns += 1;
    }

    for (const [patternKey, patternId] of existingGlobalByKey.entries()) {
      if (globalCandidateKeys.has(patternKey)) {
        continue;
      }
      await clearPatternExtractionMatches(patternId);
      touchedPatternIds.push(patternId);
    }
  }

  await recomputePatternStats(touchedPatternIds);
  return {
    localPatterns,
    globalPatterns,
    touchedPatternIds,
  };
}

async function upsertPatternCandidate(candidate: {
  key: string;
  scope: "local" | "global";
  userId: string | null;
  domain: string;
  trigger: Record<string, unknown>;
  approach: string;
  steps: string[];
  pitfalls: string[];
  confidence: number;
  successCount: number;
  failCount: number;
  sourceTraceIds: string[];
  sourceTraceCount: number;
  status: string;
}): Promise<Pattern> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  const sharedContent =
    candidate.scope === "global"
      ? redactSharedPatternContent({
          trigger: {
            keywords: parseStringArray(candidate.trigger.keywords),
            technologies: parseStringArray(candidate.trigger.technologies),
            errorPatterns: parseStringArray(candidate.trigger.errorPatterns),
            problemTypes: parseStringArray(candidate.trigger.problemTypes),
          },
          approach: candidate.approach,
          steps: candidate.steps,
          pitfalls: candidate.pitfalls,
        })
      : {
          trigger: candidate.trigger,
          approach: candidate.approach,
          steps: candidate.steps,
          pitfalls: candidate.pitfalls,
        };
  const provenance = {
    kind: candidate.scope === "global" ? "shared_global_extraction" : "local_extraction",
    sourceScope: candidate.scope,
    redacted: candidate.scope === "global",
    sourceTraceCount: candidate.sourceTraceCount,
    sourceTraceIds: candidate.scope === "local" ? candidate.sourceTraceIds : [],
    generatedAt: now,
  };
  const existing = await client.execute({
    sql: `SELECT * FROM cognitive_patterns WHERE pattern_key = ? LIMIT 1`,
    args: [candidate.key],
  });

  if (existing.rows[0]) {
    await client.execute({
      sql: `
        UPDATE cognitive_patterns
        SET user_id = ?,
            scope = ?,
            provenance_json = ?,
            shared_signature = NULL,
            domain = ?,
            trigger_json = ?,
            approach = ?,
            steps_json = ?,
            pitfalls_json = ?,
            confidence = ?,
            success_count = ?,
            fail_count = ?,
            source_trace_count = ?,
            source_trace_ids_json = ?,
            status = ?,
            updated_at = ?
        WHERE pattern_key = ?
      `,
      args: [
        candidate.userId,
        candidate.scope,
        JSON.stringify(provenance),
        candidate.domain,
        JSON.stringify(sharedContent.trigger),
        sharedContent.approach,
        JSON.stringify(sharedContent.steps),
        JSON.stringify(sharedContent.pitfalls),
        candidate.confidence,
        candidate.successCount,
        candidate.failCount,
        candidate.sourceTraceCount,
        JSON.stringify(candidate.scope === "local" ? candidate.sourceTraceIds : []),
        candidate.status,
        now,
        candidate.key,
      ],
    });

    const refreshed = await client.execute({
      sql: `SELECT * FROM cognitive_patterns WHERE pattern_key = ? LIMIT 1`,
      args: [candidate.key],
    });
    return rowToPattern(refreshed.rows[0] as Record<string, unknown>);
  }

  return createPattern({
    userId: candidate.userId,
    scope: candidate.scope,
    provenance,
    patternKey: candidate.key,
    sharedSignature: null,
    domain: candidate.domain,
    trigger: sharedContent.trigger,
    approach: sharedContent.approach,
    steps: sharedContent.steps,
    pitfalls: sharedContent.pitfalls,
    confidence: candidate.confidence,
    successCount: candidate.successCount,
    failCount: candidate.failCount,
    sourceTraceIds: candidate.scope === "local" ? candidate.sourceTraceIds : [],
    sourceTraceCount: candidate.sourceTraceCount,
    status: candidate.status,
  });
}

export async function synthesizeEligibleSkills(params: { userId: string }): Promise<SynthesizedSkill[]> {
  await ensureInitialized();
  const candidates = await getSkillCandidates(params.userId);
  const skills: SynthesizedSkill[] = [];
  const client = getDb();
  const now = new Date().toISOString();

  for (const pattern of candidates) {
    const trigger = parseObject(pattern.triggerJson);
    const draft = buildSkillDraft({
      patternId: pattern.id,
      domain: pattern.domain,
      trigger: {
        keywords: parseStringArray(trigger.keywords),
        technologies: parseStringArray(trigger.technologies),
        errorPatterns: parseStringArray(trigger.errorPatterns),
      },
      approach: pattern.approach,
      steps: parseStringArray(pattern.stepsJson),
      pitfalls: parseStringArray(pattern.pitfallsJson),
      confidence: pattern.confidence,
    });
    const content = {
      whenToUse: `Use for ${pattern.domain} issues when the trigger matches.`,
      procedure: parseStringArray(pattern.stepsJson).length > 0 ? parseStringArray(pattern.stepsJson) : [pattern.approach],
      commonPitfalls: parseStringArray(pattern.pitfallsJson),
      verification: "Re-run the failing workflow and confirm the error no longer reproduces.",
    };

    const existing = await client.execute({
      sql: `SELECT * FROM synthesized_skills WHERE pattern_key = ? LIMIT 1`,
      args: [pattern.patternKey],
    });
    const skillStatus = deriveSkillLifecycle({
      patternStatus: pattern.status,
      confidence: pattern.confidence,
      impact: {
        applications: pattern.applicationCount,
        acceptedApplications: pattern.acceptedApplicationCount,
        successfulApplications: pattern.successfulApplicationCount,
        medianTimeToResolutionMs: pattern.medianTimeToResolutionMs,
        medianRetries: pattern.medianRetries,
        verificationPassRate: pattern.verificationPassRate,
        impactScore: pattern.impactScore,
        promotionReason: pattern.promotionReason ?? "pattern_impact_carryover",
      },
    });
    const sourceTraceIdsJson = pattern.scope === "local" ? pattern.sourceTraceIdsJson : "[]";

    if (existing.rows[0]) {
      await client.execute({
        sql: `
          UPDATE synthesized_skills
          SET user_id = ?, scope = ?, pattern_id = ?, name = ?, description = ?, markdown = ?, content_json = ?, quality_score = ?,
              success_rate = ?, source_trace_count = ?, source_pattern_ids_json = ?, source_trace_ids_json = ?, status = ?, updated_at = ?
          WHERE pattern_key = ?
        `,
        args: [
          pattern.userId,
          pattern.scope,
          pattern.id,
          draft.name,
          draft.description,
          draft.markdown,
          JSON.stringify(content),
          pattern.confidence,
          pattern.confidence,
          pattern.sourceTraceCount,
          JSON.stringify([pattern.id]),
          sourceTraceIdsJson,
          skillStatus,
          now,
          pattern.patternKey,
        ],
      });
      const refreshed = await client.execute({
        sql: `SELECT * FROM synthesized_skills WHERE pattern_key = ? LIMIT 1`,
        args: [pattern.patternKey],
      });
      skills.push(rowToSkill(refreshed.rows[0] as Record<string, unknown>));
    } else {
      const id = crypto.randomUUID();
      await client.execute({
        sql: `
          INSERT INTO synthesized_skills (
            id, user_id, scope, pattern_id, pattern_key, name, description, markdown,
            content_json, quality_score, usage_count, success_rate, status, published,
            published_to, clawhub_id, source_trace_count, source_pattern_ids_json, source_trace_ids_json,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, NULL, NULL, ?, ?, ?, ?, ?)
        `,
        args: [
          id,
          pattern.userId,
          pattern.scope,
          pattern.id,
          pattern.patternKey,
          draft.name,
          draft.description,
          draft.markdown,
          JSON.stringify(content),
          pattern.confidence,
          pattern.confidence,
          skillStatus,
          pattern.sourceTraceCount,
          JSON.stringify([pattern.id]),
          sourceTraceIdsJson,
          now,
          now,
        ],
      });
      const inserted = await client.execute({
        sql: `SELECT * FROM synthesized_skills WHERE id = ? LIMIT 1`,
        args: [id],
      });
      skills.push(rowToSkill(inserted.rows[0] as Record<string, unknown>));
    }

    await client.execute({
      sql: `
        UPDATE cognitive_patterns
        SET synthesized_into_skill = ?, status = ?, updated_at = ?
        WHERE id = ?
      `,
      args: [skills[skills.length - 1].id, synthesizedPatternStatus(pattern.scope), now, pattern.id],
    });
  }

  return skills;
}

function verificationPassed(summary: Record<string, unknown> | null): boolean | null {
  if (!summary) {
    return null;
  }
  if (summary.verified === true) {
    return true;
  }
  const passedChecks = parseStringArray(summary.passedChecks);
  const testsPassed = parseStringArray(summary.testsPassed);
  if (passedChecks.length > 0 || testsPassed.length > 0) {
    return true;
  }
  const failedChecks = parseStringArray(summary.failedChecks);
  const testsFailed = parseStringArray(summary.testsFailed);
  if (failedChecks.length > 0 || testsFailed.length > 0) {
    return false;
  }
  const resolutionKind = typeof summary.resolutionKind === "string" ? summary.resolutionKind : null;
  if (resolutionKind && resolutionKind !== "failed") {
    return true;
  }
  if (resolutionKind === "failed") {
    return false;
  }
  return null;
}

function deriveRepoFamily(profile: Record<string, unknown>, trace: CodingTrace | null): string | null {
  const workspaceRoot = typeof profile.workspaceRoot === "string" ? profile.workspaceRoot : null;
  if (workspaceRoot) {
    const segments = workspaceRoot.split(/[\\/]/).filter(Boolean);
    return segments.slice(-2).join("/").toLowerCase() || null;
  }
  const context = trace ? parseObject(trace.contextJson) : {};
  const projectType = typeof context.projectType === "string" ? context.projectType : null;
  return projectType ? normalizeForFingerprint(projectType) : null;
}

function deriveBaselineGroupKey(params: {
  explicitGroupKey?: string | null;
  application: CognitiveApplication;
  trace: CodingTrace | null;
}): string | null {
  if (params.explicitGroupKey) {
    return params.explicitGroupKey;
  }
  const traceContext = params.trace ? parseObject(params.trace.contextJson) : {};
  const technologies = parseStringArray(traceContext.technologies);
  const errorMessages = parseStringArray(traceContext.errorMessages);
  const repoProfile = parseObject(params.application.repoProfileJson);
  const sharedSignature =
    params.trace?.sharedSignature ??
    buildSharedSignature({
      type: params.trace?.type ?? "debugging",
      problem: params.application.problem,
      technologies,
      errorMessages,
    });
  const repoFamily = deriveRepoFamily(repoProfile, params.trace);
  return [
    normalizeForFingerprint(params.application.endpoint),
    sharedSignature,
    repoFamily ?? "",
  ]
    .filter(Boolean)
    .join(":");
}

function summarizeAdaptivePolicyRows(
  rows: CognitiveApplication[],
  contextKey: string,
): AdaptivePolicySummary[] {
  const grouped = new Map<AdaptivePolicyKey, CognitiveApplication[]>();
  for (const row of rows) {
    if (!row.policyKey) {
      continue;
    }
    const existing = grouped.get(row.policyKey) ?? [];
    existing.push(row);
    grouped.set(row.policyKey, existing);
  }

  return [...grouped.entries()].map(([policyKey, applications]) => {
    const resolved = applications.filter((application) => application.finalOutcome != null);
    const rewards = resolved
      .map((application) => application.policyReward)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const retryValues = resolved
      .map((application) => application.retryCount)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const timeValues = resolved
      .map((application) => application.timeToResolutionMs)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    return {
      policyKey,
      contextKey,
      sampleCount: applications.length,
      resolvedCount: resolved.length,
      successCount: resolved.filter((application) => application.finalOutcome === "success").length,
      verifiedSuccessCount: resolved.filter((application) => application.finalOutcome === "success" && verificationPassed(parseObject(application.verificationSummaryJson)) === true).length,
      acceptedCount: resolved.filter((application) => Boolean(application.acceptedTraceId || application.acceptedPatternId || application.acceptedSkillId)).length,
      avgReward:
        rewards.length === 0
          ? 0
          : rewards.reduce((total, reward) => total + reward, 0) / rewards.length,
      avgRetries:
        retryValues.length === 0
          ? null
          : retryValues.reduce((total, value) => total + value, 0) / retryValues.length,
      avgTimeToResolutionMs:
        timeValues.length === 0
          ? null
          : timeValues.reduce((total, value) => total + value, 0) / timeValues.length,
    };
  });
}

async function listAdaptivePolicyApplications(userId: string, contextKey?: string): Promise<CognitiveApplication[]> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT *
      FROM cognitive_applications
      WHERE user_id = ?
        AND policy_key IS NOT NULL
        AND (? IS NULL OR policy_context_key = ?)
      ORDER BY created_at DESC
      LIMIT 250
    `,
    args: [userId, contextKey ?? null, contextKey ?? null],
  });
  return result.rows.map((row) => rowToApplication(row as Record<string, unknown>));
}

export async function recommendAdaptivePolicyForUser(params: {
  userId: string;
  problem: string;
  endpoint: string;
  technologies?: string[];
  repoProfile?: Record<string, unknown> | null;
  baseTraceLimit?: number;
}): Promise<AdaptivePolicyRecommendation> {
  const features = buildAdaptivePolicyFeatures({
    problem: params.problem,
    endpoint: params.endpoint,
    technologies: params.technologies,
    repoProfile: params.repoProfile,
  });
  const contextKey = buildAdaptivePolicyContextKey(features);
  const [contextApplications, globalApplications] = await Promise.all([
    listAdaptivePolicyApplications(params.userId, contextKey),
    listAdaptivePolicyApplications(params.userId),
  ]);
  return recommendAdaptivePolicy({
    features,
    baseTraceLimit: params.baseTraceLimit,
    contextStats: summarizeAdaptivePolicyRows(contextApplications, contextKey),
    globalStats: summarizeAdaptivePolicyRows(globalApplications, "*"),
  });
}

export async function getAdaptivePolicySummaries(userId: string): Promise<AdaptivePolicySummary[]> {
  const applications = await listAdaptivePolicyApplications(userId);
  return summarizeAdaptivePolicyRows(applications, "*")
    .sort((left, right) => right.avgReward - left.avgReward || right.sampleCount - left.sampleCount);
}

function summarizeWorkflowRows(rows: CognitiveApplication[], contextKey: string): ToolWorkflowSummary[] {
  const grouped = new Map<ToolWorkflowStrategyKey, CognitiveApplication[]>();
  for (const row of rows) {
    if (!row.workflowStrategyKey || row.workflowReward == null) {
      continue;
    }
    const existing = grouped.get(row.workflowStrategyKey) ?? [];
    existing.push(row);
    grouped.set(row.workflowStrategyKey, existing);
  }

  return [...grouped.entries()].map(([strategyKey, applications]) => {
    const resolved = applications.filter((application) => application.finalOutcome != null);
    const rewards = applications
      .map((application) => application.workflowReward)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    return {
      strategyKey,
      contextKey,
      sampleCount: applications.length,
      resolvedCount: resolved.length,
      successCount: resolved.filter((application) => application.finalOutcome === "success").length,
      verifiedSuccessCount: resolved.filter((application) => application.finalOutcome === "success" && verificationPassed(parseObject(application.verificationSummaryJson)) === true).length,
      avgReward:
        rewards.length === 0
          ? 0
          : rewards.reduce((total, reward) => total + reward, 0) / rewards.length,
    };
  });
}

async function listWorkflowApplications(userId: string, contextKey?: string): Promise<CognitiveApplication[]> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT *
      FROM cognitive_applications
      WHERE user_id = ?
        AND workflow_strategy_key IS NOT NULL
        AND (? IS NULL OR workflow_context_key = ?)
      ORDER BY created_at DESC
      LIMIT 250
    `,
    args: [userId, contextKey ?? null, contextKey ?? null],
  });
  return result.rows.map((row) => rowToApplication(row as Record<string, unknown>));
}

export async function recommendToolWorkflowForUser(params: {
  userId: string;
  problem: string;
  endpoint: string;
  technologies?: string[];
  repoProfile?: Record<string, unknown> | null;
}): Promise<ToolWorkflowRecommendation> {
  const features = buildAdaptivePolicyFeatures({
    problem: params.problem,
    endpoint: params.endpoint,
    technologies: params.technologies,
    repoProfile: params.repoProfile,
  });
  const contextKey = buildToolWorkflowContextKey(features);
  const [contextApplications, globalApplications] = await Promise.all([
    listWorkflowApplications(params.userId, contextKey),
    listWorkflowApplications(params.userId),
  ]);
  return recommendToolWorkflow({
    features,
    contextStats: summarizeWorkflowRows(contextApplications, contextKey),
    globalStats: summarizeWorkflowRows(globalApplications, "*"),
  });
}

export async function getToolWorkflowSummaries(userId: string): Promise<ToolWorkflowSummary[]> {
  const applications = await listWorkflowApplications(userId);
  return summarizeWorkflowRows(applications, "*")
    .sort((left, right) => right.avgReward - left.avgReward || right.sampleCount - left.sampleCount);
}

async function computeBaselineSnapshot(params: {
  userId: string;
  baselineGroupKey: string;
  excludeApplicationId?: string;
}): Promise<BaselineSnapshot> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT final_outcome, time_to_resolution_ms, retry_count, verification_summary_json
      FROM cognitive_applications
      WHERE user_id = ?
        AND baseline_group_key = ?
        AND id != COALESCE(?, id)
        AND final_outcome IS NOT NULL
        AND accepted_pattern_id IS NULL
        AND accepted_skill_id IS NULL
        AND materialized_pattern_id IS NULL
        AND materialized_skill_id IS NULL
      ORDER BY created_at DESC
      LIMIT 50
    `,
    args: [params.userId, params.baselineGroupKey, params.excludeApplicationId ?? null],
  });

  const rows = result.rows;
  const timeValues = rows
    .map((row) => (row.time_to_resolution_ms == null ? null : Number(row.time_to_resolution_ms)))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const retryValues = rows
    .map((row) => (row.retry_count == null ? null : Number(row.retry_count)))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const successRate =
    rows.length === 0
      ? 0
      : rows.filter((row) => row.final_outcome === "success").length / rows.length;
  const verificationPassRate =
    rows.length === 0
      ? 0
      : rows.filter((row) => verificationPassed(parseObject(row.verification_summary_json)) === true).length / rows.length;

  return {
    successRate,
    medianTimeToResolutionMs: medianValue(timeValues),
    medianRetries: medianValue(retryValues),
    verificationPassRate,
    sampleSize: rows.length,
  };
}

function applicationObservation(row: Record<string, unknown>): ImpactObservation {
  return {
    accepted: Number(row.accepted ?? 0) === 1,
    explicitNegative: Number(row.explicit_negative ?? 0) === 1,
    finalOutcome: (row.final_outcome as string | null) ?? null,
    timeToResolutionMs: row.time_to_resolution_ms == null ? null : Number(row.time_to_resolution_ms),
    retryCount: row.retry_count == null ? null : Number(row.retry_count),
    verificationPassed: verificationPassed(parseObject(row.verification_summary_json)) ?? undefined,
    baseline: row.baseline_snapshot_json ? (parseObject(row.baseline_snapshot_json) as BaselineSnapshot) : null,
  };
}

async function recomputePatternImpactStats(patternIds: string[]): Promise<void> {
  await ensureInitialized();
  const uniquePatternIds = Array.from(new Set(patternIds.filter(Boolean)));
  if (uniquePatternIds.length === 0) {
    return;
  }
  const client = getDb();
  const now = new Date().toISOString();

  for (const patternId of uniquePatternIds) {
    const stats = await client.execute({
      sql: `
        SELECT
               p.accepted as accepted,
               a.final_outcome,
               COALESCE(feedback.explicit_negative, 0) as explicit_negative,
               a.time_to_resolution_ms,
               a.retry_count,
               a.verification_summary_json,
               a.baseline_snapshot_json
        FROM pattern_applications p
        LEFT JOIN cognitive_applications a ON a.id = p.application_id
        LEFT JOIN (
          SELECT
            trace_id,
            MAX(CASE WHEN explicit_outcome = 'failure' THEN 1 ELSE 0 END) as explicit_negative
          FROM trace_pattern_matches
          WHERE pattern_id = ?
          GROUP BY trace_id
        ) feedback ON feedback.trace_id = a.trace_id
        WHERE p.entity_type = 'pattern' AND p.entity_id = ?
      `,
      args: [patternId, patternId],
    });
    const impact = summarizeEntityImpact(stats.rows.map((row) => applicationObservation(row as Record<string, unknown>)));
    await client.execute({
      sql: `
        UPDATE cognitive_patterns
        SET application_count = ?,
            accepted_application_count = ?,
            successful_application_count = ?,
            median_time_to_resolution_ms = ?,
            median_retries = ?,
            verification_pass_rate = ?,
            impact_score = ?,
            promotion_reason = ?,
            updated_at = ?
        WHERE id = ?
      `,
      args: [
        impact.applications,
        impact.acceptedApplications,
        impact.successfulApplications,
        impact.medianTimeToResolutionMs,
        impact.medianRetries,
        impact.verificationPassRate,
        impact.impactScore,
        impact.promotionReason,
        now,
        patternId,
      ],
    });
  }
}

export async function recomputeSkillStats(skillIds: string[]): Promise<void> {
  await ensureInitialized();
  const uniqueSkillIds = Array.from(new Set(skillIds.filter(Boolean)));
  if (uniqueSkillIds.length === 0) {
    return;
  }
  const client = getDb();
  const now = new Date().toISOString();

  for (const skillId of uniqueSkillIds) {
    const stats = await client.execute({
      sql: `
        SELECT
               p.accepted as accepted,
               a.final_outcome,
               a.time_to_resolution_ms,
               a.retry_count,
               a.verification_summary_json,
               a.baseline_snapshot_json
        FROM pattern_applications p
        LEFT JOIN cognitive_applications a ON a.id = p.application_id
        WHERE p.entity_type = 'skill' AND p.entity_id = ?
      `,
      args: [skillId],
    });
    const impact = summarizeEntityImpact(stats.rows.map((row) => applicationObservation(row as Record<string, unknown>)));
    const successRate = impact.applications === 0 ? 0 : impact.successfulApplications / impact.applications;

    await client.execute({
      sql: `
        UPDATE synthesized_skills
        SET usage_count = ?,
            success_rate = ?,
            quality_score = ?,
            accepted_application_count = ?,
            successful_application_count = ?,
            median_time_to_resolution_ms = ?,
            median_retries = ?,
            verification_pass_rate = ?,
            impact_score = ?,
            promotion_reason = ?,
            updated_at = ?
        WHERE id = ?
      `,
      args: [
        impact.applications,
        successRate,
        Math.max(successRate, impact.impactScore),
        impact.acceptedApplications,
        impact.successfulApplications,
        impact.medianTimeToResolutionMs,
        impact.medianRetries,
        impact.verificationPassRate,
        impact.impactScore,
        impact.promotionReason,
        now,
        skillId,
      ],
    });
  }
}

async function refreshSkillStatuses(userId: string): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  const rows = await client.execute({
    sql: `
      SELECT
        s.id as skill_id,
        s.status as skill_status,
        p.status as pattern_status,
        s.quality_score,
        s.usage_count,
        s.accepted_application_count,
        s.successful_application_count,
        s.median_time_to_resolution_ms,
        s.median_retries,
        s.verification_pass_rate,
        s.impact_score,
        s.promotion_reason
      FROM synthesized_skills s
      JOIN cognitive_patterns p ON p.id = s.pattern_id
      WHERE s.user_id = ? OR s.scope = 'global'
    `,
    args: [userId],
  });
  const now = new Date().toISOString();
  for (const row of rows.rows) {
    const nextStatus = deriveSkillLifecycle({
      patternStatus: (row.pattern_status as string | undefined) ?? "candidate",
      confidence: Number(row.quality_score ?? 0),
      impact: {
        applications: Number(row.usage_count ?? 0),
        acceptedApplications: Number(row.accepted_application_count ?? 0),
        successfulApplications: Number(row.successful_application_count ?? 0),
        medianTimeToResolutionMs: row.median_time_to_resolution_ms == null ? null : Number(row.median_time_to_resolution_ms),
        medianRetries: row.median_retries == null ? null : Number(row.median_retries),
        verificationPassRate: Number(row.verification_pass_rate ?? 0),
        impactScore: Number(row.impact_score ?? 0),
        promotionReason: (row.promotion_reason as string | null) ?? "skill_status_refresh",
      },
    });
    if (nextStatus !== ((row.skill_status as string | undefined) ?? "draft")) {
      await client.execute({
        sql: `UPDATE synthesized_skills SET status = ?, updated_at = ? WHERE id = ?`,
        args: [nextStatus, now, row.skill_id as string],
      });
    }
  }
}

export async function updateApplicationOutcome(params: {
  userId: string;
  applicationId: string;
  traceId?: string | null;
  finalOutcome?: string | null;
  repoProfile?: Record<string, unknown> | null;
  materializedPatternId?: string | null;
  materializedSkillId?: string | null;
  retryCount?: number | null;
  baselineGroupKey?: string | null;
  acceptedTraceId?: string | null;
  acceptedPatternId?: string | null;
  acceptedSkillId?: string | null;
  timeToResolutionMs?: number | null;
  verificationSummary?: Record<string, unknown> | null;
}): Promise<CognitiveApplication | null> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  const existing = await client.execute({
    sql: `
      SELECT *
      FROM cognitive_applications
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `,
    args: [params.applicationId, params.userId],
  });
  if (!existing.rows[0]) {
    return null;
  }
  const existingApplication = rowToApplication(existing.rows[0] as Record<string, unknown>);
  const trace =
    params.traceId != null
      ? await getTraceById(params.traceId, params.userId)
      : existingApplication.traceId
        ? await getTraceById(existingApplication.traceId, params.userId)
        : null;
  const repoProfile = params.repoProfile ?? parseObject(existingApplication.repoProfileJson);
  const baselineGroupKey = deriveBaselineGroupKey({
    explicitGroupKey: params.baselineGroupKey ?? existingApplication.baselineGroupKey,
    application: existingApplication,
    trace,
  });
  const baselineSnapshot =
    baselineGroupKey == null
      ? null
      : await computeBaselineSnapshot({
          userId: params.userId,
          baselineGroupKey,
          excludeApplicationId: params.applicationId,
        });

  await client.execute({
    sql: `
      UPDATE cognitive_applications
      SET trace_id = COALESCE(?, trace_id),
          repo_profile_json = COALESCE(?, repo_profile_json),
          materialized_pattern_id = COALESCE(?, materialized_pattern_id),
          materialized_skill_id = COALESCE(?, materialized_skill_id),
          retry_count = COALESCE(?, retry_count),
          baseline_group_key = COALESCE(?, baseline_group_key),
          baseline_snapshot_json = COALESCE(?, baseline_snapshot_json),
          accepted_trace_id = COALESCE(?, accepted_trace_id),
          accepted_pattern_id = COALESCE(?, accepted_pattern_id),
          accepted_skill_id = COALESCE(?, accepted_skill_id),
          final_outcome = COALESCE(?, final_outcome),
          time_to_resolution_ms = COALESCE(?, time_to_resolution_ms),
          verification_summary_json = COALESCE(?, verification_summary_json),
          updated_at = ?
      WHERE id = ? AND user_id = ?
    `,
    args: [
      params.traceId ?? null,
      repoProfile && Object.keys(repoProfile).length > 0 ? JSON.stringify(repoProfile) : null,
      params.materializedPatternId ?? null,
      params.materializedSkillId ?? null,
      params.retryCount ?? null,
      baselineGroupKey ?? null,
      baselineSnapshot ? JSON.stringify(baselineSnapshot) : null,
      params.acceptedTraceId ?? null,
      params.acceptedPatternId ?? null,
      params.acceptedSkillId ?? null,
      params.finalOutcome ?? null,
      params.timeToResolutionMs ?? null,
      params.verificationSummary ? JSON.stringify(params.verificationSummary) : null,
      now,
      params.applicationId,
      params.userId,
    ],
  });

  if (params.traceId) {
    await attachTraceToApplication({
      userId: params.userId,
      applicationId: params.applicationId,
      traceId: params.traceId,
    });
  }

  if (params.finalOutcome) {
    await client.execute({
      sql: `
        UPDATE pattern_applications
        SET final_outcome = ?,
            updated_at = ?
        WHERE application_id = ? AND user_id = ?
      `,
      args: [params.finalOutcome, now, params.applicationId, params.userId],
    });
  }

  if (params.acceptedTraceId) {
    await client.execute({
      sql: `
        UPDATE pattern_applications
        SET accepted = CASE
              WHEN entity_type = 'trace' AND entity_id = ? THEN 1
              WHEN entity_type = 'trace' THEN 0
              ELSE accepted
            END,
            updated_at = ?
        WHERE application_id = ? AND user_id = ?
      `,
      args: [params.acceptedTraceId, now, params.applicationId, params.userId],
    });
  }

  if (params.acceptedPatternId) {
    await client.execute({
      sql: `
        UPDATE pattern_applications
        SET accepted = CASE
              WHEN entity_type = 'pattern' AND entity_id = ? THEN 1
              WHEN entity_type = 'pattern' THEN 0
              ELSE accepted
            END,
            updated_at = ?
        WHERE application_id = ? AND user_id = ?
      `,
      args: [params.acceptedPatternId, now, params.applicationId, params.userId],
    });
    if (params.traceId && params.finalOutcome) {
      await updatePatternFeedback({
        userId: params.userId,
        patternId: params.acceptedPatternId,
        traceId: params.traceId,
        outcome: params.finalOutcome === "success" ? "success" : "failure",
        notes: null,
      });
    }
  }

  if (params.acceptedSkillId) {
    await client.execute({
      sql: `
        UPDATE pattern_applications
        SET accepted = CASE
              WHEN entity_type = 'skill' AND entity_id = ? THEN 1
              WHEN entity_type = 'skill' THEN 0
              ELSE accepted
            END,
            updated_at = ?
        WHERE application_id = ? AND user_id = ?
      `,
      args: [params.acceptedSkillId, now, params.applicationId, params.userId],
    });
  }

  const skillRows = await client.execute({
    sql: `
      SELECT DISTINCT entity_id
      FROM pattern_applications
      WHERE application_id = ? AND entity_type = 'skill'
    `,
    args: [params.applicationId],
  });
  await recomputeSkillStats(
    skillRows.rows
      .map((row) => row.entity_id)
      .filter((value): value is string => typeof value === "string"),
  );
  const patternIdsToRefresh = new Set<string>();
  const traceForPatterns = params.traceId ?? existingApplication.traceId ?? null;
  if (traceForPatterns) {
    const patternRows = await client.execute({
      sql: `
        SELECT DISTINCT pattern_id
        FROM trace_pattern_matches
        WHERE trace_id = ?
      `,
      args: [traceForPatterns],
    });
    for (const row of patternRows.rows) {
      if (typeof row.pattern_id === "string") {
        patternIdsToRefresh.add(row.pattern_id);
      }
    }
  }
  if (params.materializedPatternId) {
    patternIdsToRefresh.add(params.materializedPatternId);
  }
  await recomputePatternStats([...patternIdsToRefresh]);

  const refreshed = await client.execute({
    sql: `SELECT * FROM cognitive_applications WHERE id = ? LIMIT 1`,
    args: [params.applicationId],
  });
  const nextApplication = refreshed.rows[0] ? rowToApplication(refreshed.rows[0] as Record<string, unknown>) : null;
  if (!nextApplication) {
    return null;
  }

  const resolvedTrace =
    trace ??
    (nextApplication.traceId ? await getTraceById(nextApplication.traceId, params.userId) : null);

  if (nextApplication.policyKey) {
    const acceptedEntity = Boolean(
      nextApplication.acceptedTraceId || nextApplication.acceptedPatternId || nextApplication.acceptedSkillId,
    );
    const policyReward = computeAdaptivePolicyReward({
      accepted: acceptedEntity,
      acceptedEntity,
      materializedEntity: Boolean(nextApplication.materializedPatternId || nextApplication.materializedSkillId),
      finalOutcome: nextApplication.finalOutcome,
      timeToResolutionMs: nextApplication.timeToResolutionMs,
      retryCount: nextApplication.retryCount,
      verificationPassed: verificationPassed(parseObject(nextApplication.verificationSummaryJson)) ?? undefined,
      baseline: nextApplication.baselineSnapshotJson ? (parseObject(nextApplication.baselineSnapshotJson) as BaselineSnapshot) : null,
    });
    await client.execute({
      sql: `UPDATE cognitive_applications SET policy_reward = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      args: [policyReward, new Date().toISOString(), params.applicationId, params.userId],
    });
    nextApplication.policyReward = policyReward;
  }

  if (nextApplication.workflowStrategyKey && resolvedTrace) {
    const features = buildAdaptivePolicyFeatures({
      problem: nextApplication.problem,
      endpoint: nextApplication.endpoint,
      technologies: parseStringArray(parseObject(resolvedTrace.contextJson).technologies),
      repoProfile: parseObject(nextApplication.repoProfileJson),
    });
    const observedWorkflow = classifyObservedToolWorkflow({
      problem: nextApplication.problem,
      features,
      automatedSignals: parseObject(resolvedTrace.automatedSignalsJson),
      context: parseObject(resolvedTrace.contextJson),
    });
    const acceptedEntity = Boolean(
      nextApplication.acceptedTraceId || nextApplication.acceptedPatternId || nextApplication.acceptedSkillId,
    );
    const baseReward = computeAdaptivePolicyReward({
      accepted: acceptedEntity,
      acceptedEntity,
      materializedEntity: Boolean(nextApplication.materializedPatternId || nextApplication.materializedSkillId),
      finalOutcome: nextApplication.finalOutcome,
      timeToResolutionMs: nextApplication.timeToResolutionMs,
      retryCount: nextApplication.retryCount,
      verificationPassed: verificationPassed(parseObject(nextApplication.verificationSummaryJson)) ?? undefined,
      baseline: nextApplication.baselineSnapshotJson ? (parseObject(nextApplication.baselineSnapshotJson) as BaselineSnapshot) : null,
    });
    const workflowReward =
      baseReward != null && observedWorkflow === nextApplication.workflowStrategyKey
        ? baseReward
        : null;
    await client.execute({
      sql: `UPDATE cognitive_applications SET workflow_observed_key = ?, workflow_reward = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      args: [observedWorkflow, workflowReward, new Date().toISOString(), params.applicationId, params.userId],
    });
    nextApplication.workflowObservedKey = observedWorkflow;
    nextApplication.workflowReward = workflowReward;
  }

  return nextApplication;
}

export async function publishSkill(params: {
  userId: string;
  skillId: string;
  allowGlobal: boolean;
  publishedTo?: string;
}): Promise<SynthesizedSkill | null> {
  await ensureInitialized();
  const client = getDb();
  const skillResult = await client.execute({
    sql: `
      SELECT *
      FROM synthesized_skills
      WHERE id = ?
        AND (
          user_id = ?
          OR (scope = 'global' AND ? = 1)
        )
      LIMIT 1
    `,
    args: [params.skillId, params.userId, params.allowGlobal ? 1 : 0],
  });
  if (!skillResult.rows[0]) {
    return null;
  }
  const skill = rowToSkill(skillResult.rows[0] as Record<string, unknown>);
  if (skill.status !== "active") {
    return null;
  }

  const now = new Date().toISOString();
  const publishedTo = params.publishedTo ?? "clawhub";
  const clawHubId = `clawhub_${skill.id}_${Date.now()}`;
  await client.execute({
    sql: `
      UPDATE synthesized_skills
      SET published = 1,
          published_to = ?,
          clawhub_id = ?,
          updated_at = ?
      WHERE id = ?
    `,
    args: [publishedTo, clawHubId, now, params.skillId],
  });

  const refreshed = await client.execute({
    sql: `SELECT * FROM synthesized_skills WHERE id = ? LIMIT 1`,
    args: [params.skillId],
  });
  return refreshed.rows[0] ? rowToSkill(refreshed.rows[0] as Record<string, unknown>) : null;
}

export async function setSkillPublicationDisabled(params: {
  userId: string;
  skillId: string;
}): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  await client.execute({
    sql: `
      UPDATE synthesized_skills
      SET published = 0,
          published_to = NULL,
          clawhub_id = NULL,
          updated_at = ?
      WHERE id = ? AND user_id = ?
    `,
    args: [now, params.skillId, params.userId],
  });
}

export async function setPatternStatus(params: {
  userId: string;
  patternId: string;
  status: string;
}): Promise<boolean> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  const result = await client.execute({
    sql: `
      UPDATE cognitive_patterns
      SET status = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND scope = 'local'
    `,
    args: [params.status, now, params.patternId, params.userId],
  });
  return (result.rowsAffected ?? 0) > 0;
}

export async function refreshSkillDraftById(params: {
  userId: string;
  skillId: string;
}): Promise<SynthesizedSkill | null> {
  await ensureInitialized();
  const client = getDb();
  const skillResult = await client.execute({
    sql: `
      SELECT *
      FROM synthesized_skills
      WHERE id = ? AND user_id = ? AND scope = 'local'
      LIMIT 1
    `,
    args: [params.skillId, params.userId],
  });
  if (!skillResult.rows[0]) {
    return null;
  }
  const skill = rowToSkill(skillResult.rows[0] as Record<string, unknown>);
  const patternResult = await client.execute({
    sql: `SELECT * FROM cognitive_patterns WHERE id = ? LIMIT 1`,
    args: [skill.patternId],
  });
  if (!patternResult.rows[0]) {
    return null;
  }
  const pattern = rowToPattern(patternResult.rows[0] as Record<string, unknown>);
  const trigger = parseObject(pattern.triggerJson);
  const draft = buildSkillDraft({
    patternId: pattern.id,
    domain: pattern.domain,
    trigger: {
      keywords: parseStringArray(trigger.keywords),
      technologies: parseStringArray(trigger.technologies),
      errorPatterns: parseStringArray(trigger.errorPatterns),
    },
    approach: pattern.approach,
    steps: parseStringArray(pattern.stepsJson),
    pitfalls: parseStringArray(pattern.pitfallsJson),
    confidence: pattern.confidence,
  });
  const now = new Date().toISOString();
  await client.execute({
    sql: `
      UPDATE synthesized_skills
      SET name = ?, description = ?, markdown = ?, updated_at = ?
      WHERE id = ?
    `,
    args: [draft.name, draft.description, draft.markdown, now, params.skillId],
  });
  const refreshed = await client.execute({
    sql: `SELECT * FROM synthesized_skills WHERE id = ? LIMIT 1`,
    args: [params.skillId],
  });
  return refreshed.rows[0] ? rowToSkill(refreshed.rows[0] as Record<string, unknown>) : skill;
}

export async function getSkills(userId: string): Promise<SynthesizedSkill[]> {
  await ensureInitialized();
  await refreshSkillStatuses(userId);
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT * FROM synthesized_skills
      WHERE user_id = ? OR scope = 'global'
      ORDER BY success_rate DESC, updated_at DESC
    `,
    args: [userId],
  });
  return result.rows.map((row) => rowToSkill(row as Record<string, unknown>));
}

export async function getSkillById(userId: string, skillId: string): Promise<SynthesizedSkill | null> {
  await ensureInitialized();
  await refreshSkillStatuses(userId);
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT * FROM synthesized_skills
      WHERE id = ? AND (user_id = ? OR scope = 'global')
      LIMIT 1
    `,
    args: [skillId, userId],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? rowToSkill(row) : null;
}

export async function promoteEligiblePatternsToOrg(userId: string): Promise<{
  orgId: string | null;
  promotedPatterns: number;
  touchedPatternIds: string[];
}> {
  await ensureInitialized();
  const membership = await getCognitiveOrgMembership(userId);
  if (!membership?.orgId) {
    return {
      orgId: null,
      promotedPatterns: 0,
      touchedPatternIds: [],
    };
  }
  const policy = await getCognitiveOrgPolicy(membership.orgId);
  if (!policy.orgPatternSharingEnabled) {
    return {
      orgId: membership.orgId,
      promotedPatterns: 0,
      touchedPatternIds: [],
    };
  }

  const client = getDb();
  const localResult = await client.execute({
    sql: `
      SELECT *
      FROM cognitive_patterns
      WHERE user_id = ?
        AND scope = 'local'
        AND status IN ('active_local', 'synthesized_local')
        AND confidence >= 0.8
        AND successful_application_count >= 3
        AND verification_pass_rate >= 0.7
        AND impact_score >= 0.1
      ORDER BY impact_score DESC, confidence DESC, updated_at DESC
    `,
    args: [userId],
  });

  const now = new Date().toISOString();
  const touchedPatternIds = new Set<string>();
  let promotedPatterns = 0;

  for (const row of localResult.rows) {
    const localPattern = rowToPattern(row as Record<string, unknown>);
    const sourceTrigger = parseObject(localPattern.triggerJson);
    const redactedContent = redactSharedPatternContent({
      trigger: {
        keywords: parseStringArray(sourceTrigger.keywords),
        technologies: parseStringArray(sourceTrigger.technologies),
        errorPatterns: parseStringArray(sourceTrigger.errorPatterns),
        problemTypes: parseStringArray(sourceTrigger.problemTypes),
      },
      approach: localPattern.approach,
      steps: parseStringArray(localPattern.stepsJson),
      pitfalls: parseStringArray(localPattern.pitfallsJson),
    });
    const provenance = {
      kind: "org_promoted_pattern",
      sourceScope: "local",
      sourcePatternId: localPattern.id,
      orgId: membership.orgId,
      redacted: true,
      sourceTraceCount: localPattern.sourceTraceCount,
      validation: {
        confidence: localPattern.confidence,
        successCount: localPattern.successCount,
        failCount: localPattern.failCount,
        applicationCount: localPattern.applicationCount,
        acceptedApplicationCount: localPattern.acceptedApplicationCount,
        successfulApplicationCount: localPattern.successfulApplicationCount,
        verificationPassRate: localPattern.verificationPassRate,
        impactScore: localPattern.impactScore,
      },
      promotedAt: now,
    };
    const existingResult = await client.execute({
      sql: `
        SELECT *
        FROM cognitive_patterns
        WHERE scope = 'org' AND org_id = ? AND source_pattern_id = ?
        LIMIT 1
      `,
      args: [membership.orgId, localPattern.id],
    });
    const existingRow = existingResult.rows[0] as Record<string, unknown> | undefined;
    if (existingRow) {
      const existingPattern = rowToPattern(existingRow);
      if (
        existingPattern.status === "deprecated" &&
        typeof existingPattern.promotionReason === "string" &&
        existingPattern.promotionReason.startsWith("org_rollback")
      ) {
        continue;
      }

      await client.execute({
        sql: `
          UPDATE cognitive_patterns
          SET user_id = NULL,
              scope = 'org',
              org_id = ?,
              source_pattern_id = ?,
              provenance_json = ?,
              shared_signature = NULL,
              domain = ?,
              trigger_json = ?,
              approach = ?,
              steps_json = ?,
              pitfalls_json = ?,
              confidence = ?,
              success_count = ?,
              fail_count = ?,
              source_trace_count = ?,
              source_trace_ids_json = '[]',
              status = ?,
              promotion_reason = ?,
              updated_at = ?
          WHERE id = ?
        `,
        args: [
          membership.orgId,
          localPattern.id,
          JSON.stringify(provenance),
          localPattern.domain,
          JSON.stringify(redactedContent.trigger),
          redactedContent.approach,
          JSON.stringify(redactedContent.steps),
          JSON.stringify(redactedContent.pitfalls),
          localPattern.confidence,
          localPattern.successCount,
          localPattern.failCount,
          localPattern.sourceTraceCount,
          promotedOrgPatternStatus(localPattern.status),
          "validated_local_pattern_promoted_to_org",
          now,
          existingPattern.id,
        ],
      });
      touchedPatternIds.add(existingPattern.id);
      promotedPatterns += 1;
      continue;
    }

    const promoted = await createPattern({
      userId: null,
      scope: "org",
      orgId: membership.orgId,
      sourcePatternId: localPattern.id,
      provenance,
      patternKey: `org:${membership.orgId}:${localPattern.id}`,
      sharedSignature: null,
      domain: localPattern.domain,
      trigger: redactedContent.trigger,
      approach: redactedContent.approach,
      steps: redactedContent.steps,
      pitfalls: redactedContent.pitfalls,
      confidence: localPattern.confidence,
      successCount: localPattern.successCount,
      failCount: localPattern.failCount,
      sourceTraceIds: [],
      sourceTraceCount: localPattern.sourceTraceCount,
      status: promotedOrgPatternStatus(localPattern.status),
    });
    await client.execute({
      sql: `
        UPDATE cognitive_patterns
        SET promotion_reason = ?, updated_at = ?
        WHERE id = ?
      `,
      args: ["validated_local_pattern_promoted_to_org", now, promoted.id],
    });
    touchedPatternIds.add(promoted.id);
    promotedPatterns += 1;
  }

  return {
    orgId: membership.orgId,
    promotedPatterns,
    touchedPatternIds: [...touchedPatternIds],
  };
}

export async function getOrgPromotedPatterns(orgId?: string): Promise<Pattern[]> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT *
      FROM cognitive_patterns
      WHERE scope = 'org'
        ${orgId ? "AND org_id = ?" : ""}
      ORDER BY updated_at DESC, confidence DESC
    `,
    args: orgId ? [orgId] : [],
  });
  return result.rows.map((row) => rowToPattern(row as Record<string, unknown>));
}

export async function rollbackOrgPromotedPattern(params: {
  orgId: string;
  patternId: string;
  reason?: string | null;
}): Promise<Pattern | null> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  const result = await client.execute({
    sql: `
      UPDATE cognitive_patterns
      SET status = 'deprecated',
          promotion_reason = ?,
          updated_at = ?
      WHERE id = ? AND scope = 'org' AND org_id = ?
    `,
    args: [`org_rollback:${params.reason?.trim() || "manual_admin_rollback"}`, now, params.patternId, params.orgId],
  });
  if ((result.rowsAffected ?? 0) === 0) {
    return null;
  }
  const refreshed = await client.execute({
    sql: `SELECT * FROM cognitive_patterns WHERE id = ? LIMIT 1`,
    args: [params.patternId],
  });
  return refreshed.rows[0] ? rowToPattern(refreshed.rows[0] as Record<string, unknown>) : null;
}

export async function getRecentApplications(userId: string, limit = 25): Promise<Array<{
  application: CognitiveApplication;
  matches: ApplicationMatch[];
}>> {
  await ensureInitialized();
  const client = getDb();
  const boundedLimit = Math.max(1, Math.min(limit, 100));
  const applicationsResult = await client.execute({
    sql: `
      SELECT *
      FROM cognitive_applications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args: [userId, boundedLimit],
  });
  const applications = applicationsResult.rows.map((row) => rowToApplication(row as Record<string, unknown>));
  if (applications.length === 0) {
    return [];
  }

  const matchesResult = await client.execute({
    sql: `
      SELECT *
      FROM pattern_applications
      WHERE application_id IN (${applications.map(() => "?").join(",")})
      ORDER BY rank ASC, created_at DESC
    `,
    args: applications.map((application) => application.id),
  });
  const matches = matchesResult.rows.map((row) => rowToApplicationMatch(row as Record<string, unknown>));
  return applications.map((application) => ({
    application,
    matches: matches.filter((match) => match.applicationId === application.id),
  }));
}

async function getTracesByIds(traceIds: string[]): Promise<Map<string, CodingTrace>> {
  const uniqueTraceIds = Array.from(new Set(traceIds.filter(Boolean)));
  if (uniqueTraceIds.length === 0) {
    return new Map();
  }

  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT *
      FROM coding_traces
      WHERE id IN (${uniqueTraceIds.map(() => "?").join(",")})
    `,
    args: uniqueTraceIds,
  });
  return new Map(
    result.rows.map((row) => {
      const trace = rowToTrace(row as Record<string, unknown>);
      return [trace.id, trace] as const;
    }),
  );
}

export async function generateRetrievalEvalDataset(params: {
  userId: string;
  limit?: number;
  acceptedOnly?: boolean;
}): Promise<RetrievalEvalDataset> {
  const applicationBundles = await getRecentApplications(params.userId, params.limit ?? 100);
  const tracesById = await getTracesByIds(
    applicationBundles.flatMap(({ application, matches }) => [
      ...(application.traceId ? [application.traceId] : []),
      ...matches.filter((match) => match.entityType === "trace").map((match) => match.entityId),
    ]),
  );

  const records: RetrievalEvalDatasetRecord[] = [];
  for (const bundle of applicationBundles) {
    const { application } = bundle;
    const traceMatches = bundle.matches
      .filter((match) => match.entityType === "trace")
      .sort((left, right) => left.rank - right.rank || left.createdAt.localeCompare(right.createdAt));
    const patternMatches = bundle.matches
      .filter((match) => match.entityType === "pattern")
      .sort((left, right) => left.rank - right.rank || left.createdAt.localeCompare(right.createdAt));
    const skillMatches = bundle.matches
      .filter((match) => match.entityType === "skill")
      .sort((left, right) => left.rank - right.rank || left.createdAt.localeCompare(right.createdAt));

    const explicitAcceptedId = application.acceptedTraceId ?? application.acceptedPatternId ?? application.acceptedSkillId ?? undefined;
    const hasWeakSignal =
      application.finalOutcome === "success" &&
      (traceMatches.length > 0 || patternMatches.length > 0 || skillMatches.length > 0);
    if (params.acceptedOnly && !explicitAcceptedId) {
      continue;
    }
    if (!explicitAcceptedId && !hasWeakSignal) {
      continue;
    }

    const applicationTrace = application.traceId ? tracesById.get(application.traceId) : undefined;
    const applicationContext = applicationTrace ? parseObject(applicationTrace.contextJson) : {};
    const technologies = parseStringArray(applicationContext.technologies);
    const labelSource: RetrievalEvalDatasetRecord["labelSource"] = explicitAcceptedId ? "explicit" : "weak";
    const verificationSummary = parseObject(application.verificationSummaryJson);
    const targetResolutionKind =
      typeof verificationSummary.resolutionKind === "string" ? verificationSummary.resolutionKind : undefined;
    const baselineSnapshot = application.baselineSnapshotJson
      ? (parseObject(application.baselineSnapshotJson) as BaselineSnapshot)
      : undefined;

    const fixture: RetrievalEvalDatasetRecord["fixture"] = {
      applicationId: application.id,
      sessionId: application.sessionId,
      endpoint: application.endpoint,
      problem: application.problem,
      technologies,
      repoProfile: parseObject(application.repoProfileJson),
      expectedTraceIds: application.acceptedTraceId
        ? [application.acceptedTraceId]
        : labelSource === "weak" && traceMatches.length === 1
          ? [traceMatches[0].entityId]
          : [],
      expectedPatternIds: application.acceptedPatternId
        ? [application.acceptedPatternId]
        : labelSource === "weak"
          ? patternMatches.map((match) => match.entityId)
          : [],
      expectedSkillIds: application.acceptedSkillId
        ? [application.acceptedSkillId]
        : labelSource === "weak"
          ? skillMatches.map((match) => match.entityId)
          : [],
      acceptedId: explicitAcceptedId,
      expectedOutcome:
        application.finalOutcome === "success" ||
        application.finalOutcome === "partial" ||
        application.finalOutcome === "failed" ||
        application.finalOutcome === "abandoned"
          ? application.finalOutcome
          : undefined,
      maxRetries: baselineSnapshot?.medianRetries != null ? Math.max(1, Math.round(baselineSnapshot.medianRetries)) : undefined,
      targetResolutionKind:
        targetResolutionKind === "tests_passed" ||
        targetResolutionKind === "build_passed" ||
        targetResolutionKind === "lint_passed" ||
        targetResolutionKind === "manual_only" ||
        targetResolutionKind === "failed"
          ? targetResolutionKind
          : undefined,
      baseline: baselineSnapshot,
    };

    const prediction: RetrievalEvalDatasetRecord["prediction"] = {
      applicationId: application.id,
      sessionId: application.sessionId,
      policyKey: application.policyKey ?? undefined,
      policyContextKey: application.policyContextKey ?? undefined,
      workflowStrategyKey: application.workflowStrategyKey ?? undefined,
      workflowContextKey: application.workflowContextKey ?? undefined,
      traces: traceMatches.map((match) => ({ id: match.entityId })),
      patterns: patternMatches.map((match) => ({ id: match.entityId })),
      skills: skillMatches.map((match) => ({ id: match.entityId })),
      finalOutcome:
        application.finalOutcome === "success" ||
        application.finalOutcome === "partial" ||
        application.finalOutcome === "failed" ||
        application.finalOutcome === "abandoned"
          ? application.finalOutcome
          : undefined,
      acceptedTraceId: application.acceptedTraceId ?? undefined,
      acceptedPatternId: application.acceptedPatternId ?? undefined,
      acceptedSkillId: application.acceptedSkillId ?? undefined,
      retryCount: application.retryCount ?? undefined,
      timeToResolutionMs: application.timeToResolutionMs ?? undefined,
      verificationResults:
        application.verificationSummaryJson
          ? {
              verified: verificationPassed(verificationSummary) === true,
              resolutionKind:
                targetResolutionKind === "tests_passed" ||
                targetResolutionKind === "build_passed" ||
                targetResolutionKind === "lint_passed" ||
                targetResolutionKind === "manual_only" ||
                targetResolutionKind === "failed"
                  ? targetResolutionKind
                  : undefined,
              passedChecks: parseStringArray(verificationSummary.passedChecks).concat(parseStringArray(verificationSummary.testsPassed)),
              failedChecks: parseStringArray(verificationSummary.failedChecks).concat(parseStringArray(verificationSummary.testsFailed)),
            }
          : undefined,
    };

    records.push({
      applicationId: application.id,
      sessionId: application.sessionId,
      endpoint: application.endpoint,
      labelSource,
      fixture,
      prediction,
    });
  }

  return {
    fixtures: records.map((record) => record.fixture),
    predictions: records.map((record) => record.prediction),
    records,
  };
}

export async function recordBenchmarkRun(params: {
  userId: string;
  dataset: string;
  fixtureCount: number;
  result: Record<string, unknown>;
  gate?: Record<string, unknown> | null;
}): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  await client.execute({
    sql: `
      INSERT INTO cognitive_benchmark_runs (id, user_id, dataset, fixture_count, result_json, gate_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      crypto.randomUUID(),
      params.userId,
      params.dataset,
      params.fixtureCount,
      JSON.stringify(params.result),
      params.gate ? JSON.stringify(params.gate) : null,
      now,
    ],
  });
}

export async function getRecentBenchmarkRuns(userId: string, limit = 10): Promise<Array<{
  id: string;
  dataset: string;
  fixtureCount: number;
  result: Record<string, unknown>;
  gate: Record<string, unknown> | null;
  createdAt: string;
}>> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, dataset, fixture_count, result_json, gate_json, created_at
      FROM cognitive_benchmark_runs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args: [userId, Math.max(1, Math.min(limit, 50))],
  });
  return result.rows.map((row) => ({
    id: row.id as string,
    dataset: row.dataset as string,
    fixtureCount: Number(row.fixture_count ?? 0),
    result: parseObject(row.result_json),
    gate: row.gate_json ? parseObject(row.gate_json) : null,
    createdAt: row.created_at as string,
  }));
}

export async function getFailedBenchmarkRunsSince(since: string, limit = 20): Promise<Array<{
  id: string;
  userId: string;
  dataset: string;
  fixtureCount: number;
  gate: Record<string, unknown> | null;
  createdAt: string;
}>> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, user_id, dataset, fixture_count, gate_json, created_at
      FROM cognitive_benchmark_runs
      WHERE created_at >= ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args: [since, Math.max(1, Math.min(limit, 100))],
  });
  return result.rows
    .map((row) => ({
      id: row.id as string,
      userId: row.user_id as string,
      dataset: row.dataset as string,
      fixtureCount: Number(row.fixture_count ?? 0),
      gate: row.gate_json ? parseObject(row.gate_json) : null,
      createdAt: row.created_at as string,
    }))
    .filter((run) => run.gate?.passed === false);
}

export async function getCognitiveJobHealth(): Promise<Array<{
  jobName: string;
  leaseExpiresAt: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  checkpointJson: string | null;
}>> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT job_name, lease_expires_at, last_run_at, last_success_at, checkpoint_json
      FROM cognitive_jobs
      ORDER BY updated_at DESC
    `,
    args: [],
  });
  return result.rows.map((row) => ({
    jobName: row.job_name as string,
    leaseExpiresAt: (row.lease_expires_at as string | null) ?? null,
    lastRunAt: (row.last_run_at as string | null) ?? null,
    lastSuccessAt: (row.last_success_at as string | null) ?? null,
    checkpointJson: (row.checkpoint_json as string | null) ?? null,
  }));
}

export async function getCognitiveMetrics(userId: string, days = 7): Promise<{
  tracesCaptured: number;
  patternsCreated: number;
  patternsDeprecated: number;
  skillsCreated: number;
  staleSkills: number;
  sharedTraceOptInRate: number;
}> {
  await ensureInitialized();
  const client = getDb();
  const membership = await getCognitiveOrgMembership(userId);
  const policy = membership?.orgId ? await getCognitiveOrgPolicy(membership.orgId) : null;
  const orgId = policy?.orgPatternSharingEnabled ? membership?.orgId ?? null : null;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const [traces, shared, patterns, skills] = await Promise.all([
    client.execute({
      sql: `SELECT COUNT(*) as count FROM coding_traces WHERE user_id = ? AND created_at >= ?`,
      args: [userId, cutoff],
    }),
    client.execute({
      sql: `SELECT COUNT(*) as count FROM coding_traces WHERE user_id = ? AND created_at >= ? AND share_eligible = 1`,
      args: [userId, cutoff],
    }),
    client.execute({
      sql: `
        SELECT
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as created_count,
          SUM(CASE WHEN updated_at >= ? AND status = 'deprecated' THEN 1 ELSE 0 END) as deprecated_count
        FROM cognitive_patterns
        WHERE user_id = ?
           OR scope = 'global'
           OR (scope = 'org' AND org_id = ?)
      `,
      args: [cutoff, cutoff, userId, orgId],
    }),
    client.execute({
      sql: `
        SELECT
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as created_count,
          SUM(CASE WHEN status = 'stale' THEN 1 ELSE 0 END) as stale_count
        FROM synthesized_skills
        WHERE user_id = ? OR scope = 'global'
      `,
      args: [cutoff, userId],
    }),
  ]);
  const traceCount = Number(traces.rows[0]?.count ?? 0);
  const sharedCount = Number(shared.rows[0]?.count ?? 0);

  return {
    tracesCaptured: traceCount,
    patternsCreated: Number(patterns.rows[0]?.created_count ?? 0),
    patternsDeprecated: Number(patterns.rows[0]?.deprecated_count ?? 0),
    skillsCreated: Number(skills.rows[0]?.created_count ?? 0),
    staleSkills: Number(skills.rows[0]?.stale_count ?? 0),
    sharedTraceOptInRate: traceCount === 0 ? 0 : sharedCount / traceCount,
  };
}

export async function tryAcquireJobLease(params: {
  jobName: string;
  intervalMs: number;
  leaseMs: number;
}): Promise<CognitiveJobLease | null> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + params.leaseMs).toISOString();
  const lastEligibleSuccessAt = new Date(now.getTime() - params.intervalMs).toISOString();
  const acquireResult = await client.execute({
    sql: `
      INSERT INTO cognitive_jobs (job_name, lease_token, lease_expires_at, last_run_at, last_success_at, checkpoint_json, updated_at)
      VALUES (?, ?, ?, ?, NULL, NULL, ?)
      ON CONFLICT(job_name) DO UPDATE SET
        lease_token = excluded.lease_token,
        lease_expires_at = excluded.lease_expires_at,
        last_run_at = excluded.last_run_at,
        updated_at = excluded.updated_at
      WHERE (cognitive_jobs.lease_expires_at IS NULL OR cognitive_jobs.lease_expires_at <= excluded.last_run_at)
        AND (cognitive_jobs.last_success_at IS NULL OR cognitive_jobs.last_success_at <= ?)
    `,
    args: [params.jobName, leaseToken, leaseExpiresAt, nowIso, nowIso, lastEligibleSuccessAt],
  });

  if ((acquireResult.rowsAffected ?? 0) === 0) {
    return null;
  }

  const result = await client.execute({
    sql: `SELECT * FROM cognitive_jobs WHERE job_name = ? LIMIT 1`,
    args: [params.jobName],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;

  return {
    jobName: params.jobName,
    leaseToken,
    leaseExpiresAt,
    lastRunAt: row?.last_run_at as string | null ?? null,
    lastSuccessAt: row?.last_success_at as string | null ?? null,
    checkpointJson: row?.checkpoint_json as string | null ?? null,
  };
}

export async function releaseJobLease(params: {
  jobName: string;
  leaseToken: string;
  success: boolean;
  checkpoint?: Record<string, unknown> | null;
}): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  await client.execute({
    sql: `
      UPDATE cognitive_jobs
      SET lease_token = NULL,
          lease_expires_at = NULL,
          last_run_at = ?,
          last_success_at = CASE WHEN ? = 1 THEN ? ELSE last_success_at END,
          checkpoint_json = COALESCE(?, checkpoint_json),
          updated_at = ?
      WHERE job_name = ? AND lease_token = ?
    `,
    args: [
      now,
      params.success ? 1 : 0,
      now,
      params.checkpoint ? JSON.stringify(params.checkpoint) : null,
      now,
      params.jobName,
      params.leaseToken,
    ],
  });
}
