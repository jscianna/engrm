# Semantic Compression Spec

**Author:** Vex  
**Date:** 2026-03-08  
**Status:** Draft

## Problem

FatHippo currently injects raw memory text into agent context. This:
1. Consumes more tokens than necessary
2. Provides episodic data instead of distilled knowledge
3. Doesn't mimic how human memory actually works

## Vision

**From:** Raw memories → inject whole text → many tokens  
**To:** Related memories → synthesize → distilled learning → inject essence → fewer tokens, same knowledge

This is *cognitive compression* — agents get wisdom, not transcripts.

---

## Data Model

### New Memory Type: `synthesized`

```typescript
interface SynthesizedMemory {
  id: string;
  userId: string;
  
  // The compressed learning
  synthesis: string;           // The distilled insight (50-200 tokens)
  title: string;              // Auto-generated title
  
  // Provenance
  sourceMemoryIds: string[];  // Which memories contributed
  sourceCount: number;        // How many source memories
  
  // Clustering info
  clusterId: string;          // Which cluster this belongs to
  clusterTopic: string;       // Auto-detected topic ("FatHippo Architecture")
  
  // Quality metrics
  compressionRatio: number;   // sourceTokens / synthesisTokens
  confidence: number;         // LLM confidence in synthesis (0-1)
  
  // Lifecycle
  synthesizedAt: string;
  lastValidatedAt: string;    // When we verified sources still exist
  stale: boolean;             // True if source memories changed since synthesis
  
  // Standard fields
  importanceTier: 'critical' | 'high' | 'normal';
  accessCount: number;
  createdAt: string;
}
```

### Schema Addition

```sql
CREATE TABLE synthesized_memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  synthesis TEXT NOT NULL,
  title TEXT NOT NULL,
  source_memory_ids TEXT NOT NULL,  -- JSON array
  source_count INTEGER NOT NULL,
  cluster_id TEXT NOT NULL,
  cluster_topic TEXT NOT NULL,
  compression_ratio REAL,
  confidence REAL,
  synthesized_at TEXT NOT NULL,
  last_validated_at TEXT NOT NULL,
  stale INTEGER DEFAULT 0,
  importance_tier TEXT DEFAULT 'normal',
  access_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_synth_user ON synthesized_memories(user_id);
CREATE INDEX idx_synth_cluster ON synthesized_memories(cluster_id);
CREATE INDEX idx_synth_importance ON synthesized_memories(user_id, importance_tier);
```

---

## Synthesis Pipeline

### 1. Clustering

Group memories by semantic similarity:

```typescript
async function clusterMemories(userId: string): Promise<Cluster[]> {
  // Get all memories
  const memories = await getAllMemories(userId);
  
  // Use embeddings to cluster
  // Algo: HDBSCAN or K-means with silhouette optimization
  // Min cluster size: 3 memories
  // Max cluster size: 20 memories
  
  return clusters;
}
```

**Clustering strategy:**
- Primary: Entity overlap (memories sharing entities)
- Secondary: Embedding cosine similarity (> 0.75 threshold)
- Tertiary: Temporal proximity (same day/week)

### 2. Synthesis Prompt

For each cluster, generate a synthesis:

```typescript
const SYNTHESIS_PROMPT = `
You are synthesizing multiple memories into a single distilled learning.

## Source Memories
${memories.map(m => `- ${m.title}: ${m.text}`).join('\n')}

## Instructions
1. Extract the CORE INSIGHT or DECISION from these memories
2. Preserve any specific values, numbers, or critical details
3. Write in declarative, present-tense style
4. Target length: 2-4 sentences (50-150 tokens)
5. Do NOT include phrases like "Based on the memories..." — write directly

## Output Format
TOPIC: <1-3 word topic>
SYNTHESIS: <the distilled learning>
CONFIDENCE: <0.0-1.0 how confident you are this captures the essence>
`;
```

### 3. Example

**Input memories:**
1. "FatHippo uses AES-256-GCM encryption with per-user keys..."
2. "Removed ZK/vault complexity because agents need readable memory..."
3. "Never sacrifice encryption for performance..."
4. "API key controls access, not encryption..."

**Output synthesis:**
```
TOPIC: FatHippo Security Model
SYNTHESIS: FatHippo uses server-side AES-256-GCM encryption with per-user 
derived keys. Security is enforced at rest (DB breach = encrypted blobs only), 
not in transit. API keys control access; encryption is mandatory and never 
sacrificed for performance.
CONFIDENCE: 0.95
```

**Result:** 4 memories (400+ tokens) → 1 synthesis (60 tokens). **6.7x compression.**

---

## Injection Strategy

### Tiered Recall

```typescript
async function getContext(userId: string, query: string): Promise<Context> {
  // 1. First, search synthesized memories
  const syntheses = await searchSyntheses(userId, query, limit: 5);
  
  // 2. If confidence is high, inject syntheses only
  if (syntheses.every(s => s.confidence >= 0.8)) {
    return { syntheses, rawMemories: [] };
  }
  
  // 3. If confidence is low, supplement with raw memories
  const rawMemories = await searchRawMemories(userId, query, limit: 3);
  
  return { syntheses, rawMemories };
}
```

### Injection Format

```
## What I Know (Synthesized)
- **Security Model:** FatHippo uses server-side AES-256-GCM encryption...
- **API Design:** Dead simple API. Two endpoints matter: store and recall...

## Specific Memories
<only if confidence < 0.8 or query is very specific>
```

---

## Dream Cycle Integration

### Current Dream Cycle:
- Finds bonds (entity overlap)
- Suggests promotions
- Does NOT synthesize

### Enhanced Dream Cycle:

```typescript
async function runDreamCycle(userId: string): Promise<DreamCycleResult> {
  // 1. Standard bond finding
  const bonds = await findBonds(userId);
  
  // 2. Cluster memories
  const clusters = await clusterMemories(userId);
  
  // 3. For each cluster with 3+ memories, synthesize
  const syntheses = [];
  for (const cluster of clusters) {
    if (cluster.memories.length >= 3) {
      // Check if synthesis already exists and is fresh
      const existing = await getSynthesisForCluster(cluster.id);
      if (!existing || existing.stale) {
        const synthesis = await synthesize(cluster);
        syntheses.push(synthesis);
      }
    }
  }
  
  // 4. Validate existing syntheses (mark stale if sources changed)
  await validateSyntheses(userId);
  
  return { bonds, syntheses, validated: true };
}
```

---

## API Changes

### New Endpoint: GET /api/v1/syntheses

```typescript
// List all synthesized memories
GET /api/v1/syntheses
Response: { syntheses: SynthesizedMemory[] }

// Get synthesis details with source memories
GET /api/v1/syntheses/:id
Response: { synthesis: SynthesizedMemory, sources: Memory[] }
```

### Modified: POST /api/v1/context

```typescript
// Add option to prefer syntheses
POST /api/v1/context
Body: {
  message: string,
  preferSyntheses: boolean,  // NEW: default true
  synthesisConfidenceThreshold: number  // NEW: default 0.8
}
```

---

## UI Changes

### Dashboard: New "Learnings" Tab

- Shows all synthesized memories
- Click to expand and see source memories
- "Refresh" button to re-synthesize
- Badge showing compression ratio

### Dream Cycle Modal

- After clustering, show: "Found 5 topics to synthesize"
- Preview each synthesis before saving
- Option to edit synthesis before committing

---

## Privacy Considerations

1. **Synthesis uses LLM** → Same as current entity extraction
2. **Encrypted at rest** → Syntheses encrypted like regular memories
3. **No new data exposure** → Synthesis derived from existing memories

---

## Metrics to Track

1. **Compression ratio:** avg tokens saved per synthesis
2. **Synthesis hit rate:** % of queries answered by syntheses alone
3. **Confidence distribution:** histogram of synthesis confidence scores
4. **Staleness rate:** % of syntheses that become stale over time

---

## Implementation Phases

### Phase 1: Schema + Basic Synthesis
- Add `synthesized_memories` table
- Implement clustering (entity-based first)
- Add synthesis prompt and LLM call
- Dream Cycle integration

### Phase 2: Injection
- Modify `/context` to prefer syntheses
- Add confidence-based fallback to raw memories
- Measure token savings

### Phase 3: UI + Polish
- Dashboard "Learnings" tab
- Synthesis preview in Dream Cycle
- Analytics: compression metrics

---

## Open Questions

1. **How often to re-synthesize?** On source memory change? Nightly? On demand?
2. **What if a synthesis becomes inaccurate?** User feedback mechanism?
3. **Should syntheses be editable by users?** (leaning yes)
4. **How to handle conflicting information in source memories?**
