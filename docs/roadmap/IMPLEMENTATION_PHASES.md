# Implementation Phases

## Phase 1 (Weeks 1-2): Local-first retrieval + hot cache
**Scope**
- Local capture filter + trivial/noise bypass
- Local embedding + local vector index
- Hot memory cache (LRU)
- Edge-first retrieval path with fallback to hosted

**Dependencies**
- Stable core interfaces
- Local storage/index choice (IndexedDB/HNSW)

**Risks**
- Index quality drift vs hosted
- Device perf variance

**Success Metrics**
- P50 retrieval < 70ms (local path)
- Cache hit rate > 70%
- No regression in relevance@k

---

## Phase 2 (Weeks 3-4): Hosted rerank/HyDE + sync
**Scope**
- Optional hosted rerank/HyDE for low-confidence queries
- Background encrypted sync queue (batch + retry)
- Conflict resolution policy
- Usage metering hooks

**Dependencies**
- Auth/plan entitlements for hosted users
- Sync protocol schema

**Risks**
- Sync edge cases (offline edits)
- Cost spikes from rerank/HyDE

**Success Metrics**
- >80% ops served locally or cached
- Hosted fallback p95 < 250ms
- Sync success > 99%

---

## Phase 3 (Weeks 5-7): Cognition group learnings + governance
**Scope**
- Org-scoped pattern graph
- Transfer only validated patterns (quality threshold)
- Policy controls: opt-in sharing, redaction, audit trails
- Admin visibility + rollback

**Dependencies**
- Org tenant model
- Policy engine + event logging

**Risks**
- Cross-tenant contamination risk
- Explainability of transferred patterns

**Success Metrics**
- +X% task success in repeated domains
- Zero policy violations
- Measurable reduction in time-to-resolution

---

## Cross-phase Guardrails
- Backward-compatible APIs only
- Keep cognitive internals private
- Add A/B flags to every new retrieval feature
- Instrument latency, relevance, and cost from day one