# Wave 3 — Adaptive Rewrite + Topic Graph Maintenance

## 1) Adaptive rewrite pipeline

When `simple/remember` rejects low-quality/noisy input, the response now includes:

- `rewrite_suggestion.candidate_text`
- `rewrite_suggestion.reason`

This gives callers a salvage path: resubmit the distilled durable sentence instead of dropping all signal.

### Files
- `src/lib/memory-rewrite.ts`
- `src/lib/turn-capture.ts`
- `src/app/api/v1/simple/remember/route.ts`

## 2) Topic graph maintenance job

New maintenance job to detect likely similarity/entity relationships and propose/create edges.

### Commands

```bash
# Dry run
FATHIPPO_API_KEY=... npm run memory:topic-graph

# Apply edge creation
FATHIPPO_API_KEY=... npm run memory:topic-graph:apply
```

### Files
- `scripts/topic_graph_maintenance.mjs`

### Output
- `artifacts/topic_graph_maintenance/plan-*.json`

## 3) Micro-dream graph upgrades

Micro-dream now uses Wave 2 fields for merge/contradiction outcomes and creates graph edges:

- merge -> `updates` edge
- contradiction -> `contradicts` edge

### File
- `src/lib/micro-dream.ts`
