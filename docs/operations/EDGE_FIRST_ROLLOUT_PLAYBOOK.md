# Edge-First Rollout Playbook

Operational guide for safely rolling out edge-first context retrieval.

## Overview

Edge-first retrieval uses local cache to serve frequent queries instantly, bypassing expensive vector/BM25 search. This playbook provides a safe, measured rollout sequence with monitoring and rollback procedures.

## Prerequisites

- API key with context access
- Access to `/api/v1/edge/metrics` (or equivalent monitoring)
- Smoke test script: `scripts/edge-first-smoke.sh`
- Metrics snapshot script: `scripts/edge-first-snapshot.sh` (creates timestamped snapshots)

## Pre-Flight Checks

Run smoke test before each rollout stage:

```bash
./scripts/edge-first-smoke.sh https://fathippo.ai mem_xxx
```

Expected output:
```
Test                 Edge-First   Edge-Rollout Edge-Hit     Edge-CB    Confidence
----                 ----------   ------------ --------     -------    ----------
baseline             -            -            -            -          -
100pct-rollout       on           active       false|true   off|on     0.xxx
0pct-rollout         on           skipped      false        off        0.000
```

## Recommended Rollout Sequence

| Stage | Rollout % | Duration | Purpose |
|-------|-----------|----------|---------|
| 1 | 5% | 2-4 hours | Smoke test in production |
| 2 | 20% | 24 hours | Observe cache hit rates |
| 3 | 50% | 48 hours | Validate at scale |
| 4 | 100% | - | Full rollout |

### Stage 1: 5% Rollout (Canary)

**Before starting, capture baseline metrics:**

```bash
./scripts/edge-first-snapshot.sh https://fathippo.ai mem_xxx
```

**Enable 5% rollout:**

```bash
curl -X POST https://fathippo.ai/api/v1/simple/context \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Test query",
    "edgeFirst": true,
    "edgeRolloutPct": 5,
    "edgeSeed": "production-v1"
  }'
```

**Validation Criteria:**
- No increase in error rates
- Response headers present (`X-FatHippo-Edge-*`)
- No unexpected latency spikes

**After 15 minutes, capture metrics snapshot:**

```bash
./scripts/edge-first-snapshot.sh https://fathippo.ai mem_xxx
```

### Stage 2: 20% Rollout

**Before increasing, capture current metrics:**

```bash
./scripts/edge-first-snapshot.sh https://fathippo.ai mem_xxx
```

**Increase coverage to validate cache effectiveness:**

```bash
# Update your client configs
"edgeRolloutPct": 20
```

**Monitor for 30 minutes, then capture snapshot:**

```bash
./scripts/edge-first-snapshot.sh https://fathippo.ai mem_xxx
```

### Stage 3: 50% Rollout

**Before increasing, capture current metrics:**

```bash
./scripts/edge-first-snapshot.sh https://fathippo.ai mem_xxx
```

**Enable majority coverage to stress-test at scale:**

```bash
# Update your client configs
"edgeRolloutPct": 50
```

**Monitor for 60 minutes, then capture snapshot:**

```bash
./scripts/edge-first-snapshot.sh https://fathippo.ai mem_xxx
```

### Stage 4: 100% Rollout

**Before final rollout, capture current metrics:**

```bash
./scripts/edge-first-snapshot.sh https://fathippo.ai mem_xxx
```

**Enable full rollout:**

```bash
# Update your client configs
"edgeRolloutPct": 100
```

**After full rollout, capture final metrics:**

```bash
./scripts/edge-first-snapshot.sh https://fathippo.ai mem_xxx
```

**Compare all snapshots:**

```bash
ls -la ./tmp/edge-metrics-*.json
```

## Key Metrics to Watch

Monitor these metrics from `/api/v1/edge/metrics`:

### Primary Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| `edge_hit_rate` | >60% | <40% |
| `edge_avg_confidence` | >0.75 | <0.60 |
| `edge_cache_size` | N/A | >10MB per user |
| `edge_circuit_breaker_triggers` | 0 | >5/hour |

### Secondary Metrics

| Metric | Description |
|--------|-------------|
| `edge_rollout_active_ratio` | % of requests in rollout |
| `edge_fallback_to_hybrid` | % of edge lookups that fell back |
| `edge_latency_p99` | P99 latency for edge path |

### Sample Metrics Query

```bash
# If metrics endpoint available
curl -H "Authorization: Bearer mem_xxx" \
  https://fathippo.ai/api/v1/edge/metrics
```

Expected response:
```json
{
  "edge_hit_rate": 0.72,
  "edge_avg_confidence": 0.81,
  "edge_cache_size_bytes": 2457600,
  "edge_circuit_breaker_triggers_1h": 0,
  "edge_rollout_active_ratio": 0.20,
  "edge_fallback_to_hybrid_ratio": 0.28
}
```

## Rollback Criteria

**Immediate rollback required if:**

1. **Error rate spike**: 5xx errors increase >0.1%
2. **Latency regression**: P99 latency increases >50ms
3. **Circuit breaker thrashing**: >5 triggers per hour
4. **Low confidence cascade**: Avg confidence <0.60 for >10 minutes
5. **User complaints**: Reports of missing/incorrect context

## Immediate Rollback Command

Set rollout to 0% to instantly disable edge-first for all users:

```bash
# Emergency rollback - 0% rollout
curl -X POST https://fathippo.ai/api/v1/simple/context \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Your query",
    "edgeFirst": true,
    "edgeRolloutPct": 0,
    "edgeSeed": "production-v1"
  }'
```

Or disable entirely:

```bash
# Disable edge-first (falls back to hybrid search)
"edgeFirst": false
```

## Post-Rollout Verification

After each stage increase:

1. Run smoke test
2. Capture metrics snapshot (`./scripts/edge-first-snapshot.sh`)
3. Check metrics for 15 minutes
4. Verify no alert triggers
5. Document observations

**Review snapshot history:**

```bash
# List all captured snapshots
ls -lt ./tmp/edge-metrics-*.json

# Compare two snapshots
diff <(jq .localRetrieval.hitRate ./tmp/edge-metrics-YYYYMMDD-HHMMSS.json) \
     <(jq .localRetrieval.hitRate ./tmp/edge-metrics-YYYYMMDD-HHMMSS.json)
```

## Troubleshooting

### Issue: Low Hit Rate

**Symptoms**: `edge_hit_rate` <40%

**Causes**:
- Cache too cold (recently cleared)
- Query patterns don't match cached entries
- Confidence threshold too high

**Actions**:
- Wait for cache warm-up (natural queries populate it)
- Lower `edgeMinConfidence` to 0.7
- Verify `localStoreResult` is being called

### Issue: Circuit Breaker Active

**Symptoms**: `X-FatHippo-Edge-CB: on`

**Causes**:
- 5+ consecutive low-confidence lookups

**Actions**:
- Check query patterns for anomalies
- Wait 30 lookups for auto-recovery
- Adjust `edgeMinConfidence` if threshold mismatched

### Issue: Rollout Header Missing

**Symptoms**: No `X-FatHippo-Edge-*` headers

**Causes**:
- `edgeFirst: false` (default)
- Request not in rollout percentage
- API version doesn't support edge-first

**Actions**:
- Verify `edgeFirst: true` in request
- Check `edgeRolloutPct` and `edgeSeed` combination
- Update API client if needed

## Rollout Checklist

- [ ] Smoke test passes at current stage
- [ ] Metrics endpoint responding
- [ ] Alert thresholds configured
- [ ] Rollback command tested
- [ ] On-call engineer notified
- [ ] Rollout window selected (low-traffic period)
- [ ] Previous stage metrics reviewed

## Seed Versioning

Use seeds to run independent rollouts:

| Seed | Purpose |
|------|---------|
| `production-v1` | Initial production rollout |
| `production-v2` | Second iteration (after learnings) |
| `experimental-v1` | A/B test variant |

Changing the seed creates a fresh bucket assignment, allowing you to re-rollout to the same user base with different parameters.

## Communication

Notify stakeholders at each stage:

- **5%**: "Canary started"
- **20%**: "Expanded to 20%"
- **50%**: "Majority rollout"
- **100%**: "Full rollout complete"
- **Rollback**: "Rolled back to X% - [reason]"
