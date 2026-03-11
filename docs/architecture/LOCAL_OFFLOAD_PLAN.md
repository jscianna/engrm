# Local Task Offloading Architecture Plan

**Status:** Draft  
**Last Updated:** 2026-03-11  
**Author:** Architecture Team  

---

## Executive Summary

This document defines the architecture for offloading memory operations from the FatHippo hosted service to local/client-side execution. The goal is to enable sub-100ms retrieval latency for the 80% use case while maintaining zero-knowledge privacy guarantees.

---

## Current State (Baseline)

### Current Data Flow (Fully Hosted)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT SIDE                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   Capture    │───▶│   Filter     │───▶│   API Call   │──────────────────┤
│  │   Request    │    │   (Basic)    │    │   (HTTPS)    │                  │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
│                                                                            │
│  Latency contribution: ~50-200ms network RTT per operation                 │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            HOSTED SERVICE                                    │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │   Encrypt    │───▶│   Embed      │───▶│   Store      │───▶│  Turso/   │  │
│  │   (AES-GCM)  │    │   (OpenAI)   │    │   (DB)       │    │  Qdrant   │  │
│  └──────────────┘    └──────────────┘    └──────────────┘    └───────────┘  │
│                                                                            │
│  Total latency: 100-500ms per capture/search                               │
└────────────────────────────────────────────────────────────────────────────┘
```

### Current Pain Points

1. **Latency**: Every memory operation requires network round-trip (50-300ms)
2. **Bandwidth**: Embeddings (1536 dims × 4 bytes = 6KB per vector) transmitted on every search
3. **Cost**: OpenAI embedding API calls for every capture
4. **Offline**: No memory access when disconnected

---

## Target Architecture (Edge-First Pipeline)

### Design Principles

1. **Privacy First**: Encryption/decryption stays client-side
2. **Latency Budget**: P99 < 100ms for local operations
3. **Graceful Degradation**: Works offline, syncs when connected
4. **Incremental Adoption**: Can run alongside existing hosted flow

### Edge-First Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT SIDE (Local Hippo)                          │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     CAPTURE PIPELINE                                  │   │
│  │  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐          │   │
│  │  │  Input   │──▶│ Heuristic│──▶│  Local   │──▶│  Local   │          │   │
│  │  │  Text    │   │  Scoring │   │  Embed   │   │  Encrypt │          │   │
│  │  └──────────┘   └──────────┘   └──────────┘   └────┬─────┘          │   │
│  │         │              │              │             │                │   │
│  │         │              │              │             ▼                │   │
│  │         │              │              │      ┌──────────┐            │   │
│  │         │              │              │      │ Hot Cache│            │   │
│  │         │              │              │      │ (LRU)    │            │   │
│  │         │              │              │      └────┬─────┘            │   │
│  │         │              │              │           │                  │   │
│  │         ▼              ▼              ▼           ▼                  │   │
│  │  [Skip < 6.0]    [transformers.js]  [AES-GCM]  [Sync Queue]         │   │
│  │                                     384-dim                        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    RETRIEVAL PIPELINE                                 │   │
│  │  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐          │   │
│  │  │  Query   │──▶│  Local   │──▶│  Local   │──▶│  Results │          │   │
│  │  │  Text    │   │  Embed   │   │  Search  │   │ (Cached) │          │   │
│  │  └──────────┘   └──────────┘   └────┬─────┘   └──────────┘          │   │
│  │         │              │             │                               │   │
│  │         │              │             ▼                               │   │
│  │         │              │      ┌──────────────┐                      │   │
│  │         │              │      │  Local Index │                      │   │
│  │         │              │      │  (HNSW)      │                      │   │
│  │         │              │      │  10k vectors │                      │   │
│  │         │              │      └──────────────┘                      │   │
│  │         │              │                                             │   │
│  │         ▼              ▼              ▼                               │   │
│  │  [Skip trivial]  [transformers.js]  [Cache Miss?]                     │   │
│  │                                     ├─ Yes ─▶ Hosted Search          │   │
│  │                                     └─ No ───▶ Return Local          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Latency target: < 50ms for local cache hits                                 │
│  Latency target: < 100ms for local search                                    │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              │                                           │
              ▼                                           ▼
┌─────────────────────────────────┐    ┌─────────────────────────────────────┐
│      SYNC (Background)          │    │      HOSTED RERANK (Optional)       │
│  ┌───────────────────────────┐  │    │  ┌───────────────────────────────┐  │
│  │  Encrypted Queue          │  │    │  │  Cold Storage Search          │  │
│  │  • Batched writes         │  │    │  │  • Full vector database       │  │
│  │  • Conflict resolution    │  │    │  │  • Advanced reranking         │  │
│  │  • Delta sync             │  │    │  │  • Cross-device aggregation   │  │
│  └───────────────────────────┘  │    │  └───────────────────────────────┘  │
│                                 │    │                                     │
│  Latency: N/A (async)           │    │  Latency: +50-150ms                 │
│                                 │    │  Used when: local cache miss        │
└─────────────────────────────────┘    │  or low confidence results          │
                                       └─────────────────────────────────────┘
```

---

## Component Boundaries

### What Runs Local vs Hosted

| Component | Local | Hosted | Notes |
|-----------|-------|--------|-------|
| **Capture Filtering** | ✅ | ❌ | Heuristic scoring runs locally (score < 6.0 skips) |
| **Embedding Generation** | ✅ | Fallback | transformers.js (384-dim) local, OpenAI remote |
| **Encryption/Decryption** | ✅ | ❌ | AES-256-GCM always client-side |
| **Hot Cache** | ✅ | ❌ | LRU cache of recent memories (last 100) |
| **Local Vector Search** | ✅ | ❌ | HNSW index for up to 10k vectors |
| **Cold Storage Search** | ❌ | ✅ | Full Qdrant database for archive |
| **Cross-Device Sync** | ❌ | ✅ | Hosted coordination required |
| **Reranking** | ⚠️ | ✅ | Local for speed, hosted for quality |
| **Pattern Extraction** | ❌ | ✅ | Cognitive engine proprietary |
| **Dream Cycle** | ❌ | ✅ | Synthesis/decay runs hosted |

### Local Storage Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LOCAL STORAGE LAYERS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LAYER 1: HOT CACHE (Memory)                                                 │
│  ├── Max 100 memories                                                        │
│  ├── LRU eviction                                                            │
│  ├── Latency: < 1ms                                                          │
│  └── Use case: Critical memories, recent context                             │
│                                                                              │
│  LAYER 2: LOCAL INDEX (IndexedDB)                                           │
│  ├── Max 10,000 vectors                                                      │
│  ├── HNSW index for approximate search                                       │
│  ├── Storage: ~40MB (10k × 384 dims × 4 bytes)                              │
│  ├── Latency: 5-20ms                                                         │
│  └── Use case: Working set of active memories                                │
│                                                                              │
│  LAYER 3: ENCRYPTED QUEUE (IndexedDB)                                       │
│  ├── Batched pending writes                                                  │
│  ├── Compressed delta format                                                 │
│  └── Use case: Offline capture, sync on reconnect                            │
│                                                                              │
│  LAYER 4: HOSTED STORAGE (Turso + Qdrant)                                   │
│  ├── Unlimited capacity                                                      │
│  ├── Full vector search with reranking                                       │
│  ├── Cross-device synchronization                                            │
│  └── Latency: 50-300ms (network dependent)                                   │
│                                                                              │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Latency Budget Targets

### Per-Stage Budgets

| Stage | Target | P99 Limit | Notes |
|-------|--------|-----------|-------|
| **Capture Pipeline** | | | |
| Heuristic scoring | 5ms | 10ms | Regex + simple scoring |
| Local embedding | 50ms | 100ms | transformers.js, warmed model |
| Local encryption | 2ms | 5ms | AES-GCM in Web Crypto |
| Cache write | 1ms | 2ms | Memory write |
| **Total capture (local)** | **58ms** | **117ms** | End-to-end without sync |
| | | | |
| **Retrieval Pipeline** | | | |
| Local embedding | 50ms | 100ms | Same model as capture |
| Local search (HNSW) | 10ms | 20ms | 10k vectors, top-k=20 |
| Decryption | 2ms | 5ms | AES-GCM decrypt |
| **Total retrieval (local)** | **62ms** | **125ms** | Cache hit path |
| | | | |
| **Hosted Fallback** | | | |
| Network RTT | 50ms | 150ms | Geographic variance |
| Server processing | 50ms | 100ms | Qdrant search + rerank |
| **Total hosted** | **100ms** | **250ms** | When local misses |

### End-to-End Flow Budgets

```
Scenario A: Local Cache Hit (80% of queries)
┌────────────────────────────────────────────────────────────────┐
│  Input ──▶ Embed ──▶ Cache Lookup ──▶ Return                   │
│   0ms       50ms        1ms           ─                        │
│                                                        Total: 51ms│
└────────────────────────────────────────────────────────────────┘

Scenario B: Local Search (15% of queries)
┌────────────────────────────────────────────────────────────────┐
│  Input ──▶ Embed ──▶ HNSW Search ──▶ Decrypt ──▶ Return       │
│   0ms       50ms        10ms           2ms        ─            │
│                                                        Total: 62ms│
└────────────────────────────────────────────────────────────────┘

Scenario C: Hosted Fallback (5% of queries)
┌────────────────────────────────────────────────────────────────┐
│  Input ──▶ Embed ──▶ Local Miss ──▶ Hosted Search ──▶ Return  │
│   0ms       50ms        1ms           150ms          ─         │
│                                                        Total: 201ms│
└────────────────────────────────────────────────────────────────┘

Weighted Average Latency:
  (80% × 51ms) + (15% × 62ms) + (5% × 201ms) = 61.5ms
```

---

## Failure Modes and Fallback Behavior

### Failure Mode Matrix

| Failure | Detection | Local Behavior | Hosted Behavior | Recovery |
|---------|-----------|----------------|-----------------|----------|
| **Local index full** | Size check | Evict oldest 10% | N/A | Async sync to hosted |
| **Embedding model not loaded** | Timeout | Queue for remote embed | Use OpenAI API | Background model load |
| **Hosted unreachable** | Connection error | Continue local-only | N/A | Exponential backoff retry |
| **Sync queue full** | Queue depth | Pause captures, alert | N/A | Drain queue, notify user |
| **Decryption failure** | Auth tag invalid | Skip memory, log | Return encrypted blob | Key rotation |
| **HNSW corruption** | Index check | Rebuild from hosted | N/A | Background reindex |
| **Cache poisoning** | Checksum fail | Clear cache, refetch | N/A | N/A |

### Graceful Degradation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FAILURE HANDLING FLOW                                     │
│                                                                              │
│  ┌─────────────────┐                                                        │
│  │  Operation      │                                                        │
│  │  Requested      │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │  Try Local      │────▶│  Local Success? │────▶│  Return Result  │       │
│  │  Execution      │     │                 │     │                 │       │
│  └─────────────────┘     └────────┬────────┘     └─────────────────┘       │
│                                   │                                          │
│                          ┌────────┴────────┐                                │
│                          │                 │                                │
│                    Failure│           Success│                              │
│                          ▼                 ▼                                │
│                 ┌─────────────────┐  (normal path)                         │
│                 │  Check Failure  │                                        │
│                 │  Type           │                                        │
│                 └────────┬────────┘                                        │
│                          │                                                  │
│           ┌──────────────┼──────────────┬──────────────┐                    │
│           │              │              │              │                    │
│           ▼              ▼              ▼              ▼                    │
│    ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐               │
│    │Critical  │   │Recoverable│   │Network   │   │Resource  │               │
│    │(Crypto)  │   │(Index)   │   │Issue     │   │Exhausted │               │
│    └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘               │
│         │              │              │              │                       │
│         ▼              ▼              ▼              ▼                       │
│    ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐               │
│    │  FAIL    │   │ Rebuild  │   │ Fallback │   │  Queue   │               │
│    │  FAST    │   │  Index   │   │  Hosted  │   │  Alert   │               │
│    │          │   │          │   │          │   │          │               │
│    │ Notify   │   │ Use      │   │ If       │   │ Continue │               │
│    │ User     │   │ Hosted   │   │ Available│   │ Local    │               │
│    └──────────┘   └──────────┘   └──────────┘   └──────────┘               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Offline Mode Behavior

When hosted service is unreachable:

1. **Capture**: Store locally with timestamp, queue for sync
2. **Retrieval**: Search local index only, mark results as "local-only"
3. **UI Indicator**: Show "offline mode" badge with pending sync count
4. **Sync on Reconnect**: Batch upload queued operations with conflict resolution

---

## Security and Privacy Boundaries

### Zero-Knowledge Guarantees (Maintained)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PRIVACY BOUNDARIES                                        │
│                                                                              │
│  CLIENT (TRUSTED)          │           HOSTED (ZERO-KNOWLEDGE)               │
│  ──────────────────────────┼────────────────────────────────────            │
│  • Plaintext content       │           • Encrypted blobs only                │
│  • Encryption keys         │           • Vector embeddings                   │
│  • Search queries          │           • No query text                       │
│  • Heuristic scores        │           • No filtering logic                  │
│                                                                              │
│  NEVER LEAVES CLIENT:      │           NEVER SEES PLAINTEXT:                 │
│  • Vault password          │           • Memory content                      │
│  • Decryption keys         │           • User queries                        │
│  • Raw embedding model     │           • Heuristic scores                    │
│                                                                              │
└────────────────────────────────────────────────────────────────────────────┘
```

### Threat Model Updates

| Threat | Before (Hosted) | After (Local First) | Mitigation |
|--------|-----------------|---------------------|------------|
| **Server breach** | Encrypted data exposed | Same | AES-256-GCM |
| **Network MITM** | TLS required | Same | TLS 1.3 |
| **Client malware** | N/A (server-side) | Local data at risk | Key derivation from user password |
| **Sync interception** | N/A | Encrypted blobs intercepted | Same encryption |
| **Local storage theft** | N/A | Encrypted blobs stolen | Key not stored with data |

### Key Management

```typescript
// Key Derivation Flow (Local Only)
userPassword ──▶ Argon2id ──▶ masterKey
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
             encryptionKey    hmacKey          indexKey
             (AES-GCM)       (integrity)      (search index)
```

---

## Implementation Notes

### Technology Choices

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Local embeddings | `@xenova/transformers` | Works offline, small model (~80MB), Apache 2.0 |
| Vector index | `hnswlib-wasm` or `usearch` | Fast ANN search, WASM for browser/Node |
| Local storage | IndexedDB (via `idb` wrapper) | Async, large capacity, widely supported |
| Encryption | Web Crypto API | Native, hardware-accelerated AES-GCM |
| Sync protocol | Protobuf + delta compression | Compact, efficient batching |

### Model Specifications

```yaml
Embedding Model:
  Name: Xenova/all-MiniLM-L6-v2
  Dimensions: 384
  Sequence Length: 256
  Size: ~80MB download
  Quantization: ONNX INT8
  Target Latency: < 100ms per query (CPU)
  
HNSW Index:
  Max Elements: 10,000 (configurable)
  M: 16 (connections per element)
  ef_construction: 200
  ef_search: 50
  Expected Recall: > 95% @ top-k=20
```

---

## Migration Path

### Phase 1: Add Local Layer (Backward Compatible)

```
Current:     Client ──▶ Hosted API ──▶ Storage
                ↓
Phase 1:     Client ──▶ Local Cache ──▶ Hosted API ──▶ Storage
                         (check first)
```

### Phase 2: Make Local Primary

```
Phase 2:     Client ──▶ Local Cache ──▶┬─▶ Return (hit)
                         (primary)    │
                                      └─▶ Hosted API ──▶ Storage (miss)
```

### Phase 3: Full Edge-First

```
Phase 3:     Client ──▶ Local Pipeline ──▶┬─▶ Return (local)
                                          │
                                          └─▶ Hosted Rerank (optional)
                                          │
                                          └─▶ Background Sync
```

---

## Success Metrics

| Metric | Baseline (Hosted) | Target (Local First) |
|--------|-------------------|----------------------|
| P50 retrieval latency | 150ms | 50ms (-67%) |
| P99 retrieval latency | 400ms | 100ms (-75%) |
| Bandwidth per search | 6KB (embeddings) | 0KB (local) |
| Offline functionality | None | Full read/write |
| Hosting costs (embed) | $0.10/1K calls | $0 (local) |
| Cache hit rate | N/A | > 80% |

---

## Open Questions

1. **Conflict Resolution**: How to handle concurrent edits across devices?
2. **Index Size**: What happens when user exceeds 10k local vectors?
3. **Model Updates**: How to update embedding model without reindexing?
4. **Cross-Device Sync**: Real-time or batch? WebSockets or polling?
5. **Mobile Battery**: Impact of local embedding on mobile devices?

---

## Related Documents

- [PRODUCT_SPLIT_PLAN.md](./PRODUCT_SPLIT_PLAN.md) - Package structure for local/hosted split
- [IMPLEMENTATION_PHASES.md](../roadmap/IMPLEMENTATION_PHASES.md) - Week-by-week execution plan
- `packages/engrm-mcp/` - Existing MCP implementation with local embeddings
