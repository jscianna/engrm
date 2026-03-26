# Wave 2 — Contradiction + Confidence Rollout

## What was added

1. Memory schema fields (with safe defaults):
- `confidence_score` (default `0.6`)
- `superseded_by`
- `conflicts_with_json`
- `last_verified_at`

2. Retrieval ranking updated to multiplicative scoring:

```text
final_score = relevance * quality * freshness * confidence
```

Where:
- `quality` = feedback/access/entity-derived score
- `freshness` = time-decay score (recency aware)
- `confidence` = memory confidence score

3. Superseded memories are excluded by default in retrieval pipelines.

4. New DB helpers:
- `markMemorySuperseded(...)`
- `setMemoryConflicts(...)`

## Backward compatibility
- Existing memories automatically receive default confidence behavior.
- No destructive migration required.

## Next steps
- Add API endpoints to set supersession/conflicts from review UI.
- Add contradiction-review dashboard with manual adjudication flow.
