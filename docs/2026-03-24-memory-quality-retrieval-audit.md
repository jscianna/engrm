# FatHippo Audit — Memory Quality + Retrieval Reliability + ACP/MCP Continuity

Date: 2026-03-24
Scope: OpenClaw-hosted integration paths (`/api/v1/*`, context-engine hosted client usage, MCP server delegation)

## A) Full write-path map

### Direct memory creation/update/write paths

1. **`POST /api/v1/simple/remember`** → `storeAutoMemory()` → `insertAgentMemory()` or `updateAgentMemory()`.
2. **`POST /api/v1/sessions/:id/turn`** → `captureTurnMemories()` → `storeAutoMemory()` → `insertAgentMemory()` / `updateAgentMemory()`.
3. **`POST /api/v1/memories`** → `insertAgentMemory()` (plaintext) or encrypted passthrough to `insertAgentMemory()`.
4. **`POST /api/v1/sync/batch`**:
   - create → `insertAgentMemory()`
   - update → `updateAgentMemory()`
   - delete → `deleteAgentMemoryById()`.
5. **`POST /api/v1/ingest`** (PDF) → `insertAgentMemory()`.
6. **`POST /api/v1/ingest/documents`** → `ingestDocument()` → `createMemory()` → `insertMemory()`.
7. **`POST /api/v1/indexed`**:
   - indexed table upsert in `indexed_memories`
   - **shadow insert into `memories` via raw SQL** (`INSERT INTO memories ... ON CONFLICT DO NOTHING`).
8. **`POST /api/v1/reflect`** → `insertMemoryWithMetadata()` (`memoryType=reflected`) + archives previous reflected set.
9. **`POST /api/v1/compact`** → `insertMemoryWithMetadata()` (`memoryType=compacted`) + archives source memories.
10. **`POST /api/v1/sessions/:id/summarize`** → `insertMemoryWithMetadata()` (`memoryType=session_summary`) + archive/delete originals.
11. **`src/lib/memory-reinforcement.ts`** `storeOrReinforce()` → `insertMemoryWithMetadata()` or `reinforceMemory()`.
12. **`src/lib/ingestion/index.ts`** internal ingestion path → `createMemory()`.
13. **Legacy/UI route `POST /api/memories`** → `createMemory()`.

### MCP-driven / delegated write entrypoints

14. **MCP `remember` tool** (`packages/mcp-server/src/index.ts`) calls hosted runtime `runtimeClient.remember(...)`, which routes into hosted API remember path.
15. **MCP `record_turn` tool** calls hosted runtime `runtimeClient.recordTurn(...)`, which routes into hosted `/sessions/:id/turn` path.
16. **Context-engine hosted `afterTurn()`** calls `runtimeClient.recordTurn(...)` (same backend path as #2).
17. **Context-engine hosted `ingest()`** and `ingestBatch()` call hosted client memory store APIs (not local db.ts), still within hosted API policy domain.

## B) Per-path controls matrix

Legend:
- Quality gate = policy/heuristic deny path before write
- Dedupe/cooldown = semantic dedupe, merge, skip, or temporal suppression
- Secret filtering = explicit skip or secure-channel redirect, not just “mark sensitive”
- reason_code returned = machine-readable deny reason exposed to caller

| Path | Quality gate | Dedupe/cooldown | Secret filtering | reason_code returned | Bypass risk |
|---|---|---|---|---|---|
| simple.remember (`storeAutoMemory`) | **Y** (candidate scoring + classification) | **Y** (semantic merge/update at threshold 0.9) | **Y** (`detectSecretCategories` skip) | **N** (returns warning/matched categories, not normalized `reason_code`) | **Medium** (good gate here, but DB backstop absent elsewhere) |
| sessions.turn capture path | **Y** (`extractTurnMemoryCandidates` + `shouldKeepCandidate`) | **Y** (delegates to `storeAutoMemory`) | **Y** (via `storeAutoMemory`) | **N** | **Medium** |
| v1.memories create | **N** (no durable-quality gate beyond validation) | **Partial** (optional consolidation suggestion; bypassable with `?force=true`) | **N** skip; only `sensitive` labeling | **N** | **High** |
| sync.batch create/update | **N** | **N** | **N** | **N** | **High** |
| ingest (PDF) | **N** | **N** | **N** (stores full extracted text) | **N** | **High** |
| ingest/documents | **N** | **N** | **N** | **N** | **High** |
| indexed shadow write to memories | **N** | **N** (idempotent only by deterministic ID) | **N** | **N** | **High** |
| reflect output writes | **N** (depends on LLM prompt quality) | **N** | **N** | **N** | **Medium** |
| compact output writes | **N** (depends on LLM prompt quality) | **Y** grouping/archival | **N** | **N** | **Medium** |
| session summarize writes | **N** (LLM structured output only) | **N** | **N** | **N** | **Medium** |
| insertMemoryWithMetadata / insertAgentMemory / insertMemory (DB functions) | **N** global policy backstop | **N** | **N** skip; only sensitive bit/hash/encrypt | **N** | **High** |
| MCP remember / record_turn (delegated) | **Depends on downstream endpoint** | **Depends** | **Depends** | **N** | **Medium/High** depending on called endpoint |

### Key control gap

The codebase has **route-level gating** (mainly `simple.remember` + turn-capture path), but **no DB-layer mandatory quality policy enforcement** in `insertAgentMemory()`, `insertMemoryWithMetadata()`, or `insertMemory()`.

This exactly permits alternate routes (`/v1/memories`, `/v1/sync/batch`, `/v1/ingest`, `/v1/indexed` shadow insert, compaction/reflection writers) to persist low-quality payloads.

## C) Embedding config path audit

### Config/key sources and precedence

`src/lib/embeddings.ts` resolves provider as:
1. `EMBEDDING_PROVIDER` (if valid)
2. else implicit provider by first available key in order:
   - `VOYAGE_API_KEY`
   - `OPENAI_API_KEY`
   - `OPENROUTER_API_KEY`
   - `COHERE_API_KEY`
   - fallback provider name `openai` (even if no key)

Model/dimension precedence:
- Global override first: `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION`
- Provider-specific second:
  - Voyage: `VOYAGE_EMBEDDING_MODEL`, `VOYAGE_EMBEDDING_DIMENSION`
  - OpenAI: `OPENAI_EMBEDDING_MODEL`, `OPENAI_EMBEDDING_DIMENSION`
  - OpenRouter uses `OPENROUTER_EMBEDDING_MODEL` and `OPENAI_EMBEDDING_DIMENSION`
  - Cohere: `COHERE_EMBEDDING_MODEL`, `COHERE_EMBEDDING_DIMENSION`

### Stale-key / stale-config risk

1. **`activeEmbeddingConfig` is process-cached singleton** and never invalidated.
   - Env var change at runtime is ignored until process restart.
2. API keys are read per call from `process.env`, but provider/model/dimension may stay pinned from stale cached config.
3. On provider error (including 401), embedding call returns `null`; then caller receives **zero vector fallback**.
   - This can silently degrade retrieval quality and mask key misconfiguration.
4. Caches (`embedding-cache`, Upstash cache) namespace by provider/model/dimension/purpose, which is good, but stale `activeEmbeddingConfig` means namespace can remain stale too.

### Restart/reload guarantees

- No explicit hot-reload/reset API for embedding config.
- Correctness currently depends on process recycle (new serverless/container instance).
- In multi-instance deployments, mixed config can persist during rolling updates.

## D) ACP/MCP continuity audit

### How delegated sessions receive context

- MCP server merges runtime metadata (`agent`, `platform`, `namespace`, `conversationId`) via `mergeRuntime()`.
- `start_session`, `build_context`, `record_turn`, `remember`, `recall` all pass this runtime metadata to hosted runtime client.
- Context-engine hosted mode tracks mapping `hostedSessions: Map<localSessionId, hostedSessionId>` and uses hosted runtime calls for session lifecycle.

### Where delegated writes land

- MCP `remember` and `record_turn` are delegated to hosted runtime endpoints (same backend as OpenClaw hosted API).
- Context-engine `afterTurn()` also delegates to same hosted record-turn flow.

### Do delegated writes obey same write rules?

- **Only if they pass through `simple.remember` / turn-capture policy paths downstream.**
- Because DB functions lack mandatory backstop, any delegated path that reaches ungated creation endpoints can still bypass quality policy.
- Subagent continuity in context-engine is currently shallow: `prepareSubagentSpawn()` says “inherit parent scope” but has no explicit child policy override or isolated guardrails; `onSubagentEnded()` only ends hosted session.

## G) Consolidation/synthesis reliability audit (critical)

## 1) End-to-end lifecycle (expected)

1. Raw memory write (turn capture, explicit remember, ingestion, sync, indexed shadow).
2. Retrieval paths (`simple.context`, `search`, sessions start) consume raw memories + critical syntheses.
3. Consolidation/synthesis paths (manual/triggered):
   - `reflect` creates `reflected` memories, archives prior reflected.
   - `compact` creates `compacted` memory, archives grouped sources.
   - `sessions/:id/summarize` creates `session_summary`, archives/deletes source session memories.
   - Dream Cycle (`runDreamCycle`) clusters memories, synthesizes clusters, marks stale syntheses, validates syntheses, creates `derives_from` graph edges, handles critical/ephemeral/completed pipelines.
4. Recall/injection includes synthesized critical memories via:
   - `listCriticalSynthesizedMemories()` in `sessions/start` and `simple/context`.
5. Source mutation should mark syntheses stale and refresh on next Dream Cycle or explicit `/syntheses/refresh/:id`.

## 2) Trigger/queue/schedule table

| Trigger | Source | Condition | Schedule | Queue/job/lease | Persistence target |
|---|---|---|---|---|---|
| Turn capture | `/v1/sessions/:id/turn` | messages present, candidate extraction passes | per turn | inline request | `memories` via `insertAgentMemory`/`updateAgentMemory` |
| Explicit remember | `/v1/simple/remember` | non-empty text, not secret | per request | inline | `memories` |
| Sync batch create/update | `/v1/sync/batch` | operation array | per request | inline | `memories` |
| Indexed ingestion | `/v1/indexed` | valid index/summary/content | per request | inline | `indexed_memories` + shadow `memories` row |
| Reflect | `/v1/reflect` | recent memories exist | manual/API | inline | new `reflected` memories + archive old reflected |
| Compact | `/v1/compact` | similar groups found | manual/API | inline | new `compacted` memory + archive grouped sources |
| Session summarize | `/v1/sessions/:id/summarize` | session memories exist | manual/API | inline | new `session_summary` + archive/delete source session memories |
| Dream cycle | `/api/dream-cycle/consolidate` | authenticated user invokes | **manual/UI/API** | inline | syntheses + graph edges + stale marks + critical absorption |
| Synthesis refresh | `/v1/syntheses/refresh/:id` | synthesis exists + ≥3 live sources | manual/API | inline | upsert synthesized memory |
| Cognitive skill synthesis (separate from memory syntheses) | `/v1/cognitive/skills/synthesize` | lease acquired | manual/API | DB lease (`tryAcquireJobLease`) | `synthesized_skills` |

### Production-run reality check

- `vercel.json` has cron only for `/api/health` and operational-alert dispatch.
- There is **no scheduled Dream Cycle/reflect/compact/session summarize cron** in this repo.
- Therefore memory synthesis/consolidation jobs are defined and callable, but not proven to run automatically in production from repo config alone.

### Failure handling / retries / dead-letter

- Memory consolidation routes are mostly synchronous request handlers; failures return errors or skip with warnings.
- `sync-queue.ts` contains retry/dead-letter semantics, but write endpoints shown here do not universally route through that queue.
- Dream Cycle catches many synthesis failures and appends warnings (prevents total failure), but this can still hide partial drops if warnings are not monitored.

### Staleness refresh guarantees

- Dream Cycle marks syntheses stale when source set changes.
- Refresh occurs when Dream Cycle runs again or explicit refresh endpoint is called.
- Because Dream Cycle is not scheduled in `vercel.json`, stale syntheses may persist indefinitely without manual/agent-triggered execution.

### Indexed/sync/import feeding consolidation consistency

- Indexed path writes shadow memories with minimal metadata and no quality gate.
- Sync/import/ingest paths bypass `storeAutoMemory` heuristics.
- Consolidation inputs (`listAgentMemories`, clustering candidates) can therefore include low-quality artifacts unless separately filtered.

## 3) Ten real failure modes + detection

1. **Ungated writes via `/v1/memories` persist low-quality logs/snippets.**
   - Detect: spike in memories matching terminal/code patterns; quality signal dashboards.
2. **`/v1/sync/batch` creates noisy records during reconnect bursts.**
   - Detect: high create count per batch with low retrieval click-through.
3. **`/v1/indexed` shadow inserts pollute core `memories`.**
   - Detect: growth in `source_type='indexed'` with low access and repetitive hash.
4. **Embedding provider 401 causes silent zero-vector fallback.**
   - Detect: logs `[Embeddings] ... error: 401`, plus sudden retrieval confidence drop and identical vector norms.
5. **`activeEmbeddingConfig` stale after env key/provider change.**
   - Detect: config endpoint/log still reports old provider/model after deploy config patch.
6. **No DB-level quality backstop lets alternate routes bypass policy.**
   - Detect: route-by-route acceptance audit where same bad payload is denied by simple.remember but accepted by memories/sync/indexed.
7. **Dream Cycle not scheduled leads to stale syntheses accumulation.**
   - Detect: increasing `stale=1` syntheses and old `synthesized_at` ages without refresh.
8. **LLM consolidation routes write low-value syntheses/reflections.**
   - Detect: low `synthesis_quality_score`, low access counts, high archive churn.
9. **Delegated subagent writes lack explicit isolation/guardrails.**
   - Detect: child-session writes without parent linkage metadata consistency.
10. **Secret-containing ingestion path stores sensitive text as normal memory.**
   - Detect: rising `sensitive=1` rows from ingest/sync/indexed sources.

## E) Test plan

### Unit tests

1. `evaluateMemoryCandidate` denylist cases (transport metadata, media envelope text, command logs, code snippets, policy fragments).
2. `storeAutoMemory`:
   - secret detection skip
   - merge/update behavior at threshold
   - structured metadata enrichment
3. DB backstop policy function (new): `enforceMemoryWritePolicy()` with reason codes.
4. Embedding config resolver:
   - provider precedence
   - invalid provider fallback
   - cache namespace correctness
   - config reset semantics.

### Integration tests (endpoint-level)

1. `/v1/simple/remember` accepts durable content, rejects denylist text with reason code.
2. `/v1/sessions/:id/turn` rejects noisy tool/metadata payloads from memory persistence.
3. `/v1/memories` rejects same denylist payload (after backstop patch).
4. `/v1/sync/batch` rejects create/update payloads that fail quality policy.
5. `/v1/indexed` shadow memory path applies backstop/labels and does not bypass.
6. `/v1/ingest` + `/v1/ingest/documents` enforce filtering on extracted chunks.
7. `/v1/reflect`, `/v1/compact`, `/v1/sessions/:id/summarize` enforce synthesized-output quality checks.

### Regression tests (401 invalid key + reload)

1. Stub embedding provider 401 invalid_api_key; assert error propagation (not silent success).
2. Assert `memory_search` reports degraded mode explicitly when embeddings unavailable.
3. Change env key/provider at runtime; assert config reload API or process restart requirement is explicit and testable.
4. Ensure no stale provider/model in `getEmbeddingConfig()` after reload operation.

### Smoke script after restart

- Step 1: print embedding config (`provider/model/dimension`) and key fingerprint hash prefix (never raw key).
- Step 2: run test embed call; assert non-zero norm vector.
- Step 3: run `POST /api/v1/search` on known fixture query; assert non-empty results and retrievalConfidence header/metric.
- Step 4: run same query twice; confirm cache hit behavior without key errors.

## F) Patch plan — top 10 fixes ranked by impact/effort

## Quick wins (<1 day)

1. **DB-layer mandatory write backstop** in `insertAgentMemory`, `insertMemoryWithMetadata`, `insertMemory`, indexed shadow insert helper.  
   Impact: Very high / Effort: Medium.
2. **Return normalized `reason_code`** on all rejected writes.  
   Impact: High / Effort: Low.
3. **Block silent zero-vector fallback for 401/403**: return typed error + metric; allow optional fallback only with explicit flag.  
   Impact: High / Effort: Low.
4. **Add `resetEmbeddingConfig()` / lazy TTL for `activeEmbeddingConfig`.**  
   Impact: High / Effort: Low.
5. **Add write-source metadata (`write_path`, `runtime`, `delegated_session_id`).**  
   Impact: Medium / Effort: Low.
6. **Apply same gating to `/v1/sync/batch` and `/v1/memories` create/update paths.**  
   Impact: High / Effort: Low.

## Larger changes

7. **Unify all writes through a single `persistMemoryWithPolicy()` service** to eliminate route drift.  
   Impact: Very high / Effort: Medium.
8. **Schedule Dream Cycle in production cron** (or queue worker) with per-user lease + retry/backoff.  
   Impact: High / Effort: Medium.
9. **Add synthesis freshness SLA monitor** (`stale synth count`, oldest stale age).  
   Impact: High / Effort: Medium.
10. **OAuth-only operational mode enforcement in connect flow**: enforce `mode` semantics and scope profiles for coding-agent runs.  
   Impact: Medium/High / Effort: Medium.

## Rollout sequence + risk mitigation

1. Ship observability first (reason codes, write-source tags, embedding errors).
2. Ship DB backstop in monitor mode (log-only), then enforce mode.
3. Migrate route handlers to shared policy service.
4. Enable 401 hard-fail policy + config reset endpoint.
5. Introduce scheduled Dream Cycle with canary cohort.
6. Turn on synthesis freshness alerts + auto-refresh guardrails.

## 4) Consolidated fix ranking (impact/effort)

1. DB write backstop (VH/M)
2. Shared write service (VH/M)
3. Sync + memories route policy parity (H/L)
4. 401 explicit failure (H/L)
5. Embedding config reset/reload (H/L)
6. Dream Cycle scheduler + lease (H/M)
7. Synthesis freshness monitor + alerts (H/M)
8. Indexed shadow-write policy enforcement (H/L)
9. Reason code standardization (M/L)
10. Delegated-session metadata lineage + ACP mode enforcement (M/M)

## 5) Production verification checklist (commands + expected)

> Use these against production safely with read-only/test tenant credentials.

1. `POST /api/v1/simple/remember` with denylist payload (command log text).  
   Expected: `stored=false`, `reason_code=<denylist/code/metadata>`.
2. `POST /api/v1/memories` same payload.  
   Expected: same denial semantics as simple.remember.
3. `POST /api/v1/sync/batch` create op with denylist payload.  
   Expected: per-op failure with reason code.
4. `POST /api/v1/indexed` with noisy summary.  
   Expected: indexed row may store; shadow memory write denied or marked non-indexable by policy.
5. `POST /api/v1/search` after key rotation with invalid old key.  
   Expected: explicit embedding-provider auth error metric/event; no silent all-zero success.
6. Restart deployment / rotate instance.  
   Expected: `getEmbeddingConfig()` reflects new provider/model without stale value.
7. Trigger Dream Cycle endpoint for test user.  
   Expected: result includes synthesis counts and no unhandled errors.
8. Query stale syntheses after source memory edits.  
   Expected: stale marked promptly; refreshed after scheduled/manual run.
9. MCP `remember` and direct API remember with same payload.  
   Expected: identical policy decision + reason codes.
10. ACP delegated child session end + parent recall.  
   Expected: memory lineage present, no orphan writes outside namespace/session policy.

---

## Bottom line

- **Goal 1 (no bypass): currently not met** due to multiple ungated write routes and no DB-layer enforcement.
- **Goal 2 (embedding consistency/no stale invalid keys): partially met** (provider-aware namespaces) but undermined by process-cached config and silent zero-vector fallback on auth failures.
- **Goal 3 (delegated ACP/MCP continuity + same write rules): partially met** for context continuity metadata, but policy parity is not guaranteed without DB backstop + shared write service.
