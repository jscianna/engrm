# Memory Quality Hardening Plan (Post-Incident)

## What we learned

1. Heuristic-first memory admission let semantic-looking noise pass.
2. Tool/system wrappers contained keywords that looked durable.
3. Assistant/tool/system role leakage polluted long-term memory.
4. Cleanup loops are expensive; prevention must be stricter than purge.
5. Synthesis quality depends directly on raw memory quality.

## Plan

### 1) Admission Control (implemented)
- Default to `captureUserOnly = true`.
- Unified candidate evaluator (`evaluateMemoryCandidate`) with explicit decision reasons.
- Denylist-first blocking for wrappers/logs/code/metadata.
- Positive-signal gate for durable statements only.
- Assistant messages require explicit durable phrasing.

### 2) Operational Policy (implemented)
- Keep hard denylist for known incident classes (media wrappers, ACP scaffolding, CI snippets, CSS/html artifacts).
- Prefer iterative purge scripts with backoff under rate limits.

### 3) Verification (implemented)
- Added unit tests for admission decisions:
  - reject wrappers
  - reject code
  - accept durable user preference
  - reject non-explicit assistant
  - accept explicit assistant durable statement

### 4) Next steps (recommended)
- Add model-gated review for borderline candidates (only if heuristic score in gray zone).
- Add nightly curation job:
  - demote/archive low-value memories
  - synthesize high-confidence clusters
- Add `/api/v1/memories/cleanup` admin endpoint with date + regex selectors.

## Success criteria
- Zero known wrapper/log/code artifacts entering durable memory for 7 consecutive days.
- >90% of retained memories classified as durable by spot-check rubric.
- Synthesis outputs remain stable after cleanup reruns.
