"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCognitiveUserSettings = getCognitiveUserSettings;
exports.updateCognitiveUserSettings = updateCognitiveUserSettings;
exports.revokeSharedLearningForUser = revokeSharedLearningForUser;
exports.exportCognitiveUserData = exportCognitiveUserData;
exports.deleteCognitiveUserData = deleteCognitiveUserData;
exports.cleanupExpiredCognitiveData = cleanupExpiredCognitiveData;
exports.logCognitiveApplication = logCognitiveApplication;
exports.createTrace = createTrace;
exports.getTraceById = getTraceById;
exports.getRecentTraces = getRecentTraces;
exports.getRelevantTraces = getRelevantTraces;
exports.updateTraceOutcome = updateTraceOutcome;
exports.createPattern = createPattern;
exports.getPatterns = getPatterns;
exports.getMatchingPatterns = getMatchingPatterns;
exports.getRelevantSkills = getRelevantSkills;
exports.updatePatternFeedback = updatePatternFeedback;
exports.getSkillCandidates = getSkillCandidates;
exports.getTracePatternMatches = getTracePatternMatches;
exports.syncTracePatternMatches = syncTracePatternMatches;
exports.recomputePatternStats = recomputePatternStats;
exports.runPatternExtraction = runPatternExtraction;
exports.synthesizeEligibleSkills = synthesizeEligibleSkills;
exports.recomputeSkillStats = recomputeSkillStats;
exports.updateApplicationOutcome = updateApplicationOutcome;
exports.publishSkill = publishSkill;
exports.setSkillPublicationDisabled = setSkillPublicationDisabled;
exports.setPatternStatus = setPatternStatus;
exports.refreshSkillDraftById = refreshSkillDraftById;
exports.getSkills = getSkills;
exports.getSkillById = getSkillById;
exports.getRecentApplications = getRecentApplications;
exports.generateRetrievalEvalDataset = generateRetrievalEvalDataset;
exports.recordBenchmarkRun = recordBenchmarkRun;
exports.getRecentBenchmarkRuns = getRecentBenchmarkRuns;
exports.getFailedBenchmarkRunsSince = getFailedBenchmarkRunsSince;
exports.getCognitiveJobHealth = getCognitiveJobHealth;
exports.getCognitiveMetrics = getCognitiveMetrics;
exports.tryAcquireJobLease = tryAcquireJobLease;
exports.releaseJobLease = releaseJobLease;
const node_crypto_1 = __importDefault(require("node:crypto"));
const turso_1 = require("@/lib/turso");
const embeddings_1 = require("@/lib/embeddings");
const cognitive_learning_1 = require("@/lib/cognitive-learning");
let initialized = false;
async function ensureInitialized() {
    if (initialized) {
        return;
    }
    const client = (0, turso_1.getDb)();
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

    CREATE INDEX IF NOT EXISTS idx_cognitive_applications_user ON cognitive_applications(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cognitive_applications_session ON cognitive_applications(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cognitive_applications_baseline ON cognitive_applications(user_id, baseline_group_key, created_at DESC);

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

    CREATE INDEX IF NOT EXISTS idx_pattern_applications_application ON pattern_applications(application_id, rank ASC);
    CREATE INDEX IF NOT EXISTS idx_pattern_applications_entity ON pattern_applications(entity_type, entity_id, updated_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pattern_applications ON pattern_applications(application_id, entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS cognitive_benchmark_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      dataset TEXT NOT NULL,
      fixture_count INTEGER NOT NULL DEFAULT 0,
      result_json TEXT NOT NULL,
      gate_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cognitive_benchmark_runs_user ON cognitive_benchmark_runs(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS cognitive_user_settings (
      user_id TEXT PRIMARY KEY,
      shared_learning_enabled INTEGER NOT NULL DEFAULT 0,
      benchmark_inclusion_enabled INTEGER NOT NULL DEFAULT 0,
      trace_retention_days INTEGER NOT NULL DEFAULT 30,
      updated_at TEXT NOT NULL
    );
  `);
    await client.execute(`ALTER TABLE coding_traces ADD COLUMN updated_at TEXT`).catch(() => { });
    await client.execute(`ALTER TABLE coding_traces ADD COLUMN embedding_json TEXT`).catch(() => { });
    await client.execute(`ALTER TABLE coding_traces ADD COLUMN trace_hash TEXT`).catch(() => { });
    await client.execute(`ALTER TABLE coding_traces ADD COLUMN outcome_source TEXT DEFAULT 'heuristic'`).catch(() => { });
    await client.execute(`ALTER TABLE coding_traces ADD COLUMN outcome_confidence REAL DEFAULT 0.55`).catch(() => { });
    await client.execute(`ALTER TABLE coding_traces ADD COLUMN automated_signals_json TEXT DEFAULT '{}'`).catch(() => { });
    await client.execute(`ALTER TABLE coding_traces ADD COLUMN share_eligible INTEGER DEFAULT 0`).catch(() => { });
    await client.execute(`ALTER TABLE coding_traces ADD COLUMN shared_signature TEXT`).catch(() => { });
    await client.execute(`ALTER TABLE coding_traces ADD COLUMN explicit_feedback_notes TEXT`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN scope TEXT DEFAULT 'local'`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN pattern_key TEXT`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN shared_signature TEXT`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN source_trace_count INTEGER DEFAULT 0`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN application_count INTEGER DEFAULT 0`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN accepted_application_count INTEGER DEFAULT 0`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN successful_application_count INTEGER DEFAULT 0`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN median_time_to_resolution_ms INTEGER`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN median_retries REAL`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN verification_pass_rate REAL DEFAULT 0`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN impact_score REAL DEFAULT 0`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_patterns ADD COLUMN promotion_reason TEXT`).catch(() => { });
    await client.execute(`ALTER TABLE trace_pattern_matches ADD COLUMN explicit_outcome TEXT`).catch(() => { });
    await client.execute(`ALTER TABLE trace_pattern_matches ADD COLUMN feedback_notes TEXT`).catch(() => { });
    await client.execute(`ALTER TABLE trace_pattern_matches ADD COLUMN updated_at TEXT`).catch(() => { });
    await client.execute(`ALTER TABLE synthesized_skills ADD COLUMN source_trace_count INTEGER DEFAULT 0`).catch(() => { });
    await client.execute(`ALTER TABLE synthesized_skills ADD COLUMN accepted_application_count INTEGER DEFAULT 0`).catch(() => { });
    await client.execute(`ALTER TABLE synthesized_skills ADD COLUMN successful_application_count INTEGER DEFAULT 0`).catch(() => { });
    await client.execute(`ALTER TABLE synthesized_skills ADD COLUMN median_time_to_resolution_ms INTEGER`).catch(() => { });
    await client.execute(`ALTER TABLE synthesized_skills ADD COLUMN median_retries REAL`).catch(() => { });
    await client.execute(`ALTER TABLE synthesized_skills ADD COLUMN verification_pass_rate REAL DEFAULT 0`).catch(() => { });
    await client.execute(`ALTER TABLE synthesized_skills ADD COLUMN impact_score REAL DEFAULT 0`).catch(() => { });
    await client.execute(`ALTER TABLE synthesized_skills ADD COLUMN promotion_reason TEXT`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN accepted_trace_id TEXT`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN repo_profile_json TEXT`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN materialized_pattern_id TEXT`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN materialized_skill_id TEXT`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN retry_count INTEGER`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN baseline_group_key TEXT`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_applications ADD COLUMN baseline_snapshot_json TEXT`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_user_settings ADD COLUMN shared_learning_enabled INTEGER DEFAULT 0`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_user_settings ADD COLUMN benchmark_inclusion_enabled INTEGER DEFAULT 0`).catch(() => { });
    await client.execute(`ALTER TABLE cognitive_user_settings ADD COLUMN trace_retention_days INTEGER DEFAULT 30`).catch(() => { });
    // Shared/global learning derives cluster keys in memory from sanitized content.
    // Persisted reusable signatures are cleared to reduce cross-session linkability.
    await client.execute(`UPDATE coding_traces SET shared_signature = NULL WHERE shared_signature IS NOT NULL`).catch(() => { });
    await client.execute(`UPDATE cognitive_patterns SET shared_signature = NULL WHERE scope = 'global' OR user_id IS NULL`).catch(() => { });
    initialized = true;
}
function rowToCognitiveUserSettings(row) {
    return {
        userId: row.user_id,
        sharedLearningEnabled: Number(row.shared_learning_enabled ?? 0) === 1,
        benchmarkInclusionEnabled: Number(row.benchmark_inclusion_enabled ?? 0) === 1,
        traceRetentionDays: Math.max(1, Math.min(365, Number(row.trace_retention_days ?? 30))),
        updatedAt: row.updated_at ?? new Date(0).toISOString(),
    };
}
function parseStringArray(raw) {
    if (Array.isArray(raw)) {
        return raw.filter((value) => typeof value === "string");
    }
    if (typeof raw !== "string" || !raw.trim()) {
        return [];
    }
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
    }
    catch {
        return [];
    }
}
function parseObject(raw) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        return raw;
    }
    if (typeof raw !== "string" || !raw.trim()) {
        return {};
    }
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
}
function parseNumberArray(raw) {
    if (typeof raw !== "string" || !raw.trim()) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "number") : null;
    }
    catch {
        return null;
    }
}
function medianValue(values) {
    if (values.length === 0) {
        return null;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}
function hashTrace(input) {
    const normalized = JSON.stringify({
        sessionId: (0, cognitive_learning_1.normalizeForFingerprint)(input.sessionId),
        type: (0, cognitive_learning_1.normalizeForFingerprint)(input.type),
        problem: (0, cognitive_learning_1.normalizeForFingerprint)(input.problem),
        reasoning: (0, cognitive_learning_1.normalizeForFingerprint)(input.reasoning).slice(0, 2000),
        solution: (0, cognitive_learning_1.normalizeForFingerprint)(input.solution ?? "").slice(0, 1200),
        toolsUsed: [...input.toolsUsed].sort(),
        filesModified: [...input.filesModified].sort(),
    });
    return node_crypto_1.default.createHash("sha256").update(normalized).digest("hex");
}
function rowToTrace(row) {
    return {
        id: row.id,
        userId: row.user_id,
        sessionId: row.session_id,
        timestamp: row.timestamp,
        type: row.type,
        problem: row.problem,
        contextJson: row.context_json ?? "{}",
        reasoning: row.reasoning ?? "",
        approachesJson: row.approaches_json ?? "[]",
        solution: row.solution ?? null,
        outcome: (row.outcome ?? "partial"),
        outcomeSource: (row.outcome_source ?? "heuristic"),
        outcomeConfidence: Number(row.outcome_confidence ?? 0.55),
        automatedSignalsJson: row.automated_signals_json ?? "{}",
        errorMessage: row.error_message ?? null,
        toolsUsedJson: row.tools_used_json ?? "[]",
        filesModifiedJson: row.files_modified_json ?? "[]",
        durationMs: Number(row.duration_ms ?? 0),
        sanitized: Number(row.sanitized ?? 0) === 1,
        sanitizedAt: row.sanitized_at ?? null,
        shareEligible: Number(row.share_eligible ?? 0) === 1,
        sharedSignature: row.shared_signature ?? null,
        traceHash: row.trace_hash ?? "",
        embeddingJson: row.embedding_json ?? null,
        explicitFeedbackNotes: row.explicit_feedback_notes ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at ?? row.created_at,
    };
}
function rowToPattern(row) {
    return {
        id: row.id,
        userId: row.user_id ?? null,
        scope: (row.scope ?? "local"),
        patternKey: row.pattern_key ?? "",
        sharedSignature: row.shared_signature ?? null,
        domain: row.domain,
        triggerJson: row.trigger_json,
        approach: row.approach,
        stepsJson: row.steps_json ?? null,
        pitfallsJson: row.pitfalls_json ?? null,
        confidence: Number(row.confidence ?? 0),
        successCount: Number(row.success_count ?? 0),
        failCount: Number(row.fail_count ?? 0),
        sourceTraceCount: Number(row.source_trace_count ?? 0),
        lastApplied: row.last_applied ?? null,
        sourceTraceIdsJson: row.source_trace_ids_json ?? "[]",
        applicationCount: Number(row.application_count ?? 0),
        acceptedApplicationCount: Number(row.accepted_application_count ?? 0),
        successfulApplicationCount: Number(row.successful_application_count ?? 0),
        medianTimeToResolutionMs: row.median_time_to_resolution_ms == null ? null : Number(row.median_time_to_resolution_ms),
        medianRetries: row.median_retries == null ? null : Number(row.median_retries),
        verificationPassRate: Number(row.verification_pass_rate ?? 0),
        impactScore: Number(row.impact_score ?? 0),
        promotionReason: row.promotion_reason ?? null,
        status: row.status ?? "candidate",
        synthesizedIntoSkill: row.synthesized_into_skill ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function rowToSkill(row) {
    return {
        id: row.id,
        userId: row.user_id ?? null,
        scope: (row.scope ?? "local"),
        patternId: row.pattern_id,
        patternKey: row.pattern_key,
        name: row.name,
        description: row.description,
        markdown: row.markdown,
        contentJson: row.content_json,
        qualityScore: Number(row.quality_score ?? 0),
        usageCount: Number(row.usage_count ?? 0),
        successRate: Number(row.success_rate ?? 0),
        acceptedApplicationCount: Number(row.accepted_application_count ?? 0),
        successfulApplicationCount: Number(row.successful_application_count ?? 0),
        medianTimeToResolutionMs: row.median_time_to_resolution_ms == null ? null : Number(row.median_time_to_resolution_ms),
        medianRetries: row.median_retries == null ? null : Number(row.median_retries),
        verificationPassRate: Number(row.verification_pass_rate ?? 0),
        impactScore: Number(row.impact_score ?? 0),
        promotionReason: row.promotion_reason ?? null,
        status: row.status ?? "draft",
        published: Number(row.published ?? 0) === 1,
        publishedTo: row.published_to ?? null,
        clawHubId: row.clawhub_id ?? null,
        sourceTraceCount: Number(row.source_trace_count ?? 0),
        sourcePatternIdsJson: row.source_pattern_ids_json ?? "[]",
        sourceTraceIdsJson: row.source_trace_ids_json ?? "[]",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function rowToApplication(row) {
    return {
        id: row.id,
        userId: row.user_id,
        sessionId: row.session_id,
        traceId: row.trace_id ?? null,
        problem: row.problem,
        endpoint: row.endpoint,
        repoProfileJson: row.repo_profile_json ?? null,
        materializedPatternId: row.materialized_pattern_id ?? null,
        materializedSkillId: row.materialized_skill_id ?? null,
        retryCount: row.retry_count == null ? null : Number(row.retry_count),
        baselineGroupKey: row.baseline_group_key ?? null,
        baselineSnapshotJson: row.baseline_snapshot_json ?? null,
        acceptedTraceId: row.accepted_trace_id ?? null,
        acceptedPatternId: row.accepted_pattern_id ?? null,
        acceptedSkillId: row.accepted_skill_id ?? null,
        finalOutcome: row.final_outcome ?? null,
        timeToResolutionMs: row.time_to_resolution_ms == null ? null : Number(row.time_to_resolution_ms),
        verificationSummaryJson: row.verification_summary_json ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
async function getCognitiveUserSettings(userId) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
    return rowToCognitiveUserSettings(result.rows[0] ?? {
        user_id: userId,
        shared_learning_enabled: 0,
        benchmark_inclusion_enabled: 0,
        trace_retention_days: 30,
        updated_at: now,
    });
}
async function updateCognitiveUserSettings(params) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
async function getApplicationsWithMatches(userId, limit) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    const limitClause = typeof limit === "number" ? "LIMIT ?" : "";
    const applicationArgs = [userId];
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
    const applications = applicationsResult.rows.map((row) => rowToApplication(row));
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
    const matches = matchesResult.rows.map((row) => rowToApplicationMatch(row));
    return applications.map((application) => ({
        application,
        matches: matches.filter((match) => match.applicationId === application.id),
    }));
}
async function getAllUserTraces(userId) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    const result = await client.execute({
        sql: `
      SELECT *
      FROM coding_traces
      WHERE user_id = ?
      ORDER BY created_at DESC
    `,
        args: [userId],
    });
    return result.rows.map((row) => rowToTrace(row));
}
async function getUserLocalPatterns(userId) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    const result = await client.execute({
        sql: `
      SELECT *
      FROM cognitive_patterns
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `,
        args: [userId],
    });
    return result.rows.map((row) => rowToPattern(row));
}
async function getUserLocalSkills(userId) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    const result = await client.execute({
        sql: `
      SELECT *
      FROM synthesized_skills
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `,
        args: [userId],
    });
    return result.rows.map((row) => rowToSkill(row));
}
async function getUserBenchmarkRuns(userId) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
        id: row.id,
        dataset: row.dataset,
        fixtureCount: Number(row.fixture_count ?? 0),
        result: parseObject(row.result_json),
        gate: row.gate_json ? parseObject(row.gate_json) : null,
        createdAt: row.created_at,
    }));
}
async function getSkillIdsForPatternIds(patternIds) {
    const uniquePatternIds = Array.from(new Set(patternIds.filter(Boolean)));
    if (uniquePatternIds.length === 0) {
        return [];
    }
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
        .filter((value) => typeof value === "string");
}
async function pruneOrphanedLocalArtifacts(userId) {
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
    const client = (0, turso_1.getDb)();
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
async function revokeSharedLearningForUser(userId) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
        .filter((value) => typeof value === "string");
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
        AND (p.scope = 'global' OR p.user_id IS NULL)
    `,
        args: traceIds,
    });
    const globalPatternIds = patternResult.rows
        .map((row) => row.pattern_id)
        .filter((value) => typeof value === "string");
    const deleteResult = await client.execute({
        sql: `
      DELETE FROM trace_pattern_matches
      WHERE trace_id IN (${traceIds.map(() => "?").join(",")})
        AND pattern_id IN (
          SELECT id FROM cognitive_patterns WHERE scope = 'global' OR user_id IS NULL
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
async function exportCognitiveUserData(userId) {
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
async function deleteCognitiveUserData(userId) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    const now = new Date().toISOString();
    const localPatternIds = (await client.execute({
        sql: `SELECT id FROM cognitive_patterns WHERE user_id = ?`,
        args: [userId],
    })).rows
        .map((row) => row.id)
        .filter((value) => typeof value === "string");
    const localSkillIds = (await client.execute({
        sql: `SELECT id FROM synthesized_skills WHERE user_id = ?`,
        args: [userId],
    })).rows
        .map((row) => row.id)
        .filter((value) => typeof value === "string");
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
async function cleanupExpiredCognitiveData(params) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
        .filter((value) => typeof value === "string" && value.length > 0);
    const touchedGlobalPatternIds = new Set();
    const touchedApplicationPatternIds = new Set();
    const touchedSkillIds = new Set();
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
            .filter((value) => typeof value === "string");
        if (expiredTraceIds.length > 0) {
            const globalPatternRows = await client.execute({
                sql: `
          SELECT DISTINCT m.pattern_id
          FROM trace_pattern_matches m
          JOIN cognitive_patterns p ON p.id = m.pattern_id
          WHERE m.trace_id IN (${expiredTraceIds.map(() => "?").join(",")})
            AND (p.scope = 'global' OR p.user_id IS NULL)
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
function rowToApplicationMatch(row) {
    return {
        id: row.id,
        applicationId: row.application_id,
        userId: row.user_id,
        sessionId: row.session_id,
        traceId: row.trace_id ?? null,
        entityType: row.entity_type ?? "pattern",
        entityId: row.entity_id,
        entityScope: (row.entity_scope ?? "local"),
        rank: Number(row.rank ?? 0),
        accepted: Number(row.accepted ?? 0) === 1,
        finalOutcome: row.final_outcome ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at ?? row.created_at,
    };
}
function scorePatternMatch(params) {
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
        }
        catch {
            // Ignore invalid patterns already stored.
        }
    }
    return score * Math.max(params.pattern.confidence, 0.1);
}
function asLearningTrace(trace) {
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
function outcomeSourcePriority(source) {
    if (source === "explicit") {
        return 3;
    }
    if (source === "tool") {
        return 2;
    }
    return 1;
}
function mergeStringArrays(left, right) {
    return [...new Set([...left.filter(Boolean), ...right.filter(Boolean)])];
}
function mergeTraceContext(existing, incoming) {
    return {
        ...existing,
        ...incoming,
        technologies: mergeStringArrays(parseStringArray(existing.technologies), parseStringArray(incoming.technologies)),
        errorMessages: mergeStringArrays(parseStringArray(existing.errorMessages), parseStringArray(incoming.errorMessages)),
    };
}
function hasTraceRefreshSignal(existing, incoming) {
    const existingSignals = parseObject(existing.automatedSignalsJson);
    const existingContext = parseObject(existing.contextJson);
    const sourceUpgraded = outcomeSourcePriority(incoming.outcomeSource) > outcomeSourcePriority(existing.outcomeSource);
    const confidenceUpgraded = incoming.outcomeConfidence > existing.outcomeConfidence + 0.01;
    const outcomeChanged = incoming.outcome !== existing.outcome;
    const signalsChanged = JSON.stringify(existingSignals) !== JSON.stringify(incoming.automatedSignals);
    const contextChanged = JSON.stringify(existingContext) !== JSON.stringify(incoming.context);
    const solutionChanged = Boolean(incoming.solution && incoming.solution !== existing.solution);
    const errorChanged = Boolean(incoming.errorMessage && incoming.errorMessage !== existing.errorMessage);
    const toolsChanged = JSON.stringify(parseStringArray(existing.toolsUsedJson)) !== JSON.stringify(incoming.toolsUsed);
    const filesChanged = JSON.stringify(parseStringArray(existing.filesModifiedJson)) !== JSON.stringify(incoming.filesModified);
    const durationChanged = incoming.durationMs > existing.durationMs;
    const sharingChanged = incoming.shareEligible !== existing.shareEligible || (incoming.sharedSignature ?? null) !== existing.sharedSignature;
    return (sourceUpgraded ||
        confidenceUpgraded ||
        outcomeChanged ||
        signalsChanged ||
        contextChanged ||
        solutionChanged ||
        errorChanged ||
        toolsChanged ||
        filesChanged ||
        durationChanged ||
        sharingChanged);
}
async function logCognitiveApplication(params) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    const now = new Date().toISOString();
    const applicationId = node_crypto_1.default.randomUUID();
    await client.execute({
        sql: `
      INSERT INTO cognitive_applications (
        id, user_id, session_id, trace_id, problem, endpoint,
        repo_profile_json, materialized_pattern_id, materialized_skill_id, retry_count, baseline_group_key, baseline_snapshot_json,
        accepted_trace_id, accepted_pattern_id, accepted_skill_id, final_outcome, time_to_resolution_ms,
        verification_summary_json, created_at, updated_at
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)
    `,
        args: [
            applicationId,
            params.userId,
            params.sessionId,
            params.problem,
            params.endpoint,
            params.repoProfile ? JSON.stringify(params.repoProfile) : null,
            now,
            now,
        ],
    });
    const matches = [];
    for (const [entityType, entities] of [
        ["trace", params.traces],
        ["pattern", params.patterns],
        ["skill", params.skills],
    ]) {
        for (const entity of entities) {
            const matchId = node_crypto_1.default.randomUUID();
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
async function attachTraceToApplication(params) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
async function createTrace(input) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    const now = new Date().toISOString();
    const normalizedContext = input.context ?? {};
    const automatedSignals = input.automatedSignals ?? {};
    const userSettings = input.shareEligible == null ? await getCognitiveUserSettings(input.userId) : null;
    const shareEligible = input.shareEligible ?? userSettings?.sharedLearningEnabled ?? false;
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
    const resolved = (0, cognitive_learning_1.resolveOutcome)({
        heuristicOutcome,
        automatedOutcome: input.automatedOutcome,
    });
    const sharedSignature = null;
    const existing = await client.execute({
        sql: `SELECT * FROM coding_traces WHERE user_id = ? AND trace_hash = ? LIMIT 1`,
        args: [input.userId, traceHash],
    });
    if (existing.rows[0]) {
        const existingTrace = rowToTrace(existing.rows[0]);
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
    let embedding = null;
    try {
        embedding = await (0, embeddings_1.embedText)(`${input.problem}\n${input.reasoning}`.slice(0, 8000));
    }
    catch {
        // Embeddings are best effort.
    }
    const id = node_crypto_1.default.randomUUID();
    const embeddingSql = embedding ? "vector(?)" : "NULL";
    const insertArgs = [
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
    insertArgs.push(embedding ? JSON.stringify(embedding) : null, traceHash, resolved.source, resolved.confidence, JSON.stringify(automatedSignals), shareEligible ? 1 : 0, sharedSignature, input.explicitFeedbackNotes ?? null);
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
    return rowToTrace(result.rows[0]);
}
async function getTraceById(traceId, userId) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    const result = await client.execute({
        sql: `SELECT * FROM coding_traces WHERE id = ? ${userId ? "AND user_id = ?" : ""} LIMIT 1`,
        args: userId ? [traceId, userId] : [traceId],
    });
    const row = result.rows[0];
    return row ? rowToTrace(row) : null;
}
async function getRecentTraces(userId, limit = 20) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    const result = await client.execute({
        sql: `
      SELECT * FROM coding_traces
      WHERE user_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `,
        args: [userId, Math.max(1, Math.min(limit, 100))],
    });
    return result.rows.map((row) => rowToTrace(row));
}
async function getRelevantTraces(userId, problem, limit = 5) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    let embedding = null;
    try {
        embedding = await (0, embeddings_1.embedText)(problem);
    }
    catch {
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
        return result.rows.map((row) => rowToTrace(row));
    }
    const keywords = (0, cognitive_learning_1.extractProblemKeywords)(problem, 5);
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
    return result.rows.map((row) => rowToTrace(row));
}
async function updateTraceOutcome(params) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
async function createPattern(input) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    const id = node_crypto_1.default.randomUUID();
    const now = new Date().toISOString();
    const scope = input.scope ?? (input.userId ? "local" : "global");
    const patternKey = input.patternKey ?? `${scope}:${input.userId ?? "global"}:${(0, cognitive_learning_1.normalizeForFingerprint)(input.domain)}:${node_crypto_1.default.randomUUID()}`;
    const sharedSignature = scope === "global" ? null : (input.sharedSignature ?? null);
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
    return rowToPattern(result.rows[0]);
}
async function getPatterns(userId, domain) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    const result = await client.execute({
        sql: `
      SELECT * FROM cognitive_patterns
      WHERE (user_id = ? OR scope = 'global' OR user_id IS NULL)
        ${domain ? "AND domain = ?" : ""}
      ORDER BY scope ASC, confidence DESC, updated_at DESC
    `,
        args: domain ? [userId, domain] : [userId],
    });
    return result.rows.map((row) => rowToPattern(row));
}
async function getMatchingPatterns(params) {
    const patterns = await getPatterns(params.userId);
    const scored = patterns
        .filter((pattern) => (0, cognitive_learning_1.isInjectablePatternStatus)(pattern.status))
        .map((pattern) => ({
        ...pattern,
        score: scorePatternMatch({
            pattern,
            problem: params.problem,
            technologies: params.technologies ?? [],
        }),
    }))
        .filter((pattern) => pattern.score > 0)
        .sort((left, right) => right.score - left.score ||
        right.confidence - left.confidence ||
        right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, params.limit ?? 5);
    return scored;
}
async function getRelevantSkills(params) {
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
    const client = (0, turso_1.getDb)();
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
        .map((row) => rowToSkill(row))
        .filter((skill) => (0, cognitive_learning_1.isInjectableSkillStatus)(skill.status))
        .sort((left, right) => (scoreByPatternKey.get(right.patternKey) ?? 0) - (scoreByPatternKey.get(left.patternKey) ?? 0) ||
        right.successRate - left.successRate ||
        right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, params.limit ?? 3);
}
async function updatePatternFeedback(params) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
    }
    else {
        const patternRow = patternResult.rows[0];
        const matchUserId = patternRow.scope === "global" || patternRow.user_id == null ? "__global__" : params.userId;
        await client.execute({
            sql: `
        INSERT INTO trace_pattern_matches (
          id, user_id, trace_id, pattern_id, score, match_source, explicit_outcome, feedback_notes, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, 'explicit_feedback', ?, ?, ?, ?)
      `,
            args: [
                node_crypto_1.default.randomUUID(),
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
async function getSkillCandidates(userId) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    const result = await client.execute({
        sql: `
      SELECT * FROM cognitive_patterns
      WHERE (user_id = ? OR scope = 'global' OR user_id IS NULL)
        AND status IN ('active_local', 'active_global', 'synthesized_local', 'synthesized_global')
        AND confidence >= 0.8
        AND success_count >= 5
      ORDER BY confidence DESC, updated_at DESC
    `,
        args: [userId],
    });
    return result.rows
        .map((row) => rowToPattern(row))
        .filter((pattern) => (0, cognitive_learning_1.isSkillSynthesisEligible)({
        status: pattern.status,
        confidence: pattern.confidence,
        successCount: pattern.successCount,
        failCount: pattern.failCount,
    }));
}
async function syncPatternExtractionMatches(params) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
        const userId = params.includeUserScopedMatches === false ? "__global__" : row.user_id;
        await client.execute({
            sql: `
        INSERT INTO trace_pattern_matches (
          id, user_id, trace_id, pattern_id, score, match_source, created_at
        ) VALUES (?, ?, ?, ?, ?, 'pattern_extraction', ?)
        ON CONFLICT(trace_id, pattern_id) DO NOTHING
      `,
            args: [
                node_crypto_1.default.randomUUID(),
                userId,
                row.id,
                params.patternId,
                params.score ?? 1,
                now,
            ],
        });
    }
}
async function clearPatternExtractionMatches(patternId) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    await client.execute({
        sql: `DELETE FROM trace_pattern_matches WHERE pattern_id = ? AND match_source = 'pattern_extraction'`,
        args: [patternId],
    });
}
async function getTracePatternMatches(traceId, userId) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
        id: row.id,
        userId: row.user_id,
        traceId: row.trace_id,
        patternId: row.pattern_id,
        score: Number(row.score ?? 0),
        matchSource: row.match_source ?? "trace_capture",
        explicitOutcome: (row.explicit_outcome ?? null),
        feedbackNotes: row.feedback_notes ?? null,
        createdAt: row.created_at,
    }));
}
async function syncTracePatternMatches(params) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
                node_crypto_1.default.randomUUID(),
                params.userId,
                params.traceId,
                pattern.id,
                pattern.score,
                params.matchSource ?? "trace_capture",
                now,
            ],
        });
    }
    const touchedPatternIds = new Set(params.patterns.map((pattern) => pattern.id));
    for (const row of existingMatches.rows) {
        if (typeof row.pattern_id === "string") {
            touchedPatternIds.add(row.pattern_id);
        }
    }
    await recomputePatternStats([...touchedPatternIds]);
}
async function recomputePatternStats(patternIds) {
    await ensureInitialized();
    const uniquePatternIds = Array.from(new Set(patternIds.filter(Boolean)));
    if (uniquePatternIds.length === 0) {
        return;
    }
    await recomputePatternImpactStats(uniquePatternIds);
    const client = (0, turso_1.getDb)();
    const now = new Date().toISOString();
    for (const patternId of uniquePatternIds) {
        const patternResult = await client.execute({
            sql: `
        SELECT scope, status, application_count, accepted_application_count, successful_application_count,
               median_time_to_resolution_ms, median_retries, verification_pass_rate, impact_score, promotion_reason
        FROM cognitive_patterns
        WHERE id = ?
        LIMIT 1
      `,
            args: [patternId],
        });
        const patternRow = patternResult.rows[0];
        if (!patternRow) {
            continue;
        }
        const patternScope = (patternRow.scope ?? "local");
        const currentStatus = patternRow.status ?? "candidate";
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
            const traceRow = rowToTrace(row);
            const trace = asLearningTrace(traceRow);
            const explicitOutcome = row.explicit_outcome;
            if (explicitOutcome === "success" || explicitOutcome === "failure") {
                trace.outcome = explicitOutcome === "failure" ? "failed" : "success";
                trace.outcomeSource = "explicit";
                trace.outcomeConfidence = 1;
            }
            return {
                trace,
                updatedAt: traceRow.updatedAt || traceRow.createdAt,
                score: (0, cognitive_learning_1.scoreTraceEvidence)(trace),
            };
        });
        const summary = (0, cognitive_learning_1.summarizePatternEvidence)(evidence.map((item) => item.trace));
        const lastApplied = evidence.reduce((latest, item) => (!latest || item.updatedAt > latest ? item.updatedAt : latest), null);
        const status = (0, cognitive_learning_1.classifyPatternLifecycle)({
            effectiveEvidence: summary.effectiveEvidence,
            confidence: summary.confidence,
            scope: patternScope,
            impact: {
                applications: Number(patternRow.application_count ?? 0),
                acceptedApplications: Number(patternRow.accepted_application_count ?? 0),
                successfulApplications: Number(patternRow.successful_application_count ?? 0),
                medianTimeToResolutionMs: patternRow.median_time_to_resolution_ms == null ? null : Number(patternRow.median_time_to_resolution_ms),
                medianRetries: patternRow.median_retries == null ? null : Number(patternRow.median_retries),
                verificationPassRate: Number(patternRow.verification_pass_rate ?? 0),
                impactScore: Number(patternRow.impact_score ?? 0),
                promotionReason: patternRow.promotion_reason ?? "pattern_impact_refresh",
            },
        });
        const nextStatus = currentStatus.startsWith("synthesized_") && status !== "deprecated"
            ? (0, cognitive_learning_1.synthesizedPatternStatus)(patternScope)
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
            args: [summary.successCount, summary.failCount, summary.confidence, nextStatus, lastApplied, now, patternId],
        });
    }
}
async function runPatternExtraction(params) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    const minTraces = params.minTraces ?? 3;
    const minSuccessRate = params.minSuccessRate ?? 0.7;
    const existingLocalResult = await client.execute({
        sql: `SELECT id, pattern_key FROM cognitive_patterns WHERE scope = 'local' AND user_id = ?`,
        args: [params.userId],
    });
    const existingLocalByKey = new Map(existingLocalResult.rows.map((row) => [row.pattern_key, row.id]));
    const localRows = await client.execute({
        sql: `SELECT * FROM coding_traces WHERE user_id = ? AND sanitized = 1 ORDER BY created_at DESC LIMIT 500`,
        args: [params.userId],
    });
    const localTraces = localRows.rows.map((row) => asLearningTrace(rowToTrace(row)));
    const localClusters = (0, cognitive_learning_1.clusterLearningTraces)({ traces: localTraces, scope: "local" });
    const localCandidates = localClusters
        .filter((cluster) => cluster.traces.length >= minTraces)
        .map(cognitive_learning_1.extractPatternCandidate)
        .filter((pattern) => pattern != null && pattern.confidence >= minSuccessRate);
    let localPatterns = 0;
    const touchedPatternIds = [];
    const localCandidateKeys = new Set();
    for (const candidate of localCandidates) {
        localCandidateKeys.add(candidate.key);
        const pattern = await upsertPatternCandidate({
            ...candidate,
            status: (0, cognitive_learning_1.classifyPatternLifecycle)({
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
            sql: `SELECT id, pattern_key FROM cognitive_patterns WHERE scope = 'global' OR user_id IS NULL`,
            args: [],
        });
        const existingGlobalByKey = new Map(existingGlobalResult.rows.map((row) => [row.pattern_key, row.id]));
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
            .map((row) => asLearningTrace(rowToTrace(row)))
            .filter((trace) => trace.shareEligible);
        const globalClusters = (0, cognitive_learning_1.clusterLearningTraces)({ traces: globalTraces, scope: "global" });
        const globalCandidates = globalClusters
            .filter((cluster) => cluster.traces.length >= minTraces)
            .map(cognitive_learning_1.extractPatternCandidate)
            .filter((pattern) => pattern != null && pattern.confidence >= minSuccessRate);
        const globalCandidateKeys = new Set();
        for (const candidate of globalCandidates) {
            globalCandidateKeys.add(candidate.key);
            const pattern = await upsertPatternCandidate({
                ...candidate,
                status: (0, cognitive_learning_1.classifyPatternLifecycle)({
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
async function upsertPatternCandidate(candidate) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
        return rowToPattern(refreshed.rows[0]);
    }
    return createPattern({
        userId: candidate.userId,
        scope: candidate.scope,
        patternKey: candidate.key,
        sharedSignature: null,
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
async function synthesizeEligibleSkills(params) {
    await ensureInitialized();
    const candidates = await getSkillCandidates(params.userId);
    const skills = [];
    const client = (0, turso_1.getDb)();
    const now = new Date().toISOString();
    for (const pattern of candidates) {
        const trigger = parseObject(pattern.triggerJson);
        const draft = (0, cognitive_learning_1.buildSkillDraft)({
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
        const skillStatus = (0, cognitive_learning_1.deriveSkillLifecycle)({
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
            skills.push(rowToSkill(refreshed.rows[0]));
        }
        else {
            const id = node_crypto_1.default.randomUUID();
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
            skills.push(rowToSkill(inserted.rows[0]));
        }
        await client.execute({
            sql: `
        UPDATE cognitive_patterns
        SET synthesized_into_skill = ?, status = ?, updated_at = ?
        WHERE id = ?
      `,
            args: [skills[skills.length - 1].id, (0, cognitive_learning_1.synthesizedPatternStatus)(pattern.scope), now, pattern.id],
        });
    }
    return skills;
}
function verificationPassed(summary) {
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
function deriveRepoFamily(profile, trace) {
    const workspaceRoot = typeof profile.workspaceRoot === "string" ? profile.workspaceRoot : null;
    if (workspaceRoot) {
        const segments = workspaceRoot.split(/[\\/]/).filter(Boolean);
        return segments.slice(-2).join("/").toLowerCase() || null;
    }
    const context = trace ? parseObject(trace.contextJson) : {};
    const projectType = typeof context.projectType === "string" ? context.projectType : null;
    return projectType ? (0, cognitive_learning_1.normalizeForFingerprint)(projectType) : null;
}
function deriveBaselineGroupKey(params) {
    if (params.explicitGroupKey) {
        return params.explicitGroupKey;
    }
    const traceContext = params.trace ? parseObject(params.trace.contextJson) : {};
    const technologies = parseStringArray(traceContext.technologies);
    const errorMessages = parseStringArray(traceContext.errorMessages);
    const repoProfile = parseObject(params.application.repoProfileJson);
    const sharedSignature = params.trace?.sharedSignature ??
        (0, cognitive_learning_1.buildSharedSignature)({
            type: params.trace?.type ?? "debugging",
            problem: params.application.problem,
            technologies,
            errorMessages,
        });
    const repoFamily = deriveRepoFamily(repoProfile, params.trace);
    return [
        (0, cognitive_learning_1.normalizeForFingerprint)(params.application.endpoint),
        sharedSignature,
        repoFamily ?? "",
    ]
        .filter(Boolean)
        .join(":");
}
async function computeBaselineSnapshot(params) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
        .filter((value) => typeof value === "number" && Number.isFinite(value));
    const retryValues = rows
        .map((row) => (row.retry_count == null ? null : Number(row.retry_count)))
        .filter((value) => typeof value === "number" && Number.isFinite(value));
    const successRate = rows.length === 0
        ? 0
        : rows.filter((row) => row.final_outcome === "success").length / rows.length;
    const verificationPassRate = rows.length === 0
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
function applicationObservation(row) {
    return {
        accepted: Number(row.accepted ?? 0) === 1,
        explicitNegative: Number(row.explicit_negative ?? 0) === 1,
        finalOutcome: row.final_outcome ?? null,
        timeToResolutionMs: row.time_to_resolution_ms == null ? null : Number(row.time_to_resolution_ms),
        retryCount: row.retry_count == null ? null : Number(row.retry_count),
        verificationPassed: verificationPassed(parseObject(row.verification_summary_json)) ?? undefined,
        baseline: row.baseline_snapshot_json ? parseObject(row.baseline_snapshot_json) : null,
    };
}
async function recomputePatternImpactStats(patternIds) {
    await ensureInitialized();
    const uniquePatternIds = Array.from(new Set(patternIds.filter(Boolean)));
    if (uniquePatternIds.length === 0) {
        return;
    }
    const client = (0, turso_1.getDb)();
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
        const impact = (0, cognitive_learning_1.summarizeEntityImpact)(stats.rows.map((row) => applicationObservation(row)));
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
async function recomputeSkillStats(skillIds) {
    await ensureInitialized();
    const uniqueSkillIds = Array.from(new Set(skillIds.filter(Boolean)));
    if (uniqueSkillIds.length === 0) {
        return;
    }
    const client = (0, turso_1.getDb)();
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
        const impact = (0, cognitive_learning_1.summarizeEntityImpact)(stats.rows.map((row) => applicationObservation(row)));
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
async function refreshSkillStatuses(userId) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
      WHERE s.user_id = ? OR s.scope = 'global' OR s.user_id IS NULL
    `,
        args: [userId],
    });
    const now = new Date().toISOString();
    for (const row of rows.rows) {
        const nextStatus = (0, cognitive_learning_1.deriveSkillLifecycle)({
            patternStatus: row.pattern_status ?? "candidate",
            confidence: Number(row.quality_score ?? 0),
            impact: {
                applications: Number(row.usage_count ?? 0),
                acceptedApplications: Number(row.accepted_application_count ?? 0),
                successfulApplications: Number(row.successful_application_count ?? 0),
                medianTimeToResolutionMs: row.median_time_to_resolution_ms == null ? null : Number(row.median_time_to_resolution_ms),
                medianRetries: row.median_retries == null ? null : Number(row.median_retries),
                verificationPassRate: Number(row.verification_pass_rate ?? 0),
                impactScore: Number(row.impact_score ?? 0),
                promotionReason: row.promotion_reason ?? "skill_impact_refresh",
            },
        });
        if (nextStatus !== (row.skill_status ?? "draft")) {
            await client.execute({
                sql: `UPDATE synthesized_skills SET status = ?, updated_at = ? WHERE id = ?`,
                args: [nextStatus, now, row.skill_id],
            });
        }
    }
}
async function updateApplicationOutcome(params) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
    const existingApplication = rowToApplication(existing.rows[0]);
    const trace = params.traceId != null
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
    const baselineSnapshot = baselineGroupKey == null
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
    await recomputeSkillStats(skillRows.rows
        .map((row) => row.entity_id)
        .filter((value) => typeof value === "string"));
    const patternIdsToRefresh = new Set();
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
    return refreshed.rows[0] ? rowToApplication(refreshed.rows[0]) : null;
}
async function publishSkill(params) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    const skillResult = await client.execute({
        sql: `
      SELECT *
      FROM synthesized_skills
      WHERE id = ?
        AND (
          user_id = ?
          OR (scope = 'global' AND ? = 1)
          OR (user_id IS NULL AND ? = 1)
        )
      LIMIT 1
    `,
        args: [params.skillId, params.userId, params.allowGlobal ? 1 : 0, params.allowGlobal ? 1 : 0],
    });
    if (!skillResult.rows[0]) {
        return null;
    }
    const skill = rowToSkill(skillResult.rows[0]);
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
    return refreshed.rows[0] ? rowToSkill(refreshed.rows[0]) : null;
}
async function setSkillPublicationDisabled(params) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
async function setPatternStatus(params) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
async function refreshSkillDraftById(params) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
    const skill = rowToSkill(skillResult.rows[0]);
    const patternResult = await client.execute({
        sql: `SELECT * FROM cognitive_patterns WHERE id = ? LIMIT 1`,
        args: [skill.patternId],
    });
    if (!patternResult.rows[0]) {
        return null;
    }
    const pattern = rowToPattern(patternResult.rows[0]);
    const trigger = parseObject(pattern.triggerJson);
    const draft = (0, cognitive_learning_1.buildSkillDraft)({
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
    return refreshed.rows[0] ? rowToSkill(refreshed.rows[0]) : skill;
}
async function getSkills(userId) {
    await ensureInitialized();
    await refreshSkillStatuses(userId);
    const client = (0, turso_1.getDb)();
    const result = await client.execute({
        sql: `
      SELECT * FROM synthesized_skills
      WHERE user_id = ? OR scope = 'global' OR user_id IS NULL
      ORDER BY success_rate DESC, updated_at DESC
    `,
        args: [userId],
    });
    return result.rows.map((row) => rowToSkill(row));
}
async function getSkillById(userId, skillId) {
    await ensureInitialized();
    await refreshSkillStatuses(userId);
    const client = (0, turso_1.getDb)();
    const result = await client.execute({
        sql: `
      SELECT * FROM synthesized_skills
      WHERE id = ? AND (user_id = ? OR scope = 'global' OR user_id IS NULL)
      LIMIT 1
    `,
        args: [skillId, userId],
    });
    const row = result.rows[0];
    return row ? rowToSkill(row) : null;
}
async function getRecentApplications(userId, limit = 25) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
    const applications = applicationsResult.rows.map((row) => rowToApplication(row));
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
    const matches = matchesResult.rows.map((row) => rowToApplicationMatch(row));
    return applications.map((application) => ({
        application,
        matches: matches.filter((match) => match.applicationId === application.id),
    }));
}
async function getTracesByIds(traceIds) {
    const uniqueTraceIds = Array.from(new Set(traceIds.filter(Boolean)));
    if (uniqueTraceIds.length === 0) {
        return new Map();
    }
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    const result = await client.execute({
        sql: `
      SELECT *
      FROM coding_traces
      WHERE id IN (${uniqueTraceIds.map(() => "?").join(",")})
    `,
        args: uniqueTraceIds,
    });
    return new Map(result.rows.map((row) => {
        const trace = rowToTrace(row);
        return [trace.id, trace];
    }));
}
async function generateRetrievalEvalDataset(params) {
    const applicationBundles = await getRecentApplications(params.userId, params.limit ?? 100);
    const tracesById = await getTracesByIds(applicationBundles.flatMap(({ application, matches }) => [
        ...(application.traceId ? [application.traceId] : []),
        ...matches.filter((match) => match.entityType === "trace").map((match) => match.entityId),
    ]));
    const records = [];
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
        const hasWeakSignal = application.finalOutcome === "success" &&
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
        const labelSource = explicitAcceptedId ? "explicit" : "weak";
        const verificationSummary = parseObject(application.verificationSummaryJson);
        const targetResolutionKind = typeof verificationSummary.resolutionKind === "string" ? verificationSummary.resolutionKind : undefined;
        const baselineSnapshot = application.baselineSnapshotJson
            ? parseObject(application.baselineSnapshotJson)
            : undefined;
        const fixture = {
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
            expectedOutcome: application.finalOutcome === "success" ||
                application.finalOutcome === "partial" ||
                application.finalOutcome === "failed" ||
                application.finalOutcome === "abandoned"
                ? application.finalOutcome
                : undefined,
            maxRetries: baselineSnapshot?.medianRetries != null ? Math.max(1, Math.round(baselineSnapshot.medianRetries)) : undefined,
            targetResolutionKind: targetResolutionKind === "tests_passed" ||
                targetResolutionKind === "build_passed" ||
                targetResolutionKind === "lint_passed" ||
                targetResolutionKind === "manual_only" ||
                targetResolutionKind === "failed"
                ? targetResolutionKind
                : undefined,
            baseline: baselineSnapshot,
        };
        const prediction = {
            applicationId: application.id,
            sessionId: application.sessionId,
            traces: traceMatches.map((match) => ({ id: match.entityId })),
            patterns: patternMatches.map((match) => ({ id: match.entityId })),
            skills: skillMatches.map((match) => ({ id: match.entityId })),
            finalOutcome: application.finalOutcome === "success" ||
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
            verificationResults: application.verificationSummaryJson
                ? {
                    verified: verificationPassed(verificationSummary) === true,
                    resolutionKind: targetResolutionKind === "tests_passed" ||
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
async function recordBenchmarkRun(params) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    const now = new Date().toISOString();
    await client.execute({
        sql: `
      INSERT INTO cognitive_benchmark_runs (id, user_id, dataset, fixture_count, result_json, gate_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
        args: [
            node_crypto_1.default.randomUUID(),
            params.userId,
            params.dataset,
            params.fixtureCount,
            JSON.stringify(params.result),
            params.gate ? JSON.stringify(params.gate) : null,
            now,
        ],
    });
}
async function getRecentBenchmarkRuns(userId, limit = 10) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
        id: row.id,
        dataset: row.dataset,
        fixtureCount: Number(row.fixture_count ?? 0),
        result: parseObject(row.result_json),
        gate: row.gate_json ? parseObject(row.gate_json) : null,
        createdAt: row.created_at,
    }));
}
async function getFailedBenchmarkRunsSince(since, limit = 20) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
        id: row.id,
        userId: row.user_id,
        dataset: row.dataset,
        fixtureCount: Number(row.fixture_count ?? 0),
        gate: row.gate_json ? parseObject(row.gate_json) : null,
        createdAt: row.created_at,
    }))
        .filter((run) => run.gate?.passed === false);
}
async function getCognitiveJobHealth() {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    const result = await client.execute({
        sql: `
      SELECT job_name, lease_expires_at, last_run_at, last_success_at, checkpoint_json
      FROM cognitive_jobs
      ORDER BY updated_at DESC
    `,
        args: [],
    });
    return result.rows.map((row) => ({
        jobName: row.job_name,
        leaseExpiresAt: row.lease_expires_at ?? null,
        lastRunAt: row.last_run_at ?? null,
        lastSuccessAt: row.last_success_at ?? null,
        checkpointJson: row.checkpoint_json ?? null,
    }));
}
async function getCognitiveMetrics(userId, days = 7) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
        WHERE user_id = ? OR (scope = 'global' AND user_id IS NULL)
      `,
            args: [cutoff, cutoff, userId],
        }),
        client.execute({
            sql: `
        SELECT
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as created_count,
          SUM(CASE WHEN status = 'stale' THEN 1 ELSE 0 END) as stale_count
        FROM synthesized_skills
        WHERE user_id = ? OR scope = 'global' OR user_id IS NULL
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
async function tryAcquireJobLease(params) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    const now = new Date();
    const nowIso = now.toISOString();
    const leaseToken = node_crypto_1.default.randomUUID();
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
    const row = result.rows[0];
    return {
        jobName: params.jobName,
        leaseToken,
        leaseExpiresAt,
        lastRunAt: row?.last_run_at ?? null,
        lastSuccessAt: row?.last_success_at ?? null,
        checkpointJson: row?.checkpoint_json ?? null,
    };
}
async function releaseJobLease(params) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
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
//# sourceMappingURL=cognitive-db.js.map