import { tableSql } from "./schema-definition.mjs";

export const version = "0002";
export const name = "schema_repair";
export const kind = "js";
export const signature = "2026-03-12-schema-repair-v1";

const CORE_COLUMN_REPAIRS = {
  memories: [
    { name: "content_iv", ddl: "TEXT" },
    { name: "content_encrypted", ddl: "INTEGER NOT NULL DEFAULT 0" },
    { name: "sensitive", ddl: "INTEGER NOT NULL DEFAULT 0" },
    { name: "namespace_id", ddl: "TEXT" },
    { name: "session_id", ddl: "TEXT" },
    { name: "metadata_json", ddl: "TEXT" },
    { name: "strength", ddl: "REAL DEFAULT 1.0" },
    { name: "base_strength", ddl: "REAL DEFAULT 1.0" },
    { name: "mention_count", ddl: "INTEGER DEFAULT 1" },
    { name: "access_count", ddl: "INTEGER DEFAULT 0" },
    { name: "feedback_score", ddl: "INTEGER DEFAULT 0" },
    { name: "halflife_days", ddl: "INTEGER DEFAULT 60" },
    { name: "last_accessed_at", ddl: "TEXT" },
    { name: "last_mentioned_at", ddl: "TEXT" },
    { name: "first_mentioned_at", ddl: "TEXT" },
    { name: "archived_at", ddl: "TEXT" },
    { name: "is_identity", ddl: "INTEGER DEFAULT 0" },
    { name: "source_conversations", ddl: "TEXT" },
    { name: "entities", ddl: "TEXT" },
    { name: "entities_json", ddl: "TEXT" },
    { name: "embedding", ddl: "TEXT" },
    { name: "embedding_hash", ddl: "TEXT" },
    { name: "content_mac", ddl: "TEXT" },
    { name: "tags_json", ddl: "TEXT" },
    { name: "importance_tier", ddl: "TEXT DEFAULT 'normal'" },
    { name: "durability_class", ddl: "TEXT DEFAULT 'working'" },
    { name: "promotion_locked", ddl: "INTEGER DEFAULT 0" },
    { name: "locked_tier", ddl: "TEXT" },
    { name: "decay_immune", ddl: "INTEGER DEFAULT 0" },
    { name: "completed", ddl: "INTEGER DEFAULT 0" },
    { name: "completed_at", ddl: "TEXT" },
    { name: "ephemeral", ddl: "INTEGER DEFAULT 0" },
    { name: "absorbed", ddl: "INTEGER DEFAULT 0" },
    { name: "absorbed_into_synthesis_id", ddl: "TEXT" },
    { name: "absorbed_by", ddl: "TEXT" },
    { name: "absorbed_at", ddl: "TEXT" },
    { name: "peer", ddl: "TEXT NOT NULL DEFAULT 'user'" },
  ],
  api_keys: [
    { name: "key_suffix", ddl: "TEXT" },
    { name: "scopes_json", ddl: `TEXT NOT NULL DEFAULT '["*"]'` },
    { name: "last_plugin_id", ddl: "TEXT" },
    { name: "last_plugin_version", ddl: "TEXT" },
    { name: "last_plugin_mode", ddl: "TEXT" },
    { name: "last_plugin_seen_at", ddl: "TEXT" },
  ],
  synthesized_memories: [
    { name: "synthesis", ddl: "TEXT NOT NULL DEFAULT ''" },
    { name: "title", ddl: "TEXT NOT NULL DEFAULT ''" },
    { name: "source_memory_ids", ddl: "TEXT NOT NULL DEFAULT '[]'" },
    { name: "source_count", ddl: "INTEGER NOT NULL DEFAULT 0" },
    { name: "cluster_id", ddl: "TEXT NOT NULL DEFAULT ''" },
    { name: "cluster_topic", ddl: "TEXT NOT NULL DEFAULT ''" },
    { name: "compression_ratio", ddl: "REAL" },
    { name: "confidence", ddl: "REAL" },
    { name: "synthesized_at", ddl: "TEXT NOT NULL DEFAULT ''" },
    { name: "last_validated_at", ddl: "TEXT NOT NULL DEFAULT ''" },
    { name: "stale", ddl: "INTEGER DEFAULT 0" },
    { name: "importance_tier", ddl: "TEXT DEFAULT 'normal'" },
    { name: "access_count", ddl: "INTEGER DEFAULT 0" },
    { name: "created_at", ddl: "TEXT NOT NULL DEFAULT ''" },
    { name: "abstraction_level", ddl: "INTEGER DEFAULT 1" },
    { name: "synthesis_quality_score", ddl: "REAL" },
    { name: "synthesis_metadata", ddl: "TEXT" },
  ],
  vault_entries: [
    { name: "name", ddl: "TEXT NOT NULL DEFAULT ''" },
    { name: "category", ddl: "TEXT NOT NULL DEFAULT 'token'" },
    { name: "value_encrypted", ddl: "TEXT NOT NULL DEFAULT ''" },
    { name: "metadata_json", ddl: "TEXT" },
    { name: "created_at", ddl: "TEXT NOT NULL DEFAULT ''" },
    { name: "updated_at", ddl: "TEXT NOT NULL DEFAULT ''" },
  ],
  sessions: [
    { name: "turn_count", ddl: "INTEGER DEFAULT 0" },
    { name: "outcome", ddl: "TEXT" },
    { name: "feedback", ddl: "TEXT" },
    { name: "ended_at", ddl: "TEXT" },
  ],
  usage_stats: [{ name: "memories_total", ddl: "INTEGER DEFAULT 0" }],
  user_salts: [{ name: "hmac_secret", ddl: "TEXT" }],
  user_constraints: [
    { name: "scope", ddl: "TEXT DEFAULT 'user'" },
    { name: "template_id", ddl: "TEXT" },
  ],
  memory_vectors: [{ name: "vector_dimension", ddl: "INTEGER NOT NULL DEFAULT 384" }],
  coding_traces: [
    { name: "updated_at", ddl: "TEXT" },
    { name: "embedding_json", ddl: "TEXT" },
    { name: "trace_hash", ddl: "TEXT" },
    { name: "outcome_source", ddl: "TEXT DEFAULT 'heuristic'" },
    { name: "outcome_confidence", ddl: "REAL DEFAULT 0.55" },
    { name: "automated_signals_json", ddl: "TEXT DEFAULT '{}'" },
    { name: "share_eligible", ddl: "INTEGER DEFAULT 0" },
    { name: "shared_signature", ddl: "TEXT" },
    { name: "explicit_feedback_notes", ddl: "TEXT" },
  ],
  cognitive_patterns: [
    { name: "scope", ddl: "TEXT DEFAULT 'local'" },
    { name: "org_id", ddl: "TEXT" },
    { name: "source_pattern_id", ddl: "TEXT" },
    { name: "provenance_json", ddl: "TEXT DEFAULT '{}'" },
    { name: "pattern_key", ddl: "TEXT" },
    { name: "shared_signature", ddl: "TEXT" },
    { name: "source_trace_count", ddl: "INTEGER DEFAULT 0" },
    { name: "application_count", ddl: "INTEGER DEFAULT 0" },
    { name: "accepted_application_count", ddl: "INTEGER DEFAULT 0" },
    { name: "successful_application_count", ddl: "INTEGER DEFAULT 0" },
    { name: "median_time_to_resolution_ms", ddl: "INTEGER" },
    { name: "median_retries", ddl: "REAL" },
    { name: "verification_pass_rate", ddl: "REAL DEFAULT 0" },
    { name: "impact_score", ddl: "REAL DEFAULT 0" },
    { name: "promotion_reason", ddl: "TEXT" },
  ],
  trace_pattern_matches: [
    { name: "explicit_outcome", ddl: "TEXT" },
    { name: "feedback_notes", ddl: "TEXT" },
    { name: "updated_at", ddl: "TEXT" },
  ],
  synthesized_skills: [
    { name: "scope", ddl: "TEXT DEFAULT 'local'" },
    { name: "pattern_key", ddl: "TEXT DEFAULT ''" },
    { name: "source_trace_count", ddl: "INTEGER DEFAULT 0" },
    { name: "accepted_application_count", ddl: "INTEGER DEFAULT 0" },
    { name: "successful_application_count", ddl: "INTEGER DEFAULT 0" },
    { name: "median_time_to_resolution_ms", ddl: "INTEGER" },
    { name: "median_retries", ddl: "REAL" },
    { name: "verification_pass_rate", ddl: "REAL DEFAULT 0" },
    { name: "impact_score", ddl: "REAL DEFAULT 0" },
    { name: "promotion_reason", ddl: "TEXT" },
  ],
  cognitive_applications: [
    { name: "accepted_trace_id", ddl: "TEXT" },
    { name: "repo_profile_json", ddl: "TEXT" },
    { name: "materialized_pattern_id", ddl: "TEXT" },
    { name: "materialized_skill_id", ddl: "TEXT" },
    { name: "policy_key", ddl: "TEXT" },
    { name: "policy_context_key", ddl: "TEXT" },
    { name: "policy_snapshot_json", ddl: "TEXT" },
    { name: "policy_reward", ddl: "REAL" },
    { name: "workflow_strategy_key", ddl: "TEXT" },
    { name: "workflow_context_key", ddl: "TEXT" },
    { name: "workflow_snapshot_json", ddl: "TEXT" },
    { name: "workflow_observed_key", ddl: "TEXT" },
    { name: "workflow_reward", ddl: "REAL" },
    { name: "retry_count", ddl: "INTEGER" },
    { name: "baseline_group_key", ddl: "TEXT" },
    { name: "baseline_snapshot_json", ddl: "TEXT" },
  ],
  cognitive_user_settings: [
    { name: "shared_learning_enabled", ddl: "INTEGER DEFAULT 0" },
    { name: "benchmark_inclusion_enabled", ddl: "INTEGER DEFAULT 0" },
    { name: "trace_retention_days", ddl: "INTEGER DEFAULT 30" },
  ],
};

const COGNITIVE_INDEXES = [
  { sql: `CREATE INDEX IF NOT EXISTS idx_traces_user ON coding_traces(user_id)`, table: "coding_traces", columns: ["user_id"] },
  { sql: `CREATE INDEX IF NOT EXISTS idx_traces_user_type ON coding_traces(user_id, type)`, table: "coding_traces", columns: ["user_id", "type"] },
  { sql: `CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON coding_traces(timestamp DESC)`, table: "coding_traces", columns: ["timestamp"] },
  { sql: `CREATE UNIQUE INDEX IF NOT EXISTS uq_traces_user_hash ON coding_traces(user_id, trace_hash)`, table: "coding_traces", columns: ["user_id", "trace_hash"] },
  { sql: `CREATE INDEX IF NOT EXISTS idx_traces_shared_signature ON coding_traces(shared_signature)`, table: "coding_traces", columns: ["shared_signature"] },
  { sql: `CREATE INDEX IF NOT EXISTS idx_patterns_user ON cognitive_patterns(user_id)`, table: "cognitive_patterns", columns: ["user_id"] },
  { sql: `CREATE INDEX IF NOT EXISTS idx_patterns_org ON cognitive_patterns(org_id, scope, updated_at DESC)`, table: "cognitive_patterns", columns: ["org_id", "scope", "updated_at"] },
  { sql: `CREATE INDEX IF NOT EXISTS idx_patterns_domain ON cognitive_patterns(domain)`, table: "cognitive_patterns", columns: ["domain"] },
  { sql: `CREATE INDEX IF NOT EXISTS idx_patterns_status ON cognitive_patterns(status)`, table: "cognitive_patterns", columns: ["status"] },
  { sql: `CREATE UNIQUE INDEX IF NOT EXISTS uq_patterns_key ON cognitive_patterns(pattern_key)`, table: "cognitive_patterns", columns: ["pattern_key"] },
  {
    sql: `CREATE INDEX IF NOT EXISTS idx_cognitive_org_memberships_org ON cognitive_org_memberships(org_id, role, updated_at DESC)`,
    table: "cognitive_org_memberships",
    columns: ["org_id", "role", "updated_at"],
  },
  { sql: `CREATE INDEX IF NOT EXISTS idx_trace_pattern_matches_trace ON trace_pattern_matches(trace_id)`, table: "trace_pattern_matches", columns: ["trace_id"] },
  { sql: `CREATE INDEX IF NOT EXISTS idx_trace_pattern_matches_pattern ON trace_pattern_matches(pattern_id)`, table: "trace_pattern_matches", columns: ["pattern_id"] },
  { sql: `CREATE UNIQUE INDEX IF NOT EXISTS uq_trace_pattern_matches ON trace_pattern_matches(trace_id, pattern_id)`, table: "trace_pattern_matches", columns: ["trace_id", "pattern_id"] },
  { sql: `CREATE INDEX IF NOT EXISTS idx_skills_user_scope ON synthesized_skills(user_id, scope)`, table: "synthesized_skills", columns: ["user_id", "scope"] },
  { sql: `CREATE UNIQUE INDEX IF NOT EXISTS uq_skills_pattern_key ON synthesized_skills(pattern_key)`, table: "synthesized_skills", columns: ["pattern_key"] },
  {
    sql: `CREATE INDEX IF NOT EXISTS idx_cognitive_applications_user ON cognitive_applications(user_id, created_at DESC)`,
    table: "cognitive_applications",
    columns: ["user_id", "created_at"],
  },
  {
    sql: `CREATE INDEX IF NOT EXISTS idx_cognitive_applications_session ON cognitive_applications(session_id, created_at DESC)`,
    table: "cognitive_applications",
    columns: ["session_id", "created_at"],
  },
  {
    sql: `CREATE INDEX IF NOT EXISTS idx_cognitive_applications_baseline ON cognitive_applications(user_id, baseline_group_key, created_at DESC)`,
    table: "cognitive_applications",
    columns: ["user_id", "baseline_group_key", "created_at"],
  },
  {
    sql: `CREATE INDEX IF NOT EXISTS idx_pattern_applications_application ON pattern_applications(application_id, rank ASC)`,
    table: "pattern_applications",
    columns: ["application_id", "rank"],
  },
  {
    sql: `CREATE INDEX IF NOT EXISTS idx_pattern_applications_entity ON pattern_applications(entity_type, entity_id, updated_at DESC)`,
    table: "pattern_applications",
    columns: ["entity_type", "entity_id", "updated_at"],
  },
  {
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS uq_pattern_applications ON pattern_applications(application_id, entity_type, entity_id)`,
    table: "pattern_applications",
    columns: ["application_id", "entity_type", "entity_id"],
  },
  {
    sql: `CREATE INDEX IF NOT EXISTS idx_cognitive_benchmark_runs_user ON cognitive_benchmark_runs(user_id, created_at DESC)`,
    table: "cognitive_benchmark_runs",
    columns: ["user_id", "created_at"],
  },
];

async function ensureCoreIndexes(client, helpers) {
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_memories_user_namespace_created_at
    ON memories(user_id, namespace_id, created_at DESC)
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_memories_user_session_created_at
    ON memories(user_id, session_id, created_at)
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_memories_user_access_count_desc
    ON memories(user_id, access_count DESC)
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_memories_lifecycle
    ON memories(user_id, archived_at, strength, last_accessed_at)
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_memories_user_peer
    ON memories(user_id, peer)
  `);

  const memoryColumns = await helpers.getTableColumns("memories");
  if (["user_id", "embedding_hash"].every((column) => memoryColumns.has(column))) {
    await client.execute(`DROP INDEX IF EXISTS idx_memories_user_embedding_hash`);
    await client.execute(`
      DELETE FROM memories
      WHERE rowid IN (
        SELECT duplicate.rowid
        FROM memories duplicate
        JOIN memories canonical
          ON canonical.user_id = duplicate.user_id
         AND canonical.embedding_hash = duplicate.embedding_hash
         AND canonical.rowid < duplicate.rowid
        WHERE duplicate.embedding_hash IS NOT NULL
      )
    `);
    await client.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_memories_user_embedding_hash
      ON memories(user_id, embedding_hash)
      WHERE embedding_hash IS NOT NULL
    `);
  }
}

async function ensureCognitiveIndexes(client, helpers) {
  const tableColumns = {
    coding_traces: await helpers.getTableColumns("coding_traces"),
    cognitive_patterns: await helpers.getTableColumns("cognitive_patterns"),
    cognitive_org_memberships: await helpers.getTableColumns("cognitive_org_memberships"),
    trace_pattern_matches: await helpers.getTableColumns("trace_pattern_matches"),
    synthesized_skills: await helpers.getTableColumns("synthesized_skills"),
    cognitive_applications: await helpers.getTableColumns("cognitive_applications"),
    pattern_applications: await helpers.getTableColumns("pattern_applications"),
    cognitive_benchmark_runs: await helpers.getTableColumns("cognitive_benchmark_runs"),
  };

  for (const statement of COGNITIVE_INDEXES) {
    const available = tableColumns[statement.table];
    if (!statement.columns.every((column) => available.has(column))) {
      continue;
    }
    await client.execute(statement.sql).catch(() => {});
  }
}

async function rebuildAnalyticsTables(client, helpers) {
  const injectionColumns = await helpers.getTableColumns("injection_events");
  if (injectionColumns.size > 0 && (injectionColumns.has("query") || !injectionColumns.has("result_count"))) {
    await client.executeMultiple(`
      DROP INDEX IF EXISTS idx_injection_events_user_created_at;
      DROP INDEX IF EXISTS idx_injection_events_user_conversation_created_at;

      CREATE TABLE injection_events_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        memory_ids TEXT NOT NULL,
        result_count INTEGER NOT NULL DEFAULT 0,
        conversation_id TEXT,
        created_at TEXT NOT NULL
      );

      INSERT INTO injection_events_new (
        id, user_id, memory_ids, result_count, conversation_id, created_at
      )
      SELECT
        id,
        user_id,
        memory_ids,
        0,
        conversation_id,
        created_at
      FROM injection_events;

      DROP TABLE injection_events;
      ALTER TABLE injection_events_new RENAME TO injection_events;

      CREATE INDEX IF NOT EXISTS idx_injection_events_user_created_at
      ON injection_events(user_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_injection_events_user_conversation_created_at
      ON injection_events(user_id, conversation_id, created_at DESC);
    `);
  }

  const qualitySignalColumns = await helpers.getTableColumns("quality_signals");
  if (qualitySignalColumns.size > 0 && qualitySignalColumns.has("snippet")) {
    await client.executeMultiple(`
      DROP INDEX IF EXISTS idx_quality_signals_user_created_at;
      DROP INDEX IF EXISTS idx_quality_signals_user_conversation_created_at;
      DROP INDEX IF EXISTS idx_quality_signals_user_pattern_created_at;

      CREATE TABLE quality_signals_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        conversation_id TEXT,
        signal_type TEXT NOT NULL,
        pattern_matched TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      INSERT INTO quality_signals_new (
        id, user_id, conversation_id, signal_type, pattern_matched, created_at
      )
      SELECT
        id,
        user_id,
        conversation_id,
        signal_type,
        pattern_matched,
        created_at
      FROM quality_signals;

      DROP TABLE quality_signals;
      ALTER TABLE quality_signals_new RENAME TO quality_signals;

      CREATE INDEX IF NOT EXISTS idx_quality_signals_user_created_at
      ON quality_signals(user_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_quality_signals_user_conversation_created_at
      ON quality_signals(user_id, conversation_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_quality_signals_user_pattern_created_at
      ON quality_signals(user_id, pattern_matched, created_at DESC);
    `);
  }
}

export async function up({ client, helpers }) {
  await client.executeMultiple(tableSql);

  for (const [tableName, columns] of Object.entries(CORE_COLUMN_REPAIRS)) {
    await helpers.ensureColumns(tableName, columns);
  }

  await ensureCoreIndexes(client, helpers);
  await rebuildAnalyticsTables(client, helpers);

  await client.execute(`
    UPDATE usage_stats
    SET memories_total = MAX(
      memories_total,
      memories_this_month,
      COALESCE((SELECT COUNT(*) FROM memories WHERE user_id = usage_stats.user_id), 0)
    )
    WHERE memories_this_month > 0
       OR EXISTS (SELECT 1 FROM memories WHERE user_id = usage_stats.user_id)
  `).catch(() => {});

  const codingTraceColumns = await helpers.getTableColumns("coding_traces");
  if (codingTraceColumns.has("shared_signature")) {
    await client.execute(`UPDATE coding_traces SET shared_signature = NULL WHERE shared_signature IS NOT NULL`).catch(() => {});
  }

  const patternColumns = await helpers.getTableColumns("cognitive_patterns");
  if (patternColumns.has("shared_signature") && patternColumns.has("scope")) {
    await client.execute(`UPDATE cognitive_patterns SET shared_signature = NULL WHERE scope = 'global'`).catch(() => {});
  }

  await ensureCognitiveIndexes(client, helpers);
}
