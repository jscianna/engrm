# Ultrawork Execution Backlog (Prioritized)

## P0
### 1) Edge-first retrieval pipeline
- **Scope:** Local filter -> local retrieve -> hosted fallback path.
- **Files likely touched:** `packages/local/*`, `src/app/api/v1/simple/context/route.ts`, `packages/context-engine/*`
- **Acceptance criteria:** Local path returns within budget; fallback works; feature flag toggle.
- **Effort:** L

### 2) Local hot-memory cache
- **Scope:** Add LRU for top accessed memories + invalidation hooks.
- **Files likely touched:** `packages/local/cache/*`, `src/lib/memory-analytics.ts`
- **Acceptance criteria:** Cache hit-rate metrics; deterministic eviction; no stale criticals.
- **Effort:** M

### 3) Hosted rerank/HyDE as optional upgrade
- **Scope:** Confidence-gated hosted rerank; keep local first.
- **Files likely touched:** `src/lib/hyde.ts`, `src/lib/reranker.ts`, `context route`
- **Acceptance criteria:** Quality gain with bounded added latency/cost; toggleable.
- **Effort:** M

## P1
### 4) Sync queue + retry policy
- **Scope:** Encrypted write queue, retries, backoff, dead-letter handling.
- **Files likely touched:** `packages/hosted/sync/*`, `apps/cloud-api/*`
- **Acceptance criteria:** >99% successful sync; observable queue depth.
- **Effort:** L

### 5) Package split scaffolding
- **Scope:** Create `@fathippo/local`, `@fathippo/hosted`, `@fathippo/cognition` entrypoints + build config.
- **Files likely touched:** `packages/*/package.json`, root workspace config, build scripts.
- **Acceptance criteria:** Independent package installs + smoke examples.
- **Effort:** M

### 6) Entitlements + gating
- **Scope:** Hosted/cognition checks at API and SDK boundaries.
- **Files likely touched:** `apps/cloud-api/middleware`, `dashboard billing`, SDK clients.
- **Acceptance criteria:** Plan-locked features enforced server-side.
- **Effort:** M

## P2
### 7) Cognition group-learning MVP
- **Scope:** Org-scoped pattern store with quality threshold and rollback.
- **Files likely touched:** `packages/cognition/*`, `src/lib/cognitive-*`, admin APIs.
- **Acceptance criteria:** Safe transfer of approved patterns only; audit logs.
- **Effort:** L

### 8) Governance + policy controls
- **Scope:** Sharing policies, redaction, provenance tracking.
- **Files likely touched:** cognition APIs, policy engine, dashboard admin.
- **Acceptance criteria:** Tenant isolation tests pass; policy violations blocked.
- **Effort:** L

### 9) Migration guides + examples
- **Scope:** docs and starter templates per SKU.
- **Files likely touched:** `docs/*`, `examples/*`.
- **Acceptance criteria:** New user can install a single package and run in <10 min.
- **Effort:** S