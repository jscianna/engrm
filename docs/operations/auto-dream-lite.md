# Auto-Dream Lite (Wave 1)

Auto-Dream Lite is a deterministic nightly memory consolidation pass.

## Goals
- Detect and prune normalized duplicates
- Detect stale low-access memories (proposal mode)
- Detect contradiction pairs (proposal mode)
- Emit plan + decision ledger artifacts for auditability

## Commands

```bash
# Dry-run (recommended first)
FATHIPPO_API_KEY=... npm run memory:auto-dream

# Apply duplicate pruning
FATHIPPO_API_KEY=... npm run memory:auto-dream:apply
```

## Outputs

Artifacts are written to `artifacts/auto_dream_lite/`:
- `plan-<timestamp>.json` (summary + proposed mutations)
- `ledger-<timestamp>.jsonl` (execution events)

## Metrics emitted
- `duplicate_rate`
- `contradiction_rate`
- `stale_memory_rate`
- `index_compactness`

## Recommended rollout
1. Run dry mode for 48h.
2. Review contradiction proposals manually.
3. Enable apply mode only for duplicate pruning.
4. Keep stale/contradiction actions in proposal mode until confidence is high.
