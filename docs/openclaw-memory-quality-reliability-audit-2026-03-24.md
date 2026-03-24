# FatHippo OpenClaw Integration Audit (Memory Quality + Retrieval Reliability)

**Date:** 2026-03-24  
**Scope:** write-path policy coverage, embedding config/key lifecycle, ACP/MCP continuity, consolidation/synthesis reliability  
**Audited areas:** `src/app/api/v1/*`, `src/lib/*`, `packages/context-engine/*`, `packages/mcp-server/*`, `packages/hosted/*`

---

## Executive findings

1. **Write-path policy is inconsistent and bypassable.** Only `storeAutoMemory()` (used by `/v1/simple/remember` and `/v1/sessions/:id/turn`) has meaningful quality filtering + dedupe/merge behavior; many other write endpoints call `insertAgentMemory()` directly with no quality gate or cooldown semantics.
2. **DB-layer backstop for quality policy is missing.** `insertAgentMemory()` sanitizes/encrypts and flags secrets as sensitive, but does not enforce quality-deny/reason-code policy, so any route can persist low-signal junk.
3. **Embedding key/config may go stale in-process.** `resolveEmbeddingConfig()` caches once in `activeEmbeddingConfig`, and `qdrant.ts` captures embedding config at module load. Runtime key rotation/config patch requires process restart to fully apply.
4. **401 invalid key can silently degrade retrieval quality.** Embedding failures return zero vectors, allowing requests to “succeed” with poor recall instead of hard-failing or surfacing a specific embedding-auth health signal.
5. **Delegated/subagent continuity is only partial.** Subagent spawn currently returns no explicit shared context token/mapping; comment says inheritance is intended, but no guaranteed shared hosted-session mapping is established.
6. **Consolidation exists but is trigger-fragmented.** Micro-dream fires only from auto-capture path (`storeAutoMemory`) and dream-cycle is mostly manual/explicit; many write paths never trigger consolidation logic.

---

## A) Full write-path map

### A1. Canonical/primary memory write paths

| Path                                | Entry point                                 | Write function(s)                                                             | Notes                                                                   |
| ----------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Simple remember                     | `POST /api/v1/simple/remember`              | `storeAutoMemory()` -> `insertAgentMemory()` or `updateAgentMemory()`         | Has secret skip + vector similarity merge/update + micro-dream trigger. |
| Session turn capture                | `POST /api/v1/sessions/[id]/turn`           | `captureTurnMemories()` -> `storeAutoMemory()`                                | Uses same policy stack as simple remember.                              |
| Memories create (API v1)            | `POST /api/v1/memories`                     | `insertAgentMemory()`                                                         | Plain/encrypted paths; only consolidation suggestion (not policy gate). |
| Session-scoped manual memory create | `POST /api/v1/sessions/[id]/memories`       | `insertAgentMemory()`                                                         | No quality policy gate before insert.                                   |
| Sync batch create                   | `POST /api/v1/sync/batch` (`processCreate`) | `insertAgentMemory()`                                                         | Remote/device queue ingestion bypasses quality gate.                    |
| Ingest PDF                          | `POST /api/v1/ingest`                       | `insertAgentMemory()`                                                         | Extracts text/entities, no policy gate.                                 |
| Ingest documents                    | `POST /api/v1/ingest/documents`             | `ingestDocument()` -> `createMemory()` -> `insertMemory()`                    | Chunking path bypasses `insertAgentMemory` and quality policy.          |
| Indexed create                      | `POST /api/v1/indexed`                      | direct SQL insert into `indexed_memories` + direct SQL insert into `memories` | No quality gate; direct DB writes.                                      |
| Dashboard memory create             | `POST /api/memories`                        | `createMemory()` -> `insertMemory()`                                          | UI path bypasses policy stack used by simple/turn capture.              |
| Session summarize                   | `POST /api/v1/sessions/[id]/summarize`      | `insertAgentMemory()`                                                         | Creates summary memory; policy not centralized.                         |

### A2. Update/sync/import-related paths that affect persistence

| Path                            | Entry point                                 | Write function(s)                                                | Notes                                                          |
| ------------------------------- | ------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| Sync batch update               | `POST /api/v1/sync/batch` (`processUpdate`) | `updateAgentMemory()`                                            | No reason-code semantics; accepts raw updates.                 |
| Memory update (API v1)          | `PATCH /api/v1/memories/[id]`               | `updateAgentMemory()`                                            | Can overwrite text without re-running quality gate.            |
| Indexed update                  | `PATCH /api/v1/indexed/[index]`             | direct SQL update `indexed_memories`                             | Can mutate indexed content out-of-band from consolidation.     |
| Reflection/consolidation writes | dream-cycle + synthesis paths               | `upsertSynthesizedMemory()`, `markMemoriesAbsorbedBySynthesis()` | Runs only when called; not guaranteed on all memory mutations. |

### A3. MCP/OpenClaw-driven writes

| Source                         | Runtime call                    | Hosted endpoint            | Final write path                                                                                       |
| ------------------------------ | ------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| MCP `remember` tool            | `runtimeClient.remember()`      | `/v1/simple/remember`      | `storeAutoMemory()` path (quality-aware).                                                              |
| MCP `record_turn` tool         | `runtimeClient.recordTurn()`    | `/v1/sessions/:id/turn`    | `captureTurnMemories()` -> `storeAutoMemory()`.                                                        |
| OpenClaw context-engine ingest | `engine.ingest` / `ingestBatch` | via hosted runtime adapter | Usually lands on session turn + remember pathways, but explicit subagent continuity is not guaranteed. |

---

## B) Per-path policy matrix (quality, dedupe, secrets, reason_code, bypass risk)

Legend: **Y** present; **N** absent/insufficient; **Partial** present but inconsistent.

| Write path                                 |                                                                               Quality gate |                        Dedupe / cooldown |                                           Secret filtering |                                reason_code returned | Bypass risk                |
| ------------------------------------------ | -----------------------------------------------------------------------------------------: | ---------------------------------------: | ---------------------------------------------------------: | --------------------------------------------------: | -------------------------- |
| `/v1/simple/remember` -> `storeAutoMemory` | **Partial** (pattern-based candidate selection upstream, no explicit deny reason taxonomy) |   **Y** (semantic merge/update behavior) |                           **Y** (`detectSecretCategories`) | **N** (returns warning, no stable reason_code enum) | **Low-Med**                |
| `/v1/sessions/:id/turn` auto-capture       |                                                                                **Partial** |        **Y** (through `storeAutoMemory`) |                                                      **Y** |                                               **N** | **Low-Med**                |
| `/v1/memories` create                      |                                             **N** (only optional consolidation suggestion) | **Partial** (similarity suggestion only) |  **Partial** (sensitive flag in DB prep, but still stored) |                                               **N** | **High**                   |
| `/v1/sessions/:id/memories`                |                                                                                      **N** |                                    **N** |                          **Partial** (sensitive flag only) |                                               **N** | **High**                   |
| `/v1/sync/batch` create                    |                                                                                      **N** |                                    **N** |                                                **Partial** |                                               **N** | **High**                   |
| `/v1/ingest` (PDF)                         |                                                                                      **N** |                                    **N** |                                                **Partial** |                                               **N** | **High**                   |
| `/v1/ingest/documents`                     |                                                                                      **N** |                                    **N** |                                                **Partial** |                                               **N** | **High**                   |
| `/v1/indexed` create                       |                                                                                      **N** |                                    **N** | **N/Partial** (no vault-style check before indexed insert) |                                               **N** | **High**                   |
| `/api/memories` (dashboard)                |                                                                                      **N** |                                    **N** |                                                **Partial** |                                               **N** | **High**                   |
| DB primitive `insertAgentMemory`           |                                                                     **N** (no policy gate) |                                    **N** |               **Partial** (marks sensitive + encrypt prep) |                                               **N** | **Critical** (all callers) |

**Key backstop gap:** the DB insertion primitive has no enforceable “deny write” policy hook and no reason-code response contract.

---

## C) Embedding config path audit

## C1. Config/key sources

`src/lib/embeddings.ts` resolves provider/model/dimension from:

1. `EMBEDDING_PROVIDER` (explicit provider override)
2. Fallback by key presence precedence: `VOYAGE_API_KEY` -> `OPENAI_API_KEY` -> `OPENROUTER_API_KEY` -> `COHERE_API_KEY` -> default `openai`
3. Model precedence by provider (`EMBEDDING_MODEL` first, then provider-specific model env)
4. Dimension precedence (`EMBEDDING_DIMENSION` first, then provider-specific dimension env)

Provider key usage in API calls:

- Voyage: `VOYAGE_API_KEY`
- OpenAI: `OPENAI_API_KEY`
- OpenRouter: `OPENROUTER_API_KEY`
- Cohere: `COHERE_API_KEY`

## C2. Stale-cache risks

1. **In-process config memoization:** `activeEmbeddingConfig` is module-level and never invalidated.
2. **Module-load snapshot in Qdrant adapter:** `EMBEDDING_CONFIG` and collection name are computed once at import-time in `src/lib/qdrant.ts`.
3. **Key rotation hazard:** changing env vars (or secret mounts) without process restart can keep old provider/model/dimension assumptions active.
4. **Silent fallback hazard:** provider call failure returns zero vectors, masking invalid key incidents and making memory_search appear intermittently “bad” instead of explicitly unhealthy.

## C3. Restart/reload guarantees

- **Current guarantee:** practical correctness requires full process restart after embedding config/key patch.
- **No hot-reload contract exists** in code for embedding provider keys/config.
- **Recommendation:** explicit runtime config reloader + health endpoint returning active provider/model and key fingerprint hash prefix (non-secret) to confirm reload.

---

## D) ACP/MCP continuity audit

## D1. How delegated sessions receive context

- MCP server tools (`start_session`, `build_context`, `record_turn`, `remember`) call hosted runtime APIs; context is injected from `/v1/simple/context` + indexed/constraints/cognitive helpers.
- In OpenClaw context engine, hosted session mapping is stored in `hostedSessions` map and used for `buildContext` / `recordTurn`.

## D2. Where delegated writes land

- `remember` -> `/v1/simple/remember` -> `storeAutoMemory` path.
- `recordTurn` -> `/v1/sessions/:id/turn` -> `captureTurnMemories` -> `storeAutoMemory`.

## D3. Delegated/subagent continuity & rule parity

- `prepareSubagentSpawn()` currently returns a no-op rollback object with a comment saying subagents “inherit parent scope,” but no explicit parent->child hosted session link is created there.
- If child session key doesn’t have deterministic mapping to a hosted session (or namespace/conversation metadata), continuity can drift.
- Write-rule parity is **only guaranteed** when delegated flows use `remember`/`recordTurn`. Any delegated call path hitting raw create endpoints can bypass quality rules.

---

## E) Test plan

## E1. Unit tests (policy/gate)

1. `storeAutoMemory` denylist tests: transport metadata, media envelope text, command logs, stack traces, code blocks, repeated policy fragments.
2. Secret detection tests: ensure secret-like inputs are skipped + stable machine-readable reason (new `reason_code`).
3. Dedupe/merge tests: exact duplicate, near-duplicate, contradiction case, cooldown behavior.
4. DB backstop tests: direct `insertAgentMemory` call should reject low-quality payload when enforcement flag is on.
5. Reason taxonomy tests: `LOW_SIGNAL`, `SECRET_DETECTED`, `DUPLICATE`, `COOLDOWN`, `INVALID_FORMAT`.

## E2. Integration tests (per write endpoint)

For each write endpoint (`/v1/simple/remember`, `/v1/sessions/:id/turn`, `/v1/memories`, `/v1/sessions/:id/memories`, `/v1/ingest`, `/v1/ingest/documents`, `/v1/indexed`, `/v1/sync/batch`, dashboard `/api/memories`):

- send low-quality payloads and assert consistent deny behavior
- send secret payloads and assert skip/not-stored + reason_code
- send duplicates and assert merge or no-op behavior
- verify no route bypasses DB-level policy

## E3. Regression tests (401 invalid key + reload)

1. Start with valid embedding key -> verify search baseline.
2. Rotate to invalid key without restart -> assert health endpoint detects mismatch/stale config.
3. Trigger embedding call -> assert explicit error metric/event and non-200 health status for embeddings.
4. Restart service with valid key -> assert recovery and no stale-key usage.

## E4. Smoke script (post-restart memory_search health)

Script should:

1. call `/api/v1/internal/diagnostics` (or new embeddings health endpoint)
2. assert active embedding provider/model/dimension match expected env
3. run `/api/v1/search` against known fixture query
4. assert non-empty recall and confidence above floor
5. verify no recent `invalid_api_key` counter increment

---

## F) Patch plan (top 10 fixes ranked by impact/effort)

| Rank | Fix                                                                                                            | Impact    | Effort  |
| ---- | -------------------------------------------------------------------------------------------------------------- | --------- | ------- |
| 1    | Add DB-layer `enforceMemoryWritePolicy()` hook inside `insertAgentMemory` and `insertMemory`                   | Very High | Med     |
| 2    | Create shared `MemoryWritePolicyResult` with stable `reason_code` and apply across all write routes            | Very High | Med     |
| 3    | Route hardening: migrate all raw write endpoints to shared policy wrapper before DB call                       | Very High | Med     |
| 4    | Add cooldown + duplicate fingerprint table/index (user+normalized_text hash+window)                            | High      | Med     |
| 5    | Embedding config invalidation API (`reloadEmbeddingConfig`) + startup/health fingerprints                      | High      | Med     |
| 6    | Fail-loud embedding auth mode (configurable): return 503 on sustained provider auth failure                    | High      | Low-Med |
| 7    | Add write-path observability metrics: accepted/denied by reason_code, per endpoint                             | High      | Low     |
| 8    | Subagent continuity fix: explicit parent-child session linkage + inherited namespace/session metadata contract | High      | Med     |
| 9    | Consolidation unification: trigger micro-dream (or queue job) from all create paths                            | High      | Med     |
| 10   | Dream-cycle automation watchdog: periodic job + run heartbeat table to prove production execution              | High      | Med     |

### Quick wins (<1 day)

1. Add `reason_code` field to `simple/remember` + turn-capture responses.
2. Add endpoint-level logging for denied/skipped writes with normalized reason_code.
3. Add “embedding auth failure” counter + last failure timestamp to diagnostics.
4. Add startup log of active embedding provider/model/dimension + masked key source.
5. Add tests for known incident payload classes (transport metadata, media envelopes, logs, code snippets, repeated policy text).

### Rollout sequence with risk mitigations

1. **Phase 0 (observe-only):** run policy in shadow mode; log would-deny without blocking.
2. **Phase 1 (soft-block):** block only clearly toxic classes (secrets, logs, metadata envelopes).
3. **Phase 2 (full-block):** enable denylist + cooldown + duplicate checks at DB layer.
4. **Phase 3:** enable fail-loud embedding auth mode in canary.
5. **Phase 4:** enforce subagent continuity contract and consolidation trigger unification.
6. **Mitigations:** feature flags + per-tenant opt-out + rollback switch + migration dry-runs.

---

## G) Consolidation / synthesis reliability audit (critical)

## G1. Expected flow (sequence step list)

1. **Raw write arrives** (remember/turn/manual/sync/ingest/indexed).
2. **Policy gate should run** (currently only in some paths).
3. **Memory persists** in `memories` table.
4. **Embedding upsert** stores vector.
5. **Immediate consolidation pass (micro-dream)** may merge/supersede (currently only auto-memory path).
6. **Periodic/manual dream-cycle** clusters memories and generates/refreshes syntheses.
7. **Synthesis persistence** via `upsertSynthesizedMemory`; source links stored via `graph_edges`.
8. **Staleness validation** marks syntheses stale if source sets change.
9. **Recall path** (`simple/context`, `sessions/start`) injects critical syntheses + relevant memories.

## G2. Trigger table

| Trigger                         | Source                                                             | Condition                                    | Schedule                  | Queue/job                   | Persistence target                               |
| ------------------------------- | ------------------------------------------------------------------ | -------------------------------------------- | ------------------------- | --------------------------- | ------------------------------------------------ |
| Micro-dream merge/contradiction | `storeAutoMemory`                                                  | after successful store                       | immediate fire-and-forget | none                        | updates existing/new memory absorbed flags       |
| Consolidation suggestion        | `/v1/memories`                                                     | similarity >= threshold and not `force=true` | inline                    | none                        | response only unless user forces create          |
| Dream-cycle full synthesis      | `/api/dream-cycle/consolidate` and hosted client `runDreamCycle()` | explicit call                                | manual/on-demand          | none (direct execution)     | synthesized memories + graph edges + stale flags |
| Critical synthesis absorption   | `runDreamCycle`                                                    | critical cluster size >=2                    | during dream cycle        | none                        | absorb markers + synthesis records               |
| Synthesis stale marking         | `runDreamCycle` + `validateSynthesizedMemories`                    | missing/changed sources                      | during dream cycle        | none                        | `stale` state updates                            |
| Lifecycle maintenance           | `/v1/lifecycle` or probabilistic trigger helper                    | API/manual trigger                           | ad hoc                    | none                        | archive/delete flags                             |
| Sync queue retries              | sync worker                                                        | failed sync batch op                         | interval with backoff     | in-memory queue/dead-letter | eventual create/update/delete                    |

## G3. Production run verification status

- Consolidation/synthesis jobs **exist in code**, but automatic production execution is not uniformly guaranteed:
  - micro-dream is path-limited to `storeAutoMemory`.
  - dream-cycle appears manual/explicit unless runtime invokes it.
  - no durable scheduler heartbeat table for dream-cycle runs was found.

## G4. Failure handling audit

- **Retries/dead-letter present** for sync queue worker (`sync-queue.ts`, `sync-worker.ts`).
- **Silent-drop risk present** in several places using best-effort `catch` blocks (embedding upsert, similarity checks, background tasks).
- **Synthesis generation skips** when model unavailable and only records warning strings; not persisted as structured failure events.

## G5. Queryability + metadata of synthesized outputs

- Syntheses are persisted with source IDs, topic, compression/confidence, quality metadata, and stale flag, and are pulled into context in session/context endpoints.
- Stale refresh depends on running dream-cycle validation; source change alone does not force immediate refresh outside that cycle.

## G6. Indexed/import/sync feed consistency

- Indexed path writes directly and does not trigger micro-dream/dream-cycle enqueue.
- Sync/import routes write directly and may never enter auto-consolidation path.
- Therefore consolidation coverage is branch-specific and incomplete.

---

## Required output 3: Ten real failure modes + detection

1. **Low-signal junk persisted via direct routes** (e.g., `/v1/sync/batch` create).  
   Detect: endpoint-level accepted count for denylist-like payload fixtures > 0.
2. **Secret-bearing text stored as memory (sensitive flagged but still persisted).**  
   Detect: count of newly created `sensitive=1` records from non-vault endpoints.
3. **Duplicate ballooning from non-deduped routes.**  
   Detect: high normalized-text hash cardinality collapse ratio; repeated near-identical clusters.
4. **Embedding 401 invalid_api_key hidden by zero-vector fallback.**  
   Detect: embedding_auth_failures metric + zero-vector issuance rate spike.
5. **Config patch not applied until restart.**  
   Detect: diagnostics active provider/model unchanged after secret update.
6. **Subagent continuity drift (child not linked to parent context/session).**  
   Detect: child sessions with missing namespace/conversation lineage fields.
7. **Consolidation skipped for indexed/imported/sync writes.**  
   Detect: proportion of writes without follow-up micro-dream/synthesis linkage.
8. **Synthesis stale artifacts served after source changes.**  
   Detect: stale syntheses count > 0 while recall still injects them.
9. **Dream-cycle defined but not running in production cadence.**  
   Detect: missing run heartbeat records over expected interval.
10. **Best-effort catch blocks swallow critical failures.**  
    Detect: warning log bursts without matching structured alert/metric increments.

---

## Required output 5: Production verification checklist (commands + expected outputs)

> Run from service environment with valid API key + admin/operator credentials.

1. `curl -sS -H "Authorization: Bearer $FATHIPPO_KEY" https://<host>/api/v1/internal/diagnostics | jq`
   - Expect active embedding provider/model/dimension and no embedding auth error state.
2. `curl -sS -X POST -H "Authorization: Bearer $FATHIPPO_KEY" -H "Content-Type: application/json" https://<host>/api/v1/simple/remember -d '{"text":"Sender (untrusted metadata): x"}' | jq`
   - Expect `stored:false` (after policy hardening) with `reason_code`.
3. `curl -sS -X POST -H "Authorization: Bearer $FATHIPPO_KEY" -H "Content-Type: application/json" https://<host>/api/v1/sync/batch -d @fixtures/low_signal_batch.json | jq`
   - Expect per-op denies with reason codes; no memory count increase.
4. `curl -sS -H "Authorization: Bearer $FATHIPPO_KEY" -H "Content-Type: application/json" https://<host>/api/v1/search -d '{"query":"known fixture query"}' | jq`
   - Expect non-empty results with stable confidence/quality.
5. `curl -sS -X POST -H "Authorization: Bearer $FATHIPPO_KEY" https://<host>/api/dream-cycle/consolidate | jq`
   - Expect synthesis run summary and warnings only when model unavailable.
6. `curl -sS -H "Authorization: Bearer $FATHIPPO_KEY" https://<host>/api/v1/sync/status | jq`
   - Expect queue/dead-letter metrics, worker running status, low dead-letter backlog.
7. DB check: `SELECT COUNT(*) FROM synthesized_memories WHERE stale = 1;`
   - Expect near-zero after successful cycle.
8. DB check: `SELECT endpoint, reason_code, COUNT(*) FROM memory_write_decisions WHERE created_at > datetime('now','-1 day') GROUP BY 1,2;`
   - Expect observable deny/accept distribution (post-instrumentation).

---

## File/function references used in this audit

- Write capture & policy-ish logic: `src/lib/turn-capture.ts` (`storeAutoMemory`, `captureTurnMemories`).
- Core write primitive: `src/lib/db.ts` (`insertAgentMemory`, synthesized memory upsert/validation functions).
- Route-level writes: `src/app/api/v1/simple/remember/route.ts`, `src/app/api/v1/sessions/[id]/turn/route.ts`, `src/app/api/v1/memories/route.ts`, `src/app/api/v1/sync/batch/route.ts`, `src/app/api/v1/ingest/route.ts`, `src/app/api/v1/ingest/documents/route.ts`, `src/app/api/v1/indexed/route.ts`, `src/app/api/v1/sessions/[id]/memories/route.ts`, `src/app/api/memories/route.ts`.
- Embedding config & vector infra: `src/lib/embeddings.ts`, `src/lib/qdrant.ts`, `src/lib/vector.ts`.
- Consolidation/synthesis: `src/lib/micro-dream.ts`, `src/lib/dream-cycle.ts`, `src/app/api/dream-cycle/consolidate/route.ts`.
- ACP/MCP continuity: `packages/context-engine/src/engine.ts`, `packages/hosted/src/runtime-adapter.ts`, `packages/mcp-server/src/index.ts`.
