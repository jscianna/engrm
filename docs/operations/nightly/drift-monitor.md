# Compaction Safety Drift Monitor

**Purpose:** Track compaction safety metrics over time to detect drift from healthy baselines.

---

## Monitoring Strategy

### Metrics to Track

| Metric | Healthy Range | Watch Threshold | Critical Threshold |
|--------|---------------|-----------------|-------------------|
| `avgRiskScore` | < 0.55 | ≥ 0.55 | ≥ 0.75 |
| `avgFlushQuality` | > 0.65 | < 0.65 | < 0.55 |
| `postCompactionMissingConstraints` | 0 | 1-2 | > 2 |
| `hitRate` | > 0.60 | < 0.60 | < 0.40 |
| `shadowAvgOverlap` | > 0.55 | < 0.55 | < 0.35 |

### Drift Detection

**Positive Drift (Improving):**
- Risk score decreasing
- Flush quality increasing
- Hit rate increasing

**Negative Drift (Degrading):**
- Risk score increasing over 3+ samples
- Flush quality declining
- Missing constraints appearing
- Shadow overlap decreasing

## Automated Monitoring Script

Save snapshots hourly and compare against baseline:

```bash
#!/usr/bin/env bash
# drift-check.sh - Run hourly to detect drift

BASELINE="./docs/operations/nightly/baseline.json"
CURRENT="./docs/operations/nightly/latest.json"
HISTORY="./docs/operations/nightly/history/"

# Capture current metrics
./scripts/edge-safety-snapshot.sh https://fathippo.ai "$FATHIPPO_API_KEY" ./docs/operations/nightly

# Move to timestamped history
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LATEST=$(ls -t ./docs/operations/nightly/edge-safety-*.json | head -1)
cp "$LATEST" "$HISTORY/edge-safety-$TIMESTAMP.json"
cp "$LATEST" "$CURRENT"

# Compare against baseline (if exists)
if [ -f "$BASELINE" ]; then
  BASELINE_RISK=$(jq -r '.localRetrieval.avgRiskScore // 0' "$BASELINE")
  CURRENT_RISK=$(jq -r '.localRetrieval.avgRiskScore // 0' "$CURRENT")
  
  BASELINE_QUALITY=$(jq -r '.localRetrieval.avgFlushQuality // 0' "$BASELINE")
  CURRENT_QUALITY=$(jq -r '.localRetrieval.avgFlushQuality // 0' "$CURRENT")
  
  BASELINE_MISSING=$(jq -r '.localRetrieval.missingConstraints // 0' "$BASELINE")
  CURRENT_MISSING=$(jq -r '.localRetrieval.missingConstraints // 0' "$CURRENT")
  
  # Alert on drift
  DRIFT_RISK=$(echo "$CURRENT_RISK - $BASELINE_RISK" | bc -l)
  if (( $(echo "$DRIFT_RISK > 0.1" | bc -l) )); then
    echo "⚠️ DRIFT ALERT: Risk score increased by $DRIFT_RISK"
  fi
  
  if (( $(echo "$CURRENT_MISSING > 0" | bc -l) )); then
    echo "🚨 CRITICAL: Missing constraints detected: $CURRENT_MISSING"
  fi
fi
```

## Baseline Establishment

Before enabling drift monitoring, establish baselines:

### Phase 1: Pre-Rollout Baseline
```bash
# Capture 3 samples over 6 hours before any rollout
for i in 1 2 3; do
  ./scripts/edge-safety-snapshot.sh https://fathippo.ai "$FATHIPPO_API_KEY" ./docs/operations/nightly
  sleep 7200  # 2 hours
done

# Average to create baseline
# (manual for now, automate later)
```

### Phase 2: Per-Rollout-Stage Baseline
After each rollout stage stabilizes (4+ hours), capture a new baseline:

```bash
cp ./docs/operations/nightly/latest.json \
   ./docs/operations/nightly/baseline-stage-5pct.json
```

## Drift Log Template

Track drift events in this format:

```markdown
### 2026-03-XX HH:MM - [STABLE|WATCH|CRITICAL]

**Metrics:**
- Risk Score: X.XX (baseline: X.XX, delta: ±X.XX)
- Flush Quality: X.XX (baseline: X.XX, delta: ±X.XX)
- Missing Constraints: X
- Hit Rate: X.XX
- Shadow Overlap: X.XX

**Assessment:**
- [Description of any drift or concerns]

**Action:**
- [None / Investigate / Reduce rollout / Rollback]
```

---

## Drift Log

### 2026-03-11 22:10 - PENDING

**Metrics:** Unable to collect - API rate limit reached

**Assessment:** Baseline not yet established. Waiting for rate limit reset at 08:00 SGT.

**Action:** Monitor for reset, then capture initial baseline.

---

*Add new entries below as snapshots are captured*

