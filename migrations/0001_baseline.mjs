export const version = "0001";
export const name = "baseline";
export const kind = "sql";
export const baseline = true;

// Immutable checksum expected in production _schema_migrations.
// Do not change after rollout; add new migrations instead.
export const lockedChecksum = "f59e9dedf18d4a4dd8bbeb30ef5d13163a21c2ecc7d8747e7952d851a9ae23bc";

// Frozen SQL snapshot from commit 20d69ed8 to keep baseline deterministic.
export const sql = `
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL,
    memory_type TEXT NOT NULL DEFAULT 'episodic',
    importance INTEGER NOT NULL DEFAULT 5,
    tags_csv TEXT NOT NULL DEFAULT '',
    source_url TEXT,
    file_name TEXT,
    content_text TEXT NOT NULL,
    content_iv TEXT,
    content_encrypted INTEGER NOT NULL DEFAULT 0,
    content_hash TEXT NOT NULL,
    content_mac TEXT,
    sensitive INTEGER NOT NULL DEFAULT 0,
    sync_status TEXT NOT NULL DEFAULT 'pending',
    sync_error TEXT,
    namespace_id TEXT,
    session_id TEXT,
    metadata_json TEXT,
    strength REAL DEFAULT 1.0,
    base_strength REAL DEFAULT 1.0,
    mention_count INTEGER DEFAULT 1,
    access_count INTEGER DEFAULT 0,
    feedback_score INTEGER DEFAULT 0,
    halflife_days INTEGER DEFAULT 60,
    last_accessed_at TEXT,
    last_mentioned_at TEXT,
    first_mentioned_at TEXT,
    archived_at TEXT,
    is_identity INTEGER DEFAULT 0,
    source_conversations TEXT,
    entities TEXT,
    entities_json TEXT,
    embedding TEXT,
    embedding_hash TEXT,
    tags_json TEXT,
    importance_tier TEXT DEFAULT 'normal',
    durability_class TEXT DEFAULT 'working',
    promotion_locked INTEGER DEFAULT 0,
    locked_tier TEXT,
    decay_immune INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    completed_at TEXT,
    ephemeral INTEGER DEFAULT 0,
    absorbed INTEGER DEFAULT 0,
    absorbed_into_synthesis_id TEXT,
    absorbed_by TEXT,
    absorbed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_entitlements (
    user_id TEXT PRIMARY KEY,
    plan TEXT NOT NULL DEFAULT 'free',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    key_suffix TEXT,
    scopes_json TEXT NOT NULL DEFAULT '["*"]',
    agent_id TEXT NOT NULL,
    agent_name TEXT,
    created_at TEXT NOT NULL,
    last_used TEXT,
    last_plugin_id TEXT,
    last_plugin_version TEXT,
    last_plugin_mode TEXT,
    last_plugin_seen_at TEXT,
    revoked_at TEXT,
    expires_at TEXT
  );

  CREATE TABLE IF NOT EXISTS namespaces (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, name)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    namespace_id TEXT,
    metadata_json TEXT,
    turn_count INTEGER DEFAULT 0,
    outcome TEXT,
    feedback TEXT,
    ended_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vault_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    value_encrypted TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS memory_edges (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE,
    UNIQUE(source_id, target_id, relationship_type)
  );

  CREATE TABLE IF NOT EXISTS synthesized_memories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    synthesis TEXT NOT NULL,
    title TEXT NOT NULL,
    source_memory_ids TEXT NOT NULL,
    source_count INTEGER NOT NULL,
    cluster_id TEXT NOT NULL,
    cluster_topic TEXT NOT NULL,
    compression_ratio REAL,
    confidence REAL,
    synthesized_at TEXT NOT NULL,
    last_validated_at TEXT NOT NULL,
    stale INTEGER DEFAULT 0,
    importance_tier TEXT DEFAULT 'normal',
    access_count INTEGER DEFAULT 0,
    abstraction_level INTEGER DEFAULT 1,
    synthesis_quality_score REAL,
    synthesis_metadata TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS graph_edges (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    edge_type TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    bidirectional INTEGER DEFAULT 0,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    UNIQUE(source_id, target_id, edge_type)
  );

  CREATE TABLE IF NOT EXISTS memory_misses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    query TEXT NOT NULL,
    context TEXT,
    session_id TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS retrieval_evaluations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    query TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    namespace_id TEXT,
    session_id TEXT,
    candidate_ids_json TEXT NOT NULL,
    accepted_id TEXT,
    accepted_rank INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS session_turns (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    messages_json TEXT NOT NULL,
    memories_used TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS api_usage (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    api_key_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS usage_stats (
    user_id TEXT PRIMARY KEY,
    memories_this_month INTEGER DEFAULT 0,
    memories_total INTEGER DEFAULT 0,
    storage_bytes INTEGER DEFAULT 0,
    api_calls_today INTEGER DEFAULT 0,
    api_calls_this_month INTEGER DEFAULT 0,
    last_reset_day TEXT,
    last_reset_month TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_salts (
    user_id TEXT PRIMARY KEY,
    salt TEXT NOT NULL,
    hmac_secret TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_constraints (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    rule TEXT NOT NULL,
    triggers_json TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning',
    scope TEXT NOT NULL DEFAULT 'user',
    template_id TEXT,
    source TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS request_throttles (
    scope TEXT NOT NULL,
    actor_key TEXT NOT NULL,
    bucket_start TEXT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    PRIMARY KEY (scope, actor_key, bucket_start)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    metadata_json TEXT,
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS memory_vectors (
    memory_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    importance INTEGER NOT NULL,
    vector_json TEXT NOT NULL,
    vector_dimension INTEGER NOT NULL DEFAULT 384,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chatbots (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    system_prompt TEXT,
    model TEXT DEFAULT 'gpt-4o-mini',
    temperature REAL DEFAULT 0.7,
    public_token TEXT UNIQUE,
    welcome_message TEXT,
    theme_json TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    chatbot_id TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT,
    content TEXT,
    chunk_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    created_at INTEGER,
    FOREIGN KEY (chatbot_id) REFERENCES chatbots(id)
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    chatbot_id TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding TEXT,
    chunk_index INTEGER,
    metadata TEXT,
    created_at INTEGER,
    FOREIGN KEY (source_id) REFERENCES sources(id),
    FOREIGN KEY (chatbot_id) REFERENCES chatbots(id)
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    chatbot_id TEXT NOT NULL,
    session_id TEXT,
    title TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY (chatbot_id) REFERENCES chatbots(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    sources_used TEXT,
    created_at INTEGER,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );

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

  CREATE TABLE IF NOT EXISTS injection_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    memory_ids TEXT NOT NULL,
    result_count INTEGER NOT NULL DEFAULT 0,
    conversation_id TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quality_signals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    conversation_id TEXT,
    signal_type TEXT NOT NULL,
    pattern_matched TEXT NOT NULL,
    created_at TEXT NOT NULL
  );


  CREATE INDEX IF NOT EXISTS idx_memories_user_created_at
  ON memories(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_memories_user_namespace_created_at
  ON memories(user_id, namespace_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_memories_user_session_created_at
  ON memories(user_id, session_id, created_at);

  CREATE INDEX IF NOT EXISTS idx_memories_user_access_count_desc
  ON memories(user_id, access_count DESC);

  CREATE INDEX IF NOT EXISTS idx_memories_lifecycle
  ON memories(user_id, archived_at, strength, last_accessed_at);

  CREATE UNIQUE INDEX IF NOT EXISTS uq_memories_user_embedding_hash
  ON memories(user_id, embedding_hash)
  WHERE embedding_hash IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_api_keys_user_created_at
  ON api_keys(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_namespaces_user_created_at
  ON namespaces(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_sessions_user_created_at
  ON sessions(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_vault_user
  ON vault_entries(user_id);

  CREATE INDEX IF NOT EXISTS idx_vault_user_category
  ON vault_entries(user_id, category);

  CREATE INDEX IF NOT EXISTS idx_edges_user
  ON memory_edges(user_id);

  CREATE INDEX IF NOT EXISTS idx_edges_source
  ON memory_edges(source_id);

  CREATE INDEX IF NOT EXISTS idx_edges_target
  ON memory_edges(target_id);

  CREATE INDEX IF NOT EXISTS idx_synth_user
  ON synthesized_memories(user_id);

  CREATE INDEX IF NOT EXISTS idx_synth_cluster
  ON synthesized_memories(cluster_id);

  CREATE INDEX IF NOT EXISTS idx_synth_importance
  ON synthesized_memories(user_id, importance_tier);

  CREATE INDEX IF NOT EXISTS idx_graph_edges_user
  ON graph_edges(user_id);

  CREATE INDEX IF NOT EXISTS idx_graph_edges_source
  ON graph_edges(source_id, source_type);

  CREATE INDEX IF NOT EXISTS idx_graph_edges_target
  ON graph_edges(target_id, target_type);

  CREATE INDEX IF NOT EXISTS idx_graph_edges_type
  ON graph_edges(user_id, edge_type);

  CREATE INDEX IF NOT EXISTS idx_memory_misses_user_created_at
  ON memory_misses(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_retrieval_evaluations_user_created_at
  ON retrieval_evaluations(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_retrieval_evaluations_user_endpoint_created_at
  ON retrieval_evaluations(user_id, endpoint, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_session_turns_session_turn
  ON session_turns(session_id, turn_number);

  CREATE INDEX IF NOT EXISTS idx_usage_user_time
  ON api_usage(user_id, timestamp DESC);

  CREATE INDEX IF NOT EXISTS idx_usage_key_time
  ON api_usage(api_key_id, timestamp DESC);

  CREATE INDEX IF NOT EXISTS idx_constraints_user
  ON user_constraints(user_id);

  CREATE INDEX IF NOT EXISTS idx_constraints_active
  ON user_constraints(user_id, active);

  CREATE INDEX IF NOT EXISTS idx_request_throttles_expires_at
  ON request_throttles(expires_at);

  CREATE INDEX IF NOT EXISTS idx_audit_user_time
  ON audit_logs(user_id, timestamp DESC);

  CREATE INDEX IF NOT EXISTS idx_audit_action_time
  ON audit_logs(action, timestamp DESC);

  CREATE INDEX IF NOT EXISTS idx_audit_timestamp
  ON audit_logs(timestamp DESC);

  CREATE INDEX IF NOT EXISTS idx_vectors_user_id
  ON memory_vectors(user_id);

  CREATE INDEX IF NOT EXISTS idx_chatbots_user_created_at
  ON chatbots(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_sources_chatbot_created_at
  ON sources(chatbot_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_chunks_chatbot
  ON chunks(chatbot_id);

  CREATE INDEX IF NOT EXISTS idx_chunks_source_order
  ON chunks(source_id, chunk_index);

  CREATE INDEX IF NOT EXISTS idx_conversations_chatbot_updated_at
  ON conversations(chatbot_id, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
  ON messages(conversation_id, created_at ASC);

  CREATE INDEX IF NOT EXISTS idx_traces_user
  ON coding_traces(user_id);

  CREATE INDEX IF NOT EXISTS idx_traces_user_type
  ON coding_traces(user_id, type);

  CREATE INDEX IF NOT EXISTS idx_traces_timestamp
  ON coding_traces(timestamp DESC);

  CREATE UNIQUE INDEX IF NOT EXISTS uq_traces_user_hash
  ON coding_traces(user_id, trace_hash);

  CREATE INDEX IF NOT EXISTS idx_traces_shared_signature
  ON coding_traces(shared_signature);

  CREATE INDEX IF NOT EXISTS idx_patterns_user
  ON cognitive_patterns(user_id);

  CREATE INDEX IF NOT EXISTS idx_patterns_org
  ON cognitive_patterns(org_id, scope, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_patterns_domain
  ON cognitive_patterns(domain);

  CREATE INDEX IF NOT EXISTS idx_patterns_status
  ON cognitive_patterns(status);

  CREATE UNIQUE INDEX IF NOT EXISTS uq_patterns_key
  ON cognitive_patterns(pattern_key);

  CREATE INDEX IF NOT EXISTS idx_cognitive_org_memberships_org
  ON cognitive_org_memberships(org_id, role, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_trace_pattern_matches_trace
  ON trace_pattern_matches(trace_id);

  CREATE INDEX IF NOT EXISTS idx_trace_pattern_matches_pattern
  ON trace_pattern_matches(pattern_id);

  CREATE UNIQUE INDEX IF NOT EXISTS uq_trace_pattern_matches
  ON trace_pattern_matches(trace_id, pattern_id);

  CREATE INDEX IF NOT EXISTS idx_skills_user_scope
  ON synthesized_skills(user_id, scope);

  CREATE UNIQUE INDEX IF NOT EXISTS uq_skills_pattern_key
  ON synthesized_skills(pattern_key);

  CREATE INDEX IF NOT EXISTS idx_cognitive_applications_user
  ON cognitive_applications(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_cognitive_applications_session
  ON cognitive_applications(session_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_cognitive_applications_baseline
  ON cognitive_applications(user_id, baseline_group_key, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_pattern_applications_application
  ON pattern_applications(application_id, rank ASC);

  CREATE INDEX IF NOT EXISTS idx_pattern_applications_entity
  ON pattern_applications(entity_type, entity_id, updated_at DESC);

  CREATE UNIQUE INDEX IF NOT EXISTS uq_pattern_applications
  ON pattern_applications(application_id, entity_type, entity_id);

  CREATE INDEX IF NOT EXISTS idx_cognitive_benchmark_runs_user
  ON cognitive_benchmark_runs(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_injection_events_user_created_at
  ON injection_events(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_injection_events_user_conversation_created_at
  ON injection_events(user_id, conversation_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_quality_signals_user_created_at
  ON quality_signals(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_quality_signals_user_conversation_created_at
  ON quality_signals(user_id, conversation_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_quality_signals_user_pattern_created_at
  ON quality_signals(user_id, pattern_matched, created_at DESC);
`;
