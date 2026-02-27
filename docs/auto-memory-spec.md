# Auto-Memory Extraction Spec v2

## Overview

Automatic memory formation for AI agents. The agent extracts, scores, and encrypts memories client-side before sending to MEMRY. Zero LLM cost on MEMRY's side. True zero-knowledge preserved.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        AGENT SIDE                           │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ Conversation│───▶│  Extractor   │───▶│ Importance    │  │
│  │   Context   │    │  (patterns)  │    │ Scorer        │  │
│  └─────────────┘    └──────────────┘    └───────┬───────┘  │
│                                                  │          │
│                                    score >= 6.0?            │
│                                         │                   │
│                     ┌───────────────────▼───────────────┐   │
│                     │  Encrypt + Embed (client-side)    │   │
│                     └───────────────────┬───────────────┘   │
└─────────────────────────────────────────┼───────────────────┘
                                          │
                                          ▼
┌──────────────────────────────────────────────────────────────┐
│                       MEMRY (ZK)                             │
│  Receives: encrypted blob + embedding vector                 │
│  Never sees: plaintext content                               │
│  Does: similarity linking, reinforcement, decay, retrieval   │
└──────────────────────────────────────────────────────────────┘
```

---

## Scoring Formula

```
Final_Score = Base_Heuristic_Score (0-7) 
            + Context_Modifiers (0-2) 
            + Reinforcement_Bonus (0-1)
            
Type_Adjusted = Final_Score * Type_Multiplier

Threshold: ≥6.0 for storage
```

All scoring uses **deterministic algorithms only** (regex, lexicons, embeddings) — no LLM at extraction time.

---

## 1. Importance Heuristics (Base Score: 0-7)

### A. Explicit Memory Markers (+3.0)
Highest signal — user explicitly wants to remember.

```typescript
const EXPLICIT_MARKERS = [
  // Declarative anchors
  /\b(remember|don't forget|note this|important|keep in mind)\b/i,
  // Identity assertions  
  /\b(my name is|I work at|I'm a|I have|my [a-z]+ is)\b/i,
  // Preference declarations
  /\b(I (love|hate|prefer|always|never))\b/i,
  // Procedural triggers
  /\b(here's how|the steps are|to fix this|the way to)\b/i,
];
```

### B. Entity Density & Novelty (+0-2.0)

```typescript
function entityScore(text: string, entities: string[]): number {
  const density = entities.length / text.split(' ').length;
  return Math.min(2.0, density * 4);
}

function noveltyScore(embedding: number[], existingMemories: Memory[]): number {
  const nearest = findNearest(embedding, existingMemories);
  const distance = 1 - cosineSimilarity(embedding, nearest.embedding);
  return distance > 0.7 ? 1.5 : distance * 2;
}
```

### C. Emotional Intensity (+0-1.5)
Use VADER lexicon or simple keyword matching:

```typescript
const HIGH_AROUSAL = ['amazing', 'terrible', 'love', 'hate', 'incredible', 
                       'disaster', 'perfect', 'worst', 'best', 'crucial'];
const INTENSITY_MARKERS = ['!', '!!', '!!!', 'SO', 'VERY', 'REALLY'];

function emotionalScore(text: string): number {
  let score = 0;
  for (const word of HIGH_AROUSAL) {
    if (text.toLowerCase().includes(word)) score += 0.5;
  }
  score += (text.match(/!/g) || []).length * 0.2;
  return Math.min(1.5, score);
}
```

### D. Decision & Commitment Markers (+2.0)

```typescript
const DECISION_MARKERS = [
  /\b(decided|chose|committed|going with|booked|ordered)\b/i,  // +1.0
  /\b(will|going to|must|need to|have to)\b/i,                  // +0.5
  /\b(finally|at last|resolved|settled on)\b/i,                 // +0.5
];
```

### E. Correction Signals (+1.5)
Corrections indicate high-fidelity information overwriting prior noise.

```typescript
const CORRECTION_MARKERS = [
  /\b(actually|no wait|I meant|correction|sorry,? I meant)\b/i,
  /\b(not .+,? but)\b/i,
];
```

### F. Temporal Specificity (+0-1.0)

```typescript
const TEMPORAL_PATTERNS = {
  absolute: /\b(\d{4}-\d{2}-\d{2}|January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+/i,  // +0.8
  relative: /\b(next|last|this)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|week|month)/i,  // +0.5
  cyclical: /\b(every|daily|weekly|monthly|annually|each morning)\b/i,  // +0.7
};
```

### G. Causality & Consequence (+1.0)

```typescript
const CAUSAL_MARKERS = [
  /\b(because|therefore|so that|in order to|as a result|this means)\b/i,
];
```

### H. Task Completion Signals (+1.0)

```typescript
const COMPLETION_MARKERS = [
  /\b(done|finished|completed|shipped|deployed|✓|✅)\b/i,  // +1.0
  /\b(failed|error|didn't work|broken)\b/i,                  // +0.8 (failures worth remembering)
];
```

---

## 2. Memory Type Taxonomy

7 types with importance multipliers:

| Type | Multiplier | Trigger Patterns | Halflife |
|------|-----------|------------------|----------|
| **constraint** | 1.3x | "cannot", "allergic", "deadline", "must not" | 180 days |
| **identity** | 1.2x | "I am", "my job", "as a [role]" | 120 days |
| **relationship** | 1.1x | "my friend", "colleague", "met with" | 30 days |
| **preference** | 1.0x | "prefer", "favorite", "hate" | 60 days |
| **how_to** | 1.0x | "how to", "steps", "process" | 120 days |
| **fact** | 0.9x | "is located", "has property" | 90 days |
| **event** | 0.8x | "happened", "met", "visited" | 14 days |

**Critical Safety Rule:** Constraints with medical/danger keywords always get +2.0 boost:
```typescript
const SAFETY_KEYWORDS = ['allergic', 'allergy', 'emergency', 'diabetic', 
                          'medication', 'epipen', 'blood type'];
```

---

## 3. Context Modifiers (+0-2.0)

### Conversational Gravity (+0-0.5)
```typescript
function conversationGravity(context: ConversationContext): number {
  let score = 0;
  if (context.messageCount > 20) score += 0.2;      // Deep conversation
  if (context.responseLatencyMs > 30000) score += 0.3;  // Careful thought
  if (context.wasEdited) score += 0.2;              // Refined message
  return Math.min(0.5, score);
}
```

### Position Bonus (+0-0.5)
```typescript
function positionBonus(position: 'opening' | 'middle' | 'closing' | 'after_pause'): number {
  switch (position) {
    case 'opening': return 0.3;   // Setting context
    case 'closing': return 0.3;   // Summary/decisions
    case 'after_pause': return 0.2;  // New topic
    default: return 0;
  }
}
```

### Emotional State (+0-0.5)
```typescript
function emotionalStateBonus(recentMessages: string[]): number {
  const capsRatio = recentMessages.join('').match(/[A-Z]/g)?.length || 0;
  const exclamations = recentMessages.join('').match(/!/g)?.length || 0;
  return Math.min(0.5, (capsRatio > 10 ? 0.2 : 0) + (exclamations > 3 ? 0.3 : 0));
}
```

---

## 4. Reinforcement Mechanism

**Core Insight:** Instead of deduplicating, repeated mentions STRENGTHEN memories.

### Similarity Threshold
When new memory has >0.85 cosine similarity to existing:
- Don't create new memory
- Reinforce existing memory instead

### Strength Update Formula (EMA)
```typescript
function reinforceMemory(existing: Memory, newMention: MentionContext): Memory {
  const triggerIntensity = newMention.heuristicScore / 10;
  
  // Exponential moving average
  const newStrength = (existing.strength * 0.7) + (triggerIntensity * 0.3);
  
  // Frequency boost (logarithmic saturation)
  const frequencyBoost = getFrequencyBoost(existing.mentionCount + 1);
  
  return {
    ...existing,
    strength: Math.min(newStrength * frequencyBoost, existing.baseStrength * 2.5),
    mentionCount: existing.mentionCount + 1,
    lastMentionedAt: new Date(),
    // Merge contexts
    entities: [...new Set([...existing.entities, ...newMention.entities])],
    sourceConversations: [...existing.sourceConversations, newMention.conversationId],
  };
}

function getFrequencyBoost(mentionCount: number): number {
  if (mentionCount === 1) return 1.0;
  if (mentionCount === 2) return 1.4;      // +40%
  if (mentionCount <= 5) return 1.4 + (mentionCount - 2) * 0.2;  // +20% each
  return Math.min(2.5, 1.4 + 0.6 + (mentionCount - 5) * 0.05);   // +5% each, cap 2.5x
}
```

### Spontaneous Recovery
Re-mentioning a memory after >30 days of silence triggers a bonus:
```typescript
if (daysSinceLastMention > 30) {
  memory.decayResistance += 1.5;  // Temporary boost
}
```

---

## 5. Memory Decay Model

Inspired by Ebbinghaus forgetting curve. Unused memories fade; accessed memories stabilize.

### Decay Formula
```typescript
function calculateCurrentStrength(memory: Memory): number {
  const daysSinceAccess = daysBetween(memory.lastAccessedAt, new Date());
  const retentionRate = 0.9;  // 90% retention per halflife period
  
  const decay = Math.pow(retentionRate, daysSinceAccess / memory.halflifeDays);
  return memory.baseStrength * decay;
}
```

### Type-Specific Halflives
```typescript
const HALFLIFE_DAYS: Record<MemoryType, number> = {
  constraint: 180,   // Safety info persists longest
  how_to: 120,       // Procedures decay slowly
  identity: 120,     // Core self-concept stable
  fact: 90,          // Encyclopedic knowledge
  preference: 60,    // Tastes can change
  relationship: 30,  // Social data needs maintenance
  event: 14,         // Episodic memory fades fast
};
```

### Access-Based Stabilization
```typescript
function onMemoryAccessed(memory: Memory): void {
  memory.lastAccessedAt = new Date();  // Reset decay clock
  memory.accessCount += 1;
  
  // Rehearsal bonus: 3+ accesses in a week = consolidation
  const recentAccesses = countAccessesInLastDays(memory, 7);
  if (recentAccesses >= 3) {
    memory.halflifeDays *= 1.5;  // 50% longer halflife
  }
}
```

### Pruning Strategy
```typescript
async function runDecayCron(): Promise<void> {
  const memories = await getAllMemories();
  
  for (const memory of memories) {
    const currentStrength = calculateCurrentStrength(memory);
    
    if (currentStrength < 0.3 && !memory.archivedAt) {
      // Soft delete: move to Limbic Archive
      await archiveMemory(memory);
    } else if (memory.archivedAt && daysSince(memory.archivedAt) > 30) {
      // Hard delete: true forgetting
      await deleteMemory(memory);
    } else {
      await updateStrength(memory, currentStrength);
    }
  }
}
```

---

## 6. Database Schema

```sql
-- New columns for memories table
ALTER TABLE memories ADD COLUMN strength REAL DEFAULT 1.0;
ALTER TABLE memories ADD COLUMN base_strength REAL DEFAULT 1.0;
ALTER TABLE memories ADD COLUMN mention_count INTEGER DEFAULT 1;
ALTER TABLE memories ADD COLUMN access_count INTEGER DEFAULT 0;
ALTER TABLE memories ADD COLUMN halflife_days INTEGER DEFAULT 60;
ALTER TABLE memories ADD COLUMN last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE memories ADD COLUMN last_mentioned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE memories ADD COLUMN first_mentioned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE memories ADD COLUMN archived_at TIMESTAMP;
ALTER TABLE memories ADD COLUMN source_conversations TEXT;  -- JSON array
ALTER TABLE memories ADD COLUMN entities TEXT;  -- JSON array
```

---

## 7. API Changes

### Store Endpoint (Updated)
```
POST /api/v1/memories
{
  "content": "<encrypted>",
  "embedding": [0.1, 0.2, ...],
  "type": "fact",
  "importance": 7.5,
  "entities": ["John", "Web3.com"],
  "conversationId": "conv_123"
}
```

Response includes reinforcement info:
```json
{
  "id": "mem_abc",
  "action": "reinforced",  // or "created"
  "strength": 1.4,
  "mentionCount": 2
}
```

### Batch Store Endpoint (New)
```
POST /api/v1/memories/batch
{
  "memories": [...]
}
```

### Decay Status Endpoint (New)
```
GET /api/v1/memories/health
```
Returns memory health stats:
```json
{
  "total": 150,
  "active": 120,
  "archived": 25,
  "pendingDeletion": 5,
  "averageStrength": 0.82
}
```

---

## 8. Implementation Phases

### Phase 1: Heuristics Engine (This PR)
- [x] Importance scoring function
- [x] Memory type detection
- [x] Pattern matchers for all categories
- [ ] Integration with store endpoint

### Phase 2: Reinforcement
- [ ] Similarity check before store
- [ ] Strength update on match
- [ ] Entity/context merging
- [ ] Frequency boost calculation

### Phase 3: Decay System
- [ ] Schema migration
- [ ] Decay calculation
- [ ] Daily cron job
- [ ] Archive/delete logic

### Phase 4: Agent Integration
- [ ] OpenClaw skill hooks
- [ ] Extraction triggers
- [ ] Batch processing

---

## 9. Privacy Guarantees

| Component | Sees Plaintext? | Notes |
|-----------|-----------------|-------|
| User's Agent | ✅ Yes | Has full context, does extraction |
| MEMRY Servers | ❌ No | Only encrypted blobs + vectors |
| Embedding Model | ✅ Yes | Runs client-side (FastEmbed ONNX) |
| Heuristics Engine | ✅ Yes | Runs client-side |
| Decay Cron | ❌ No | Only operates on metadata |

**Key insight:** All intelligence runs client-side. MEMRY is a dumb encrypted store with similarity search and decay mechanics.
