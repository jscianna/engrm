# Edge Safety Decision Template

Use these scripts to make data-driven rollout decisions.

```bash
# Capture metrics snapshot
./scripts/edge-safety-snapshot.sh https://fathippo.ai mem_xxx

# Generate decision report
./scripts/edge-safety-report.sh ./tmp/edge-safety-*.json
```

## Decision Matrix

### GO Criteria (ALL must be true)

| Criterion | Threshold | Rationale |
|-----------|-----------|-----------|
| hitRate | ≥ 0.60 | Acceptable cache hit rate |
| shadowAvgOverlap | ≥ 0.55 | Shadow results align with production |
| avgRiskScore | < 0.60 | Risk within acceptable bounds |
| avgFlushQuality | ≥ 0.60 | Flush operations healthy |

### ROLLBACK Criteria (ANY triggers rollback)

| Criterion | Threshold | Rationale |
|-----------|-----------|-----------|
| shadowAvgOverlap | < 0.35 | Severe divergence from production |
| avgRiskScore | ≥ 0.75 | Critical risk detected |
| missingConstraints | > 0 | Security/privacy constraints missing |

### HOLD Criteria

If neither GO nor ROLLBACK criteria are met, HOLD and investigate before proceeding.

## Decision Workflow

1. **Capture snapshot** using `edge-safety-snapshot.sh`
2. **Run report** using `edge-safety-report.sh`
3. **Apply decision** based on the matrix above
4. **Document rationale** in the deployment log

## Example Scenarios

### GO Scenario

```json
{
  "hitRate": 0.72,
  "shadowAvgOverlap": 0.68,
  "avgRiskScore": 0.45,
  "avgFlushQuality": 0.75,
  "missingConstraints": 0
}
```

All GO criteria met. Proceed with rollout to next stage.

### HOLD Scenario

```json
{
  "hitRate": 0.55,
  "shadowAvgOverlap": 0.48,
  "avgRiskScore": 0.62,
  "avgFlushQuality": 0.58,
  "missingConstraints": 0
}
```

Shadow overlap below threshold (0.48 < 0.55), risk score elevated (0.62 > 0.60). HOLD and investigate cache warming patterns before proceeding.

### ROLLBACK Scenario

```json
{
  "hitRate": 0.45,
  "shadowAvgOverlap": 0.28,
  "avgRiskScore": 0.82,
  "avgFlushQuality": 0.40,
  "missingConstraints": 2
}
```

Shadow overlap critical (0.28 < 0.35), risk score exceeds limit (0.82 ≥ 0.75), missing constraints detected (2 > 0). ROLLBACK immediately.

## Integration with Rollout Playbook

See `EDGE_FIRST_ROLLOUT_PLAYBOOK.md` for full rollout stages.

Run safety check at each stage transition: 5% → 20% → 50% → 100%
