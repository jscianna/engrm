import crypto from "node:crypto";
import { getDb } from "@/lib/turso";
import { embedText } from "@/lib/embeddings";
import {
  buildSharedSignature,
  buildSkillDraft,
  classifyPatternStatus,
  clusterLearningTraces,
  extractPatternCandidate,
  extractProblemKeywords,
  isSkillSynthesisEligible,
  normalizeForFingerprint,
  resolveOutcome,
  scoreTraceEvidence,
  summarizePatternEvidence,
  type LearningTrace,
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

export interface Pattern {
  id: string;
  userId: string | null;
  scope: "local" | "global";
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
  status: string;
  published: boolean;
  publishedTo: string | null;
  clawHubId: string | null;
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
}

export interface CreatePatternInput {
  userId?: string | null;
  scope?: "local" | "global";
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

let initialized = false;

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

    CREATE INDEX IF NOT EXISTS idx_traces_user ON coding_traces(user_id);
    CREATE INDEX IF NOT EXISTS idx_traces_user_type ON coding_traces(user_id, type);
    CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON coding_traces(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_traces_shared_signature ON coding_traces(shared_signature);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_traces_user_hash ON coding_traces(user_id, trace_hash);

    CREATE TABLE IF NOT EXISTS cognitive_patterns (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      scope TEXT NOT NULL DEFAULT 'local',
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
      status TEXT NOT NULL DEFAULT 'candidate',
      synthesized_into_skill TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_patterns_user ON cognitive_patterns(user_id);
    CREATE INDEX IF NOT EXISTS idx_patterns_domain ON cognitive_patterns(domain);
    CREATE INDEX IF NOT EXISTS idx_patterns_status ON cognitive_patterns(status);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_patterns_key ON cognitive_patterns(pattern_key);

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

    CREATE INDEX IF NOT EXISTS idx_trace_pattern_matches_trace ON trace_pattern_matches(trace_id);
    CREATE INDEX IF NOT EXISTS idx_trace_pattern_matches_pattern ON trace_pattern_matches(pattern_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_trace_pattern_matches ON trace_pattern_matches(trace_id, pattern_id);

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
      status TEXT NOT NULL DEFAULT 'draft',
      published INTEGER NOT NULL DEFAULT 0,
      published_to TEXT,
      clawhub_id TEXT,
      source_pattern_ids_json TEXT NOT NULL DEFAULT '[]',
      source_trace_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_skills_user_scope ON synthesized_skills(user_id, scope);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_skills_pattern_key ON synthesized_skills(pattern_key);

    CREATE TABLE IF NOT EXISTS cognitive_jobs (
      job_name TEXT PRIMARY KEY,
      lease_token TEXT,
      lease_expires_at TEXT,
      last_run_at TEXT,
      last_success_at TEXT,
      checkpoint_json TEXT,
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

  await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN scope TEXT DEFAULT 'local'`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN pattern_key TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN shared_signature TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN source_trace_count INTEGER DEFAULT 0`).catch(() => {});
  await client.execute(`ALTER TABLE trace_pattern_matches ADD COLUMN explicit_outcome TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE trace_pattern_matches ADD COLUMN feedback_notes TEXT`).catch(() => {});
  await client.execute(`ALTER TABLE trace_pattern_matches ADD COLUMN updated_at TEXT`).catch(() => {});

  initialized = true;
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
    status: (row.status as string) ?? "candidate",
    synthesizedIntoSkill: (row.synthesized_into_skill as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
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
    status: (row.status as string) ?? "draft",
    published: Number(row.published ?? 0) === 1,
    publishedTo: (row.published_to as string | null) ?? null,
    clawHubId: (row.clawhub_id as string | null) ?? null,
    sourcePatternIdsJson: (row.source_pattern_ids_json as string) ?? "[]",
    sourceTraceIdsJson: (row.source_trace_ids_json as string) ?? "[]",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
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

export async function createTrace(input: CreateTraceInput): Promise<CodingTrace> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  const normalizedContext = input.context ?? {};
  const automatedSignals = input.automatedSignals ?? {};
  const shareEligible = input.shareEligible ?? true;
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
  const technologies = parseStringArray((normalizedContext as Record<string, unknown>).technologies);
  const errorMessages = parseStringArray((normalizedContext as Record<string, unknown>).errorMessages);
  const sharedSignature = shareEligible
    ? buildSharedSignature({
        type: input.type,
        problem: input.problem,
        technologies,
        errorMessages,
      })
    : null;

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
  return trace;
}

export async function createPattern(input: CreatePatternInput): Promise<Pattern> {
  await ensureInitialized();
  const client = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const scope = input.scope ?? (input.userId ? "local" : "global");
  const patternKey = input.patternKey ?? `${scope}:${input.userId ?? "global"}:${normalizeForFingerprint(input.domain)}:${crypto.randomUUID()}`;

  await client.execute({
    sql: `
      INSERT INTO cognitive_patterns (
        id, user_id, scope, pattern_key, shared_signature, domain, trigger_json,
        approach, steps_json, pitfalls_json, confidence, success_count, fail_count,
        source_trace_count, last_applied, source_trace_ids_json, status, synthesized_into_skill,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?)
    `,
    args: [
      id,
      input.userId ?? null,
      scope,
      patternKey,
      input.sharedSignature ?? null,
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
  const result = await client.execute({
    sql: `
      SELECT * FROM cognitive_patterns
      WHERE (user_id = ? OR scope = 'global' OR user_id IS NULL)
        ${domain ? "AND domain = ?" : ""}
      ORDER BY scope ASC, confidence DESC, updated_at DESC
    `,
    args: domain ? [userId, domain] : [userId],
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
    .filter((pattern) => pattern.status === "active" || pattern.status === "synthesized")
    .map((pattern) => ({
      ...pattern,
      score: scorePatternMatch({
        pattern,
        problem: params.problem,
        technologies: params.technologies ?? [],
      }),
    }))
    .filter((pattern) => pattern.score > 0)
    .sort((left, right) => right.score - left.score)
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
        AND (user_id = ? OR scope = 'global' OR user_id IS NULL)
      ORDER BY updated_at DESC
    `,
    args: [...patternKeys, params.userId],
  });
  return result.rows
    .map((row) => rowToSkill(row as Record<string, unknown>))
    .sort(
      (left, right) =>
        (scoreByPatternKey.get(right.patternKey) ?? 0) - (scoreByPatternKey.get(left.patternKey) ?? 0) ||
        right.successRate - left.successRate,
    )
    .slice(0, params.limit ?? 3);
}

export async function updatePatternFeedback(params: {
  userId: string;
  patternId: string;
  traceId: string;
  outcome: "success" | "failure";
  notes?: string | null;
}): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  const patternResult = await client.execute({
    sql: `
      SELECT id, scope, user_id
      FROM cognitive_patterns
      WHERE id = ?
        AND (user_id = ? OR scope = 'global' OR user_id IS NULL)
      LIMIT 1
    `,
    args: [params.patternId, params.userId],
  });
  if (!patternResult.rows[0]) {
    return;
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
    return;
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
    const patternRow = patternResult.rows[0] as Record<string, unknown>;
    const matchUserId = (patternRow.scope as string) === "global" || patternRow.user_id == null ? "__global__" : params.userId;
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
}

export async function getSkillCandidates(userId: string): Promise<Pattern[]> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT * FROM cognitive_patterns
      WHERE (user_id = ? OR scope = 'global' OR user_id IS NULL)
        AND status IN ('active', 'synthesized')
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
    sql: `SELECT pattern_id FROM trace_pattern_matches WHERE trace_id = ? AND user_id = ? AND match_source != 'pattern_extraction'`,
    args: [params.traceId, params.userId],
  });
  await client.execute({
    sql: `DELETE FROM trace_pattern_matches WHERE trace_id = ? AND user_id = ? AND match_source != 'pattern_extraction'`,
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

  const client = getDb();
  const now = new Date().toISOString();
  for (const patternId of uniquePatternIds) {
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
    const lastApplied = evidence.reduce<string | null>(
      (latest, item) => (!latest || item.updatedAt > latest ? item.updatedAt : latest),
      null,
    );
    const status =
      classifyPatternStatus({
        effectiveEvidence: summary.effectiveEvidence,
        confidence: summary.confidence,
      });

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
      args: [summary.successCount, summary.failCount, summary.confidence, status, lastApplied, now, patternId],
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
    .filter((pattern): pattern is NonNullable<typeof pattern> => Boolean(pattern));

  let localPatterns = 0;
  const touchedPatternIds: string[] = [];
  const localCandidateKeys = new Set<string>();
  for (const candidate of localCandidates) {
    localCandidateKeys.add(candidate.key);
    const pattern = await upsertPatternCandidate({
      ...candidate,
      status: classifyPatternStatus({
        effectiveEvidence: candidate.sourceTraceCount,
        confidence: candidate.confidence,
        activationEvidence: minTraces,
        activationConfidence: minSuccessRate,
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
      sql: `SELECT id, pattern_key FROM cognitive_patterns WHERE scope = 'global' OR user_id IS NULL`,
      args: [],
    });
    const existingGlobalByKey = new Map(
      existingGlobalResult.rows.map((row) => [row.pattern_key as string, row.id as string]),
    );
    const globalRows = await client.execute({
      sql: `
        SELECT * FROM coding_traces
        WHERE share_eligible = 1 AND sanitized = 1 AND shared_signature IS NOT NULL
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
      .filter((pattern): pattern is NonNullable<typeof pattern> => Boolean(pattern));

    const globalCandidateKeys = new Set<string>();
    for (const candidate of globalCandidates) {
      globalCandidateKeys.add(candidate.key);
      const pattern = await upsertPatternCandidate({
        ...candidate,
        status: classifyPatternStatus({
          effectiveEvidence: candidate.sourceTraceCount,
          confidence: candidate.confidence,
          activationEvidence: minTraces,
          activationConfidence: minSuccessRate,
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
            shared_signature = ?,
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
        candidate.scope === "global" ? candidate.key.replace(/^global:/, "") : null,
        candidate.domain,
        JSON.stringify(candidate.trigger),
        candidate.approach,
        JSON.stringify(candidate.steps),
        JSON.stringify(candidate.pitfalls),
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
    patternKey: candidate.key,
    sharedSignature: candidate.scope === "global" ? candidate.key.replace(/^global:/, "") : null,
    domain: candidate.domain,
    trigger: candidate.trigger,
    approach: candidate.approach,
    steps: candidate.steps,
    pitfalls: candidate.pitfalls,
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

    if (existing.rows[0]) {
      await client.execute({
        sql: `
          UPDATE synthesized_skills
          SET user_id = ?, scope = ?, pattern_id = ?, name = ?, description = ?, markdown = ?, content_json = ?, quality_score = ?,
              success_rate = ?, source_pattern_ids_json = ?, source_trace_ids_json = ?, status = 'draft', updated_at = ?
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
          JSON.stringify([pattern.id]),
          pattern.sourceTraceIdsJson,
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
            published_to, clawhub_id, source_pattern_ids_json, source_trace_ids_json,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'draft', 0, NULL, NULL, ?, ?, ?, ?)
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
          JSON.stringify([pattern.id]),
          pattern.sourceTraceIdsJson,
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
        SET synthesized_into_skill = ?, status = 'synthesized', updated_at = ?
        WHERE id = ?
      `,
      args: [skills[skills.length - 1].id, now, pattern.id],
    });
  }

  return skills;
}

export async function getSkills(userId: string): Promise<SynthesizedSkill[]> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT * FROM synthesized_skills
      WHERE user_id = ? OR scope = 'global' OR user_id IS NULL
      ORDER BY success_rate DESC, updated_at DESC
    `,
    args: [userId],
  });
  return result.rows.map((row) => rowToSkill(row as Record<string, unknown>));
}

export async function getSkillById(userId: string, skillId: string): Promise<SynthesizedSkill | null> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT * FROM synthesized_skills
      WHERE id = ? AND (user_id = ? OR scope = 'global' OR user_id IS NULL)
      LIMIT 1
    `,
    args: [skillId, userId],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? rowToSkill(row) : null;
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
