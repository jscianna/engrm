# Compaction Safety Runbook

## New Signals
- `X-FatHippo-Compaction-Risk` (0..1): higher means greater risk of losing useful context.
- `X-FatHippo-Flush-Quality` (0..1): higher means better preservation confidence.
- `X-FatHippo-Constraint-Diff-Missing` (int): number of key constraint-like lines missing after context formatting.

## Metrics Endpoint
`GET /api/v1/edge/metrics` now includes:
- `compactionSafety.samples`
- `compactionSafety.avgRiskScore`
- `compactionSafety.avgFlushQuality`
- `compactionSafety.postCompactionMissingConstraints`

## Operational Thresholds (starter)
- Healthy:
  - `avgRiskScore < 0.55`
  - `avgFlushQuality > 0.65`
  - `postCompactionMissingConstraints == 0` (or very low)
- Watch:
  - sustained `avgRiskScore >= 0.65`
  - `avgFlushQuality < 0.55`
- Action:
  - decrease rollout %
  - increase durability promotion for frequently used memories
  - enforce manual checkpointing for long sessions

## High-risk action recall guard
When `FATHIPPO_ENFORCE_HIGH_RISK_RECALL=true`, destructive actions require:
- header: `x-fathippo-recall-checked: true`

This is currently enforced on `memories.delete` and can be extended to other high-risk routes.
