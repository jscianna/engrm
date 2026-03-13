# FatHippo TODOS

Generated from CEO Plan Review (HOLD SCOPE) + Eng Plan Review (BIG CHANGE) — 2026-03-13

## Execution Order

Revised sequence from eng review (enhance wrapper before migration):

```
Phase 1 (foundations):   TODO 3 → TODO 7
Phase 2 (core cleanup):  TODO 5+9 (enhance withApiAuth) → TODO 8 (migrate routes) → TODO 1 (split db.ts)
Phase 3 (hardening):     TODO 2 → TODO 4 → TODO 6 → TODO 10 → TODO 11
```

### Key Eng Review Decisions
- **db.ts split:** Barrel re-export pattern (db.ts re-exports from sub-modules, zero import changes)
- **withApiAuth enhancement:** Add audit logging + AsyncLocalStorage request context BEFORE migrating routes (one touch per file, not two)
- **withApiAuthAnyScope:** New wrapper variant for multi-scope routes (part of TODO 5+9)
- **Encryption key rejection:** Fatal error with migration hint showing the SHA-256-derived hex key
- **Schema consolidation:** Drizzle as source of truth + lightweight startup schema validator (check, don't fix)
- **Audit log writes:** Fire-and-forget (don't await INSERT in request path)
- **AsyncLocalStorage fallback:** getRequestContext() returns {requestId: 'background', userId: 'system'} outside request context

---

## P1 — Must Do

### TODO 3: Reject weak encryption keys on startup
- **What:** Make `getMasterKey()` in `src/lib/db.ts` throw if ENCRYPTION_KEY isn't valid 64-char hex or 32-byte base64. Remove the SHA-256 fallback.
- **Why:** Current code accepts ANY string as an encryption key by hashing it. `ENCRYPTION_KEY=password` silently works.
- **Pros:** Prevents silent security degradation. Aligns with "privacy is sacred" product principle.
- **Cons:** Could break existing deployments using weak keys (one-time migration needed)
- **Context:** `getMasterKey()` at `src/lib/db.ts:32-53`. The SHA-256 fallback on line 52 is the problem.
- **Eng review decision:** Fatal error message includes the SHA-256-derived hex of the weak key so operators can copy it as their new ENCRYPTION_KEY without re-encrypting data.
- **Effort:** S (30 min)
- **Priority:** P1
- **Depends on:** Nothing (do first)

### TODO 7: Add core pipeline integration tests
- **What:** Add vitest integration tests for: memory CRUD, encryption round-trip, secret detection, embedding generation, context injection flow.
- **Why:** The core product path (create → encrypt → embed → persist → search → inject) has ZERO test coverage.
- **Pros:** Confidence to refactor (especially for TODO 1), deploy safety, regression prevention
- **Cons:** Requires vitest config for `src/` (currently only `packages/cognitive-engine` has tests)
- **Context:** Test file: `src/lib/__tests__/core-pipeline.test.ts`. Mock external services (OpenAI, Qdrant, Turso) to test logic without network calls.
- **Eng review additions:** Also test barrel re-export (all 108 exports accessible via `@/lib/db`), withApiAuth wrapper behavior, and AsyncLocalStorage context propagation.
- **Effort:** L (1 day)
- **Priority:** P1
- **Depends on:** Nothing (do second, enables everything else)

### TODO 5+9: Enhance withApiAuth with audit logging + structured logging
- **What:** Enhance `withApiAuth` wrapper to: (1) generate request ID, (2) set AsyncLocalStorage context, (3) call `logAuditEvent()` fire-and-forget, (4) add `withApiAuthAnyScope` variant for multi-scope routes.
- **Why:** This wrapper becomes the single integration point for auth + audit + observability. Must be done BEFORE migrating 73 routes to avoid double-touching files.
- **Pros:** One-time enhancement, then 73-route migration is purely mechanical
- **Cons:** More complexity in the wrapper (but it's the right place for it)
- **Context:**
  - `api-auth.ts:97-109` — current wrapper
  - `audit-log.ts` — fully written, just needs wiring
  - AsyncLocalStorage — Node.js built-in, zero-dep
  - `getRequestContext()` returns `{requestId: 'background', userId: 'system'}` when called outside request (dream cycle, scripts)
  - Audit log INSERT is fire-and-forget (no await) to avoid adding latency
- **Effort:** M (3 hours)
- **Priority:** P1
- **Depends on:** TODO 7 (tests for wrapper behavior)

### TODO 8: Migrate 73 API routes to withApiAuth wrapper
- **What:** Replace inline `try { validateApiKey(); ... } catch { errorResponse() }` with `withApiAuth(handler, endpoint)` across all v1 API routes. Use `withApiAuthAnyScope` for multi-scope routes.
- **Why:** 73 routes duplicate the same auth+error pattern. The enhanced wrapper now also handles audit logging and request context.
- **Pros:** DRY, consistent error handling, every route gets audit + logging for free
- **Cons:** Large surface area change (73 files), risk of regressions (mitigated by TODO 7)
- **Context:** Changes `export async function POST` to `export const POST = withApiAuth(...)`. Mechanical transformation. Routes using `validateApiKeyAnyScope` use the new `withApiAuthAnyScope` variant instead.
- **Effort:** M (3-4 hours)
- **Priority:** P1
- **Depends on:** TODO 5+9 (wrapper must be enhanced first)

### TODO 1: Split db.ts into focused modules
- **What:** Break `src/lib/db.ts` (5,193 lines, 108 exports) into: `db-encryption.ts`, `db-schema.ts`, `db-memories.ts`, `db-vault.ts`, `db-api-keys.ts`, `db-sessions.ts`. Keep `db.ts` as barrel re-export.
- **Why:** Single largest maintenance risk. 57 files import from `db.ts`.
- **Pros:** Reduced blast radius, easier code review, faster onboarding
- **Cons:** Risk of regressions without test coverage (mitigated by TODO 7)
- **Context:** 57 files import from `@/lib/db`. Barrel re-export pattern means zero import changes. Each sub-module is the source of truth; `db.ts` just re-exports.
- **Eng review decision:** Barrel re-export (not import updates). Split boundaries: encryption (lines 1-146), schema (148-721), memories (722-1600), vault (1640-1930), api-keys (1930-2360), sessions (2360+).
- **Effort:** M (4 hours)
- **Priority:** P1
- **Depends on:** TODO 7 (tests) for safety

### TODO 4: Persist sync queue to Turso
- **What:** Replace in-memory array in `src/lib/sync-queue.ts` with a Turso table. Keep retry/dead-letter semantics.
- **Why:** Process restart silently drops pending writes. Code comment on line 64 acknowledges this.
- **Pros:** Eliminates silent data loss
- **Cons:** Adds DB dependency to sync path, slight latency increase
- **Context:** `sync-queue.ts:65` — `let syncQueue: SyncQueueEntry[] = []`. On Vercel, every function invocation is a fresh process. Only 2 files import from sync-queue (sync-worker.ts, sync/status/route.ts).
- **Effort:** M (2-3 hours)
- **Priority:** P1
- **Depends on:** Nothing

### TODO 2: Add down-migration support
- **What:** Add `down()` functions to all 4 migration files in `migrations/`
- **Why:** Migrations are forward-only. A bad ALTER TABLE in production requires manual SQL surgery on a live database.
- **Pros:** Safe rollback, deploy confidence
- **Cons:** Extra maintenance per migration going forward
- **Context:** Current migrations use `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN` with `.catch(() => {})`. No mechanism to reverse. Migration framework is in `scripts/db-migrate.mjs`.
- **Effort:** S (2 hours)
- **Priority:** P1
- **Depends on:** Nothing

---

## P2 — Should Do

### TODO 6: Move elevated API key prefixes to env var
- **What:** Replace hardcoded `ELEVATED_API_KEY_PREFIXES` Set in `src/lib/rate-limiter.ts:23-26` with an env var.
- **Why:** Partial API key hash in source code is a credential smell.
- **Pros:** Clean separation of config from code
- **Cons:** Minimal
- **Context:** Currently contains a test account key prefix: `mem_e94394c0499b7026c0576d2ddc9db41fe5127c642115ccb1`
- **Effort:** S (15 min)
- **Priority:** P2
- **Depends on:** Nothing

### TODO 10: Add post-deploy smoke test script
- **What:** Create `scripts/deploy-smoke.sh` that hits `/api/health`, creates a test memory, verifies search returns it, cleans up.
- **Why:** No automated post-deploy verification. Edge smoke tests exist but no general API smoke test.
- **Pros:** Catches 80% of deploy regressions automatically
- **Cons:** Requires a test API key and test user in production
- **Context:** Pattern exists in `scripts/edge-first-smoke.sh`. Adapt for general API verification.
- **Effort:** S (1 hour)
- **Priority:** P2
- **Depends on:** Nothing

### TODO 11: Consolidate schema definitions
- **What:** Make Drizzle schema (`src/lib/db/schema.ts`) the single source of truth. Generate migrations from Drizzle. Replace bootstrap DDL with a lightweight startup validator that checks (but doesn't fix) required columns.
- **Why:** Schema defined in 3+ places. Three existing TODO comments flag this drift.
- **Pros:** Single source of truth, eliminates an entire class of bugs
- **Cons:** Requires choosing canonical path and building the validator
- **Context:** TODO comments in `db.ts:169`, `db.ts:422`, `db/schema.ts:3` all reference this.
- **Eng review decision:** Drizzle as canonical + startup validator (not self-healing DDL). Validator throws FATAL if required columns are missing, forcing migration before deploy.
- **Effort:** L (1 day)
- **Priority:** P2
- **Depends on:** TODO 1 (db.ts split) and TODO 7 (tests)
