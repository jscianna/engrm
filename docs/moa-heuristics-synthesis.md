# MoA Synthesis: Memory Heuristics System

**Generated:** 2026-02-27 via Kimi + GLM-5 + MiniMax

---

## Executive Architecture

**Scoring Formula:**
```
Final_Score = Base_Heuristic_Score (0-7) + Context_Modifiers (0-2) + Reinforcement_Bonus (0-1)
Threshold: ≥6.0 for storage
```

Uses **deterministic algorithms only** (regex, statistical NLP, graph analysis) — no neural inference.

---

## 1. Importance Heuristics (Base Score: 0-7)

### A. Explicit Memory Markers (+3.0)
- **Declarative anchors**: "my name is", "I work at", "remember that", "note this", "important:"
- **Identity assertions**: "I'm a [profession]", "I have [condition]", "my [family member]..."
- **Preference declarations**: "I love", "I hate", "never do", "always want"
- **Procedural triggers**: "Here's how to", "The steps are", "To fix this..."

### B. Entity Density & Novelty (+0-2.0)
```python
entity_score = min(2.0, (named_entities_count / sentence_length) * 4)
novelty_score = cosine_distance(current_embedding, nearest_existing_memory) * 2.0
```
- **Novelty boost**: Semantic distance from existing memories >0.7 → +1.5
- **Repetition**: Exact match → skip creation, trigger reinforcement instead

### C. Emotional Intensity (+0-1.5)
Use VADER or NRC Emotion Lexicon (lexicon-based, not LLM):
- High arousal words (disaster, amazing, furious): +0.5 per instance, max 1.5
- Emotional disfluency: "umm" before important statements (+0.5)

### D. Decision & Commitment Markers (+2.0)
- **Decision verbs**: "decided", "chose", "committed", "booked", "ordered" (+1.0)
- **Future tense + obligation**: "will", "going to", "must by [date]" (+1.0)
- **Closing loops**: "finally", "at last", "resolved" (+0.5)

### E. Correction Signals (+1.5)
- **Self-correction**: "actually", "no wait", "I meant", "correction:" (+1.5)
- High-fidelity information overwriting prior noise

### F. Temporal Specificity (+0-1.0)
- **Absolute dates**: ISO dates, "January 5th" (+0.8)
- **Relative anchors**: "next Tuesday", "in 3 days" (+0.5)
- **Cyclical patterns**: "every morning", "annually" (+0.7)

### G. Causality & Consequence (+1.0)
- **Causal connectors**: "because", "therefore", "so that", "in order to"
- **Consequence markers**: "this means", "as a result"

### H. Task Completion Signals (+1.0)
- **Completion markers**: "done", "finished", "completed", "✓"
- **Failure markers**: "failed", "didn't work", "error" (+0.8)

---

## 2. Reinforcement Mechanism (Anti-Deduplication)

**Memory Consolidation via Resonance**

When candidate matches existing memory (similarity >0.85):

### Strength Update (EMA)
```
new_strength = (existing_strength * 0.7) + (trigger_intensity * 0.3)
```
- `trigger_intensity` = heuristic score of current mention / 10

### Frequency Boost (Logarithmic)
- 1st mention: Base strength
- 2nd mention: +40% boost
- 3rd-5th: +20% each
- 6th+: +5% each (saturation)
- **Max cap: 2.5x base strength**

### Contextual Enrichment
- Merge entity lists (union of all mentions)
- Update temporal scope (earliest to latest mention)
- Append source conversation IDs to provenance chain

### Spontaneous Recovery
- Re-mentioned after >30 days → +1.5 temporary boost to decay resistance

**Example:** User mentions dog "Rex" 5 times:
- Strength trajectory: 0.6 → 0.84 → 0.97 → 1.08 → 1.13 (capped)
- Result: Rex memory becomes highly decay-resistant

---

## 3. Memory Decay Model (Ebbinghaus-Inspired)

### Decay Formula
```
Current_Strength = Base_Strength * (Retention_Rate ^ (Days_Since_Access / Memory_Halflife))
```

### Type-Specific Halflives
| Type | Halflife | Rationale |
|------|----------|-----------|
| How-to (Procedural) | 120 days | Skills decay slowly |
| Fact (Semantic) | 90 days | Stable, encyclopedic |
| Preference | 60 days | Moderately stable |
| Relationship | 30 days | Social data needs maintenance |
| Event (Episodic) | 14 days | Fast decay unless reinforced |

### Access-Based Stabilization
- **Retrieval reset**: Accessing memory resets age counter to 0
- **Rehearsal bonus**: 3+ retrievals in a week → +50% halflife
- **Context shift penalty**: Retrieved in different context → -10% stability

### Pruning Strategy
- Strength < 0.3 → **Limbic Archive** (soft delete, searchable but not proactive)
- 30 days in Archive without retrieval → Hard delete (true forgetting)

---

## 4. Memory Type Taxonomy

Expanded from 4 to 7 types with base importance multipliers:

| Type | Multiplier | Extraction Trigger |
|------|-----------|-------------------|
| **Constraint** (New) | 1.3x | "cannot", "allergic", "deadline", "must not" |
| **Identity** (New) | 1.2x | "I am", "my job", "as a [role]" |
| **Relationship** (New) | 1.1x | "my friend", "colleague", "met with" |
| Preference | 1.0x | "prefer", "favorite", "hate" |
| How-to | 1.0x | "how to", "steps", "process" |
| Fact | 0.9x | "is located", "has property" |
| Event | 0.8x | "happened", "met", "visited" |

**Scoring:**
```
Type_Adjusted_Score = Base_Heuristic_Score * Type_Multiplier
```

**Critical Rule:** Constraints with medical/danger keywords ("allergic", "emergency contact", "diabetic") always +2.0 boost.

---

## 5. Context Metadata Layer (0-2 Bonus)

### Conversational Gravity (+0-0.5)
- Session length >20 exchanges: +0.2
- Response latency >30s: +0.3 (careful thought)
- Message was edited: +0.2

### Temporal Context (+0-0.5)
- Time of day (working hours vs late night)
- Day of week (weekday vs weekend)
- Proximity to known events (birthday, deadline)

### Emotional State (+0-0.5)
- Sentiment trend over last 5 messages
- Capitalization patterns (SHOUTING = high arousal)
- Punctuation intensity (!!!, ???)

### Conversation Position (+0-0.5)
- Opening statements: +0.3 (setting context)
- Closing statements: +0.3 (summary/decisions)
- After long pause: +0.2 (new topic, fresh thought)

---

## Implementation Notes

### No-LLM NLP Tools
- **Entity extraction**: spaCy NER (local, fast)
- **Sentiment**: VADER lexicon (no neural net)
- **Embeddings**: FastEmbed ONNX (all-MiniLM-L6-v2)
- **Pattern matching**: Regex + keyword lists

### Database Schema Additions
```sql
ALTER TABLE memories ADD COLUMN strength REAL DEFAULT 1.0;
ALTER TABLE memories ADD COLUMN mention_count INTEGER DEFAULT 1;
ALTER TABLE memories ADD COLUMN last_accessed_at TIMESTAMP;
ALTER TABLE memories ADD COLUMN first_mentioned_at TIMESTAMP;
ALTER TABLE memories ADD COLUMN halflife_days INTEGER;
ALTER TABLE memories ADD COLUMN archived_at TIMESTAMP;
```

### Decay Cron Job
Run daily:
```python
for memory in get_all_memories():
    days_since = (now - memory.last_accessed_at).days
    decay = retention_rate ** (days_since / memory.halflife_days)
    new_strength = memory.base_strength * decay
    
    if new_strength < 0.3 and not memory.archived_at:
        archive_memory(memory)
    elif memory.archived_at and (now - memory.archived_at).days > 30:
        hard_delete(memory)
    else:
        update_strength(memory, new_strength)
```
