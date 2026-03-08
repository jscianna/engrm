# Context Injection Review

Based on `PRODUCT_PRINCIPLES.md`, this is a focused review of:
- `src/app/api/v1/simple/context/route.ts`
- `src/lib/memories.ts` (context retrieval functions)
- `packages/context-engine/src/engine.ts`

## Executive Summary

Current behavior is **over-injecting** in both the API route and context engine.

Main issues:
- Critical memories are injected by default even when query intent is weak or trivial.
- Retrieval is mostly top-K based, with no minimum relevance threshold.
- There is no explicit "silence beats noise" gate for low-information queries.
- Several hardcoded numeric limits are acting like policy instead of adaptive defaults.

Net: this violates "Never make agents worse" and "Silence beats noise" in edge cases and likely in common short-query flows.

## 1) Are we injecting only when it genuinely improves responses?

### Findings

1. `simple/context` always loads and can inject critical memories regardless of query quality.
   - Evidence: critical retrieval happens unconditionally in route handler before relevance gating (`route.ts:52-80`), and then is included in output whenever any critical exists (`route.ts:193-199`).

2. When ranking critical memories, unmatched slots are backfilled with remaining critical memories.
   - Evidence: fallback fill logic (`route.ts:99-106`) inserts non-matching memories to hit `maxCritical`.
   - Impact: guaranteed context density even when match quality is low.

3. Context engine `assemble()` injects critical by default even without a strong user query.
   - Evidence: `injectCritical !== false` branch (`engine.ts:205-225`) runs independent of relevance score or query intent.

4. Engine search appends results directly and dedupes, but does not apply thresholding after retrieval.
   - Evidence: `client.search(...limit...)` + `dedupeMemories([...])` (`engine.ts:228-237`).

### Recommendation

Adopt a two-stage gate before injection:
- Stage A: query-worthiness gate (length/content/intent confidence).
- Stage B: relevance-quality gate (minimum score and margin from tail).

If either gate fails: inject nothing.

## 2) Is relevance scoring aggressive enough?

### Findings

1. No minimum vector similarity cutoff in `simple/context` retrieval.
   - Evidence: vector hits are accepted by rank only (`route.ts:122-129`, `153`).

2. No minimum BM25 or fused-score cutoff.
   - Evidence: fused list is sliced by top-N only (`route.ts:147-156`) and then loaded.

3. Critical ranking uses set membership from top results, not per-memory score threshold.
   - Evidence: ID membership filter (`route.ts:94-97`) then fallback fill (`99-106`).

4. `searchMemories()` in `memories.ts` returns ranked results without score floor.
   - Evidence: hits mapped and returned directly (`memories.ts:346-361`).

### Recommendation

Use explicit relevance constraints:
- Vector min score (example: start with 0.78 for normal memory injection, tune empirically).
- BM25 min score / normalized percentile floor.
- Fused score floor plus tail-drop (e.g., drop anything under 70% of top fused score).
- Enforce stricter thresholds for critical fallback than for semantically-matched critical.

## 3) Are we respecting "silence beats noise"?

### Findings

1. Trivial messages still trigger embedding/search and potential injection.
   - Evidence: only checks `if (message)` (`route.ts:38`, `116`); no triviality guard.

2. If `message` is empty, critical context can still be injected due to unconditional critical load/slice.
   - Evidence: else branch uses `allCritical.slice(0, maxCritical)` (`route.ts:109-111`).

3. Engine `assemble()` can inject cached/fetched critical even if last user message is missing or weak.
   - Evidence: critical branch independent of `lastUserMessage` (`engine.ts:205-225`), and output always carries `systemPromptAddition` when non-empty (`engine.ts:247-251`).

### Recommendation

Add a silence-first policy:
- For short/trivial inputs (`"ok"`, `"thanks"`, `"yes"`, emoji-only, punctuation-only), skip retrieval and inject nothing.
- For no-message calls to `/simple/context`, return empty context (not critical defaults), unless a caller opts in via explicit high-signal mode.
- Add a minimum expected utility check (e.g., estimated tokens saved/improvement proxy) before final injection.

## 4) Hardcoded limits: should these be soft guidelines?

### Findings

Hardcoded values currently shape behavior as fixed policy:
- `maxCritical` default 5, cap 10 (`route.ts:49`)
- `maxRelevant` default 5, cap 10 (`route.ts:50`)
- vector/BM25 topK 20 (`route.ts:126`, `136`)
- fused output cut to 10 (`route.ts:151`, `153`, `155`)
- critical search topK `maxCritical * 2` (`route.ts:90`)
- engine critical fetch limit 15 (`engine.ts:214`)
- engine search limit `injectLimit || 20` (`engine.ts:231`)
- `searchMemories` topK 15 (`memories.ts:339`)

These are reasonable starting defaults, but they are currently rigid and untied to:
- query complexity,
- available token budget,
- observed relevance distribution,
- historical injection efficacy.

### Recommendation

Convert fixed caps into adaptive heuristics:
- Compute candidate pool size from token budget and query entropy.
- Dynamically shrink or expand based on score distribution quality.
- Maintain hard safety ceilings, but treat defaults as tunable policy constants.
- Add telemetry-driven tuning loops (precision@k of injected memories, accept/reject proxy, downstream response quality signals).

## File-Specific Notes

### `src/app/api/v1/simple/context/route.ts`
- Biggest over-injection risk due to unconditional critical fetch + fallback fill.
- Should add pre-retrieval triviality gating and post-retrieval threshold pruning.
- Should avoid injecting anything when confidence is low.

### `src/lib/memories.ts`
- `searchMemories()` and `getRelatedMemories()` are retrieval primitives without relevance floor.
- That is acceptable as low-level utilities if callers enforce thresholds, but current callers often do not.
- Recommend either:
  - add optional threshold parameters in these functions, or
  - clearly mark them as raw retrieval and force gating at injection boundaries.

### `packages/context-engine/src/engine.ts`
- `assemble()` defaults to injecting critical memory every turn if enabled.
- Should include query-worthiness gating and score-based pruning before `formatMemoriesForInjection()`.
- `bootstrap()` prefetch is fine for latency, but prefetch should not imply automatic injection.

## Recommended Change Set (Implementation Plan, not executed)

1. Add `isTrivialQuery(message)` and `shouldAttemptInjection(message)` gates in both route and engine.
2. Add relevance thresholds for vector, BM25, and fused rankings.
3. Remove critical fallback fill that injects non-matching items just to hit count targets.
4. Make limits adaptive to token budget and score quality; keep hard upper bounds only as safety rails.
5. Add no-context fast path for empty/trivial messages.
6. Add analytics for injection precision and "no-injection" decisions to validate principle alignment.

## Principle Alignment Verdict

- **Privacy is sacred**: no clear violations in reviewed code.
- **Never make agents worse**: currently at risk due to over-injection of weakly relevant context.
- **Silence beats noise**: currently under-enforced.
- **Relevance over recency**: intent is present, but weak thresholding allows low-relevance memory through.
- **Automagical > configurable**: good direction, but defaults need stricter quality gating to be trustworthy.
