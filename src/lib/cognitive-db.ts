/**
 * Cognitive Engine Database Functions
 * 
 * Handles storage and retrieval of coding traces and patterns.
 */

import { getDb } from "@/lib/turso";
import { embedText } from "@/lib/embeddings";

// ============================================================================
// TYPES
// ============================================================================

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
  errorMessage: string | null;
  toolsUsedJson: string;
  filesModifiedJson: string;
  durationMs: number;
  sanitized: boolean;
  sanitizedAt: string | null;
  createdAt: string;
}

export interface Pattern {
  id: string;
  userId: string | null;
  domain: string;
  triggerJson: string;
  approach: string;
  stepsJson: string | null;
  pitfallsJson: string | null;
  confidence: number;
  successCount: number;
  failCount: number;
  lastApplied: string | null;
  sourceTraceIdsJson: string;
  status: string;
  synthesizedIntoSkill: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let initialized = false;

async function ensureInitialized() {
  if (initialized) return;
  
  const client = getDb();
  
  // Create coding_traces table
  await client.execute(`
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
      outcome TEXT NOT NULL,
      error_message TEXT,
      tools_used_json TEXT NOT NULL,
      files_modified_json TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      sanitized INTEGER NOT NULL DEFAULT 0,
      sanitized_at TEXT,
      created_at TEXT NOT NULL,
      embedding F32_BLOB(1536)
    )
  `);
  
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_traces_user ON coding_traces(user_id)
  `);
  
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_traces_user_type ON coding_traces(user_id, type)
  `);
  
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON coding_traces(timestamp DESC)
  `);
  
  // Create patterns table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS cognitive_patterns (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      domain TEXT NOT NULL,
      trigger_json TEXT NOT NULL,
      approach TEXT NOT NULL,
      steps_json TEXT,
      pitfalls_json TEXT,
      confidence REAL NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      fail_count INTEGER NOT NULL DEFAULT 0,
      last_applied TEXT,
      source_trace_ids_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'candidate',
      synthesized_into_skill TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_patterns_user ON cognitive_patterns(user_id)
  `);
  
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_patterns_domain ON cognitive_patterns(domain)
  `);
  
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_patterns_status ON cognitive_patterns(status)
  `);
  
  initialized = true;
}

// ============================================================================
// TRACE OPERATIONS
// ============================================================================

export interface CreateTraceInput {
  userId: string;
  sessionId: string;
  type: string;
  problem: string;
  context: Record<string, unknown>;
  reasoning: string;
  approaches: Array<Record<string, unknown>>;
  solution?: string;
  outcome: string;
  errorMessage?: string;
  toolsUsed: string[];
  filesModified: string[];
  durationMs: number;
  sanitized: boolean;
  sanitizedAt?: string;
}

export async function createTrace(input: CreateTraceInput): Promise<CodingTrace> {
  await ensureInitialized();
  const client = getDb();
  
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  
  // Generate embedding for problem + reasoning
  const textToEmbed = `${input.problem}\n${input.reasoning}`.slice(0, 8000);
  let embedding: number[] | null = null;
  try {
    embedding = await embedText(textToEmbed);
  } catch {
    // Embedding is optional
  }
  
  await client.execute({
    sql: `
      INSERT INTO coding_traces (
        id, user_id, session_id, timestamp, type, problem, context_json,
        reasoning, approaches_json, solution, outcome, error_message,
        tools_used_json, files_modified_json, duration_ms, sanitized,
        sanitized_at, created_at, embedding
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, vector(?))
    `,
    args: [
      id,
      input.userId,
      input.sessionId,
      now,
      input.type,
      input.problem,
      JSON.stringify(input.context),
      input.reasoning,
      JSON.stringify(input.approaches),
      input.solution || null,
      input.outcome,
      input.errorMessage || null,
      JSON.stringify(input.toolsUsed),
      JSON.stringify(input.filesModified),
      input.durationMs,
      input.sanitized ? 1 : 0,
      input.sanitizedAt || null,
      now,
      embedding ? JSON.stringify(embedding) : null,
    ],
  });
  
  return {
    id,
    userId: input.userId,
    sessionId: input.sessionId,
    timestamp: now,
    type: input.type,
    problem: input.problem,
    contextJson: JSON.stringify(input.context),
    reasoning: input.reasoning,
    approachesJson: JSON.stringify(input.approaches),
    solution: input.solution || null,
    outcome: input.outcome,
    errorMessage: input.errorMessage || null,
    toolsUsedJson: JSON.stringify(input.toolsUsed),
    filesModifiedJson: JSON.stringify(input.filesModified),
    durationMs: input.durationMs,
    sanitized: input.sanitized,
    sanitizedAt: input.sanitizedAt || null,
    createdAt: now,
  };
}

export async function getTraceById(traceId: string): Promise<CodingTrace | null> {
  await ensureInitialized();
  const client = getDb();
  
  const result = await client.execute({
    sql: `SELECT * FROM coding_traces WHERE id = ?`,
    args: [traceId],
  });
  
  if (result.rows.length === 0) return null;
  return rowToTrace(result.rows[0]);
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
    args: [userId, limit],
  });
  
  return result.rows.map(rowToTrace);
}

export async function getRelevantTraces(
  userId: string,
  problem: string,
  limit = 5
): Promise<CodingTrace[]> {
  await ensureInitialized();
  const client = getDb();
  
  // Generate embedding for query
  let embedding: number[] | null = null;
  try {
    embedding = await embedText(problem);
  } catch {
    // Fall back to keyword search
  }
  
  if (embedding) {
    // Vector similarity search
    const result = await client.execute({
      sql: `
        SELECT *, vector_distance_cos(embedding, vector(?)) as distance
        FROM coding_traces
        WHERE user_id = ? AND embedding IS NOT NULL
        ORDER BY distance ASC
        LIMIT ?
      `,
      args: [JSON.stringify(embedding), userId, limit],
    });
    
    return result.rows.map(rowToTrace);
  }
  
  // Fallback: keyword search
  const keywords = problem.toLowerCase().split(/\W+/).filter(w => w.length > 3).slice(0, 5);
  const likeConditions = keywords.map(() => `problem LIKE ?`).join(' OR ');
  const likeArgs = keywords.map(k => `%${k}%`);
  
  const result = await client.execute({
    sql: `
      SELECT * FROM coding_traces
      WHERE user_id = ? AND (${likeConditions || '1=1'})
      ORDER BY timestamp DESC
      LIMIT ?
    `,
    args: [userId, ...likeArgs, limit],
  });
  
  return result.rows.map(rowToTrace);
}

function rowToTrace(row: Record<string, unknown>): CodingTrace {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    sessionId: row.session_id as string,
    timestamp: row.timestamp as string,
    type: row.type as string,
    problem: row.problem as string,
    contextJson: row.context_json as string,
    reasoning: row.reasoning as string,
    approachesJson: row.approaches_json as string,
    solution: row.solution as string | null,
    outcome: row.outcome as string,
    errorMessage: row.error_message as string | null,
    toolsUsedJson: row.tools_used_json as string,
    filesModifiedJson: row.files_modified_json as string,
    durationMs: row.duration_ms as number,
    sanitized: Boolean(row.sanitized),
    sanitizedAt: row.sanitized_at as string | null,
    createdAt: row.created_at as string,
  };
}

// ============================================================================
// PATTERN OPERATIONS
// ============================================================================

export interface CreatePatternInput {
  userId?: string;
  domain: string;
  trigger: Record<string, unknown>;
  approach: string;
  steps?: string[];
  pitfalls?: string[];
  confidence: number;
  successCount: number;
  failCount: number;
  sourceTraceIds: string[];
}

export async function createPattern(input: CreatePatternInput): Promise<Pattern> {
  await ensureInitialized();
  const client = getDb();
  
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  
  await client.execute({
    sql: `
      INSERT INTO cognitive_patterns (
        id, user_id, domain, trigger_json, approach, steps_json, pitfalls_json,
        confidence, success_count, fail_count, source_trace_ids_json,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidate', ?, ?)
    `,
    args: [
      id,
      input.userId || null,
      input.domain,
      JSON.stringify(input.trigger),
      input.approach,
      input.steps ? JSON.stringify(input.steps) : null,
      input.pitfalls ? JSON.stringify(input.pitfalls) : null,
      input.confidence,
      input.successCount,
      input.failCount,
      JSON.stringify(input.sourceTraceIds),
      now,
      now,
    ],
  });
  
  return {
    id,
    userId: input.userId || null,
    domain: input.domain,
    triggerJson: JSON.stringify(input.trigger),
    approach: input.approach,
    stepsJson: input.steps ? JSON.stringify(input.steps) : null,
    pitfallsJson: input.pitfalls ? JSON.stringify(input.pitfalls) : null,
    confidence: input.confidence,
    successCount: input.successCount,
    failCount: input.failCount,
    lastApplied: null,
    sourceTraceIdsJson: JSON.stringify(input.sourceTraceIds),
    status: 'candidate',
    synthesizedIntoSkill: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getPatterns(userId: string, domain?: string): Promise<Pattern[]> {
  await ensureInitialized();
  const client = getDb();
  
  if (domain) {
    const result = await client.execute({
      sql: `
        SELECT * FROM cognitive_patterns
        WHERE (user_id = ? OR user_id IS NULL) AND domain = ?
        ORDER BY confidence DESC, updated_at DESC
      `,
      args: [userId, domain],
    });
    return result.rows.map(rowToPattern);
  }
  
  const result = await client.execute({
    sql: `
      SELECT * FROM cognitive_patterns
      WHERE (user_id = ? OR user_id IS NULL)
      ORDER BY confidence DESC, updated_at DESC
    `,
    args: [userId],
  });
  return result.rows.map(rowToPattern);
}

export async function updatePatternFeedback(
  patternId: string,
  outcome: 'success' | 'failure'
): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  
  if (outcome === 'success') {
    await client.execute({
      sql: `
        UPDATE cognitive_patterns
        SET success_count = success_count + 1,
            confidence = CAST(success_count + 1 AS REAL) / CAST(success_count + fail_count + 1 AS REAL),
            last_applied = ?,
            updated_at = ?
        WHERE id = ?
      `,
      args: [now, now, patternId],
    });
  } else {
    await client.execute({
      sql: `
        UPDATE cognitive_patterns
        SET fail_count = fail_count + 1,
            confidence = CAST(success_count AS REAL) / CAST(success_count + fail_count + 1 AS REAL),
            last_applied = ?,
            updated_at = ?
        WHERE id = ?
      `,
      args: [now, now, patternId],
    });
  }
}

export async function getSkillCandidates(userId: string): Promise<Pattern[]> {
  await ensureInitialized();
  const client = getDb();
  
  const result = await client.execute({
    sql: `
      SELECT * FROM cognitive_patterns
      WHERE (user_id = ? OR user_id IS NULL)
        AND status = 'active'
        AND confidence >= 0.8
        AND (success_count + fail_count) >= 5
        AND synthesized_into_skill IS NULL
      ORDER BY confidence DESC
    `,
    args: [userId],
  });
  
  return result.rows.map(rowToPattern);
}

function rowToPattern(row: Record<string, unknown>): Pattern {
  return {
    id: row.id as string,
    userId: row.user_id as string | null,
    domain: row.domain as string,
    triggerJson: row.trigger_json as string,
    approach: row.approach as string,
    stepsJson: row.steps_json as string | null,
    pitfallsJson: row.pitfalls_json as string | null,
    confidence: row.confidence as number,
    successCount: row.success_count as number,
    failCount: row.fail_count as number,
    lastApplied: row.last_applied as string | null,
    sourceTraceIdsJson: row.source_trace_ids_json as string,
    status: row.status as string,
    synthesizedIntoSkill: row.synthesized_into_skill as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
