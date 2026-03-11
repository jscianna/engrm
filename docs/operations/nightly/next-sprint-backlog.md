# Next Sprint Backlog

**Sprint:** Edge-First Production Hardening  
**Generated:** 2026-03-11  
**Priority Focus:** Production readiness, monitoring, and operational stability

---

## P0 - Must Complete

### 1. [S] Fix Edge Metrics Auth Scope
**Description:** The `/api/v1/edge/metrics` endpoint returns 401 even with valid API key. Verify `simple.context` scope covers edge metrics or add dedicated scope.

**Acceptance Criteria:**
- [ ] API key with `simple.context` scope can access `/api/v1/edge/metrics`
- [ ] Returns proper 401 with clear error message for invalid keys
- [ ] Add test case for scope validation

**Files:**
- `src/app/api/v1/edge/metrics/route.ts`
- `src/lib/api-auth.ts`

**Size:** S (1-2 hours)

---

### 2. [M] Rate Limit Monitoring Dashboard
**Description:** Add rate limit usage visibility to admin dashboard. Users hit daily limits without warning.

**Acceptance Criteria:**
- [ ] Dashboard shows current usage / daily limit
- [ ] Warning at 80% usage
- [ ] Clear reset time displayed (UTC midnight)
- [ ] API returns `X-RateLimit-Remaining` header

**Files:**
- `src/app/dashboard/usage/page.tsx` (new)
- `src/app/api/v1/simple/*/route.ts` (add headers)
- `src/lib/rate-limit.ts`

**Size:** M (4-6 hours)

---

### 3. [M] Edge Metrics Persistence
**Description:** Edge metrics are process-local and reset on restart. Persist to Redis/DB for cross-instance aggregation.

**Acceptance Criteria:**
- [ ] Metrics survive process restarts
- [ ] Aggregated across Vercel instances
- [ ] 24-hour rolling window retention
- [ ] Backward compatible with current response schema

**Files:**
- `src/lib/local-retrieval.ts`
- `src/lib/compaction-safety.ts`
- `src/lib/edge-metrics-store.ts` (new)

**Size:** M (4-6 hours)

---

### 4. [S] Shadow Mode E2E Test
**Description:** Add automated test that validates shadow retrieval overlap calculation against known test data.

**Acceptance Criteria:**
- [ ] Test covers `recordShadowSample` and `shadowAvgOverlap` calculation
- [ ] Validates Jaccard similarity thresholds
- [ ] Runs in CI

**Files:**
- `packages/cognitive-engine/src/shadow-retrieval.test.ts` (new)
- `src/lib/local-retrieval.ts`

**Size:** S (2-3 hours)

---

### 5. [L] Circuit Breaker Observability
**Description:** Circuit breaker triggers are invisible. Add logging, metrics, and alerting when CB activates.

**Acceptance Criteria:**
- [ ] Log event when circuit breaker opens/closes
- [ ] Metric counter for CB triggers per hour
- [ ] Optional webhook alert on CB activation
- [ ] Document CB recovery procedure

**Files:**
- `src/lib/edge-circuit-breaker.ts` (new or extract)
- `src/lib/alert-delivery.ts`
- `docs/operations/CIRCUIT_BREAKER_RUNBOOK.md` (new)

**Size:** L (6-8 hours)

---

## P1 - Should Complete

### 6. [M] Constraint Drift Alerting
**Description:** When `missingConstraints > 0` detected, automatically alert via configured channels.

**Acceptance Criteria:**
- [ ] Alert fires within 1 minute of constraint drift
- [ ] Includes context: which constraints, before/after snapshot
- [ ] Supports Slack, Discord, email channels
- [ ] Deduplicate alerts (max 1 per constraint per hour)

**Files:**
- `src/lib/compaction-safety.ts`
- `src/lib/alert-delivery.ts`
- `src/lib/constraint-drift-detector.ts` (new)

**Size:** M (4-6 hours)

---

### 7. [S] Rollout Percentage Config Endpoint
**Description:** Allow dynamic rollout percentage adjustment without code deploy. Currently requires client-side config changes.

**Acceptance Criteria:**
- [ ] `POST /api/v1/admin/edge-rollout` sets global rollout %
- [ ] Admin auth required
- [ ] Changes apply immediately
- [ ] Audit log entry created

**Files:**
- `src/app/api/v1/admin/edge-rollout/route.ts` (new)
- `src/lib/edge-config.ts` (new)
- `src/lib/audit-log.ts`

**Size:** S (2-3 hours)

---

### 8. [M] Overnight Automation Script
**Description:** Create cron-ready script that runs hourly overnight, captures snapshots, and generates drift reports.

**Acceptance Criteria:**
- [ ] Single script: `scripts/overnight-monitor.sh`
- [ ] Runs without interaction
- [ ] Outputs to `docs/operations/nightly/`
- [ ] Git commits changes automatically
- [ ] Supports dry-run mode

**Files:**
- `scripts/overnight-monitor.sh` (new)
- `docs/operations/nightly/runbook-overnight.md`

**Size:** M (3-4 hours)

---

### 9. [S] Hot Cache Warm-Up Script
**Description:** Pre-populate local cache with frequent queries to improve initial hit rates after deploy.

**Acceptance Criteria:**
- [ ] Script reads top queries from analytics
- [ ] Warms cache for top N users
- [ ] Runs post-deploy automatically
- [ ] Metrics show hit rate improvement

**Files:**
- `scripts/warm-cache.ts` (new)
- `src/lib/local-retrieval.ts`
- `src/lib/memory-analytics.ts`

**Size:** S (2-3 hours)

---

### 10. [L] Local Retrieval Fuzzy Match Tuning
**Description:** Current Jaccard threshold (0.72) may be too aggressive. A/B test different thresholds.

**Acceptance Criteria:**
- [ ] Configurable similarity threshold
- [ ] A/B flag for threshold experiments
- [ ] Metrics track hit rate by threshold variant
- [ ] Document optimal threshold findings

**Files:**
- `src/lib/local-retrieval.ts`
- `src/lib/ab-flags.ts`
- `docs/operations/FUZZY_MATCH_TUNING.md` (new)

**Size:** L (6-8 hours)

---

## P2 - Nice to Have

### 11. [M] Grafana Dashboard Template
**Description:** Create exportable Grafana dashboard for edge-first metrics visualization.

**Acceptance Criteria:**
- [ ] JSON dashboard template
- [ ] Panels: hit rate, risk score, flush quality, CB triggers
- [ ] Time-series graphs + current gauges
- [ ] Alert thresholds pre-configured

**Files:**
- `docs/operations/grafana-edge-dashboard.json` (new)
- `docs/operations/MONITORING_SETUP.md` (new)

**Size:** M (3-4 hours)

---

### 12. [S] Edge Metrics CLI Command
**Description:** Add `fathippo edge-metrics` CLI command for quick health checks.

**Acceptance Criteria:**
- [ ] `fathippo edge-metrics` shows current metrics
- [ ] `fathippo edge-metrics --watch` polls every 30s
- [ ] Color-coded status (green/yellow/red)
- [ ] Works with configured API key

**Files:**
- `packages/cli/src/commands/edge-metrics.ts` (new)
- `packages/cli/src/index.ts`

**Size:** S (2-3 hours)

---

### 13. [M] Compaction Risk Score Calibration
**Description:** Current risk score formula uses hardcoded weights. Calibrate against real compaction outcomes.

**Acceptance Criteria:**
- [ ] Collect 1000+ compaction samples with outcomes
- [ ] Analyze correlation between predicted risk and actual issues
- [ ] Adjust formula weights based on data
- [ ] Document calibration methodology

**Files:**
- `src/lib/compaction-safety.ts`
- `docs/operations/RISK_CALIBRATION.md` (new)

**Size:** M (4-6 hours)

---

### 14. [S] Health Check Endpoint
**Description:** Add `/api/health` endpoint for uptime monitoring services.

**Acceptance Criteria:**
- [ ] Returns 200 with `{"status": "ok"}` when healthy
- [ ] Checks DB connectivity
- [ ] Checks Redis connectivity (if used)
- [ ] No auth required

**Files:**
- `src/app/api/health/route.ts` (new)

**Size:** S (1-2 hours)

---

### 15. [L] Local-First Package Extraction
**Description:** Extract local retrieval logic into standalone `@fathippo/local` package for client-side use.

**Acceptance Criteria:**
- [ ] `packages/local/` with independent package.json
- [ ] Works in browser (IndexedDB backend)
- [ ] Works in Node (file/memory backend)
- [ ] Same API as server-side cache
- [ ] <50KB bundle size

**Files:**
- `packages/local/` (new package)
- `src/lib/local-retrieval.ts` (refactor to use package)

**Size:** L (8-12 hours)

---

## Sprint Summary

| Priority | Count | Total Effort |
|----------|-------|--------------|
| P0 | 5 | ~22 hours |
| P1 | 5 | ~18 hours |
| P2 | 5 | ~22 hours |

**Recommended Sprint Scope:** P0 (5 tickets) + P1 tickets 6-8 = 8 tickets, ~34 hours

---

*Generated from codebase analysis on 2026-03-11*
