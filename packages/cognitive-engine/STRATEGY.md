# FatHippo: Cognitive Substrate for AI Coding Agents

**CONFIDENTIAL — Internal Strategy Document**
**Date:** 2026-03-10
**Version:** 2.0 (Pivoted to coding focus)

---

## Executive Summary

FatHippo pivots from "agent memory API" to **cognitive substrate for AI coding agents** — the infrastructure that lets coding agents develop expertise over time. Built as an OpenClaw extension to leverage existing agent infrastructure.

**The shift:** From "memory tool" to "the thing that makes your coding agent actually good at your codebase."

---

## Why Coding

### Market Reality

From Sequoia's "Services: The New Software" (Julien Bek, March 2026):

> "Software engineering accounts for over 50% of all AI tool usage across professions. Every other category is still in single digits. The reason is that software engineering is primarily intelligence work."

Coding is where AI agents are actually being used. Everything else is still experimental.

### Feedback Loop Advantage

| Domain | Feedback Signal | Latency |
|--------|-----------------|---------|
| VC Deals | Company success/failure | 2-5 years |
| Legal | Case outcome | Months |
| Customer Support | Resolution + CSAT | Hours |
| **Coding** | **Tests pass, code compiles** | **Seconds** |

Coding has the tightest feedback loop. Every function that works or fails is immediate training signal.

### We Have The Data

Our FatHippo development history IS the training data:
- How we debugged Turso vector search
- How we structured the API routes
- How we integrated with OpenClaw
- Every error we hit, every solution we found

We're not waiting for data. We're sitting on it.

---

## The Thesis

### Current State: Memory as Recall

```
Coding Session:
  User: "Fix the auth bug"
  Agent: [recalls facts about auth system]
  Agent: [attempts fix]
  → Works or doesn't
  → Nothing learned for next time
```

### Future State: Memory as Learning

```
Coding Session:
  User: "Fix the auth bug"
  Agent: [recalls facts + past debugging patterns + what worked before]
  Agent: [attempts fix with learned approach]
  → Works
  → Trace captured: problem → approach → solution
  → Pattern extracted: "JWT expiry issues → check token refresh logic first"
  → Skill synthesized if pattern repeats
  → Next similar bug: agent is faster
```

**Judgement compounding:** Every bug fixed makes the next bug easier.

---

## Architecture: OpenClaw Extension

### Why Extension, Not Standalone

| Component | Build | Leverage from OpenClaw |
|-----------|-------|----------------------|
| Cognitive loop | ✅ Build | — |
| Context injection | — | ✅ Context engine API |
| Agent runtime | — | ✅ Full agent infrastructure |
| Skill system | — | ✅ ClawHub integration |
| Messaging surfaces | — | ✅ Telegram, Discord, CLI |
| Subagent spawning | — | ✅ Codex, Claude Code integration |
| Cron/heartbeats | — | ✅ Built-in scheduling |

**We build ONE thing:** The cognitive loop that turns sessions into expertise.

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         OPENCLAW                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Agent     │  │  Messaging  │  │   Skills    │              │
│  │   Runtime   │  │  (TG/Disc)  │  │  (ClawHub)  │              │
│  └──────┬──────┘  └─────────────┘  └──────┬──────┘              │
│         │                                  │                     │
│         ▼                                  ▼                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              FATHIPPO COGNITIVE ENGINE                   │    │
│  │                   (Extension)                            │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │  1. TRACE CAPTURE                                │    │    │
│  │  │     - Hook into coding sessions                  │    │    │
│  │  │     - Record: problem → reasoning → solution     │    │    │
│  │  │     - Tag with outcome (success/fail)            │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  │                         │                                │    │
│  │                         ▼                                │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │  2. PATTERN EXTRACTION                           │    │    │
│  │  │     - Cluster similar traces                     │    │    │
│  │  │     - Identify what worked vs failed             │    │    │
│  │  │     - Extract generalizable patterns             │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  │                         │                                │    │
│  │                         ▼                                │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │  3. SKILL SYNTHESIS                              │    │    │
│  │  │     - When pattern repeats 3+ times              │    │    │
│  │  │     - Generate SKILL.md automatically            │    │    │
│  │  │     - Optional: publish to ClawHub               │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  │                         │                                │    │
│  │                         ▼                                │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │  4. CONTEXT INJECTION                            │    │    │
│  │  │     - Before coding session: inject relevant     │    │    │
│  │  │       traces, patterns, skills                   │    │    │
│  │  │     - "Last time you hit this, X worked"         │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  │                                                          │    │
│  └──────────────────────────────────────────────────────────┘    │
│                              │                                    │
└──────────────────────────────┼────────────────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   FATHIPPO CLOUD    │
                    │   (Turso + APIs)    │
                    │                     │
                    │  - Traces stored    │
                    │  - Patterns indexed │
                    │  - Skills hosted    │
                    │  - Graph edges      │
                    └─────────────────────┘
```

### Data Flow: Debugging Session Example

```
1. USER: "The vector search returns empty results"

2. CONTEXT INJECTION (before agent thinks):
   FatHippo checks: "Have we seen vector search issues before?"
   → Finds 2 past traces with similar keywords
   → Injects: "Past learnings: Turso vector queries need explicit 
      LIMIT clause. Also check embedding dimension mismatch."

3. AGENT REASONING (with context):
   "Based on past experience, I'll check LIMIT clause first..."
   → Finds missing LIMIT
   → Fixes it
   → Tests pass

4. TRACE CAPTURE (after success):
   {
     "type": "debugging",
     "problem": "vector search empty results",
     "context": "Turso, FatHippo, search endpoint",
     "reasoning": "Checked LIMIT clause based on past pattern",
     "solution": "Added LIMIT 10 to query",
     "outcome": "success",
     "time_to_resolution": "2 minutes"
   }

5. PATTERN REINFORCEMENT:
   → "LIMIT clause" pattern now has 3 successful applications
   → Confidence increased
   → Consider skill synthesis

6. SKILL SYNTHESIS (if threshold met):
   → Generate: skills/turso-vector-debugging/SKILL.md
   → Contains: common issues, diagnostic steps, solutions
   → Available for all future sessions
```

---

## Extension Components

### 1. Trace Capture Hook

**Integration point:** OpenClaw's `afterTurn` lifecycle hook

```typescript
interface CodingTrace {
  id: string;
  sessionId: string;
  timestamp: string;
  
  // What happened
  type: 'debugging' | 'building' | 'refactoring' | 'reviewing';
  problem: string;           // Initial problem/task
  context: string[];         // Files, technologies, error messages
  
  // How it was approached
  reasoning: string;         // Agent's thought process (from thinking blocks)
  approaches: Approach[];    // What was tried
  
  // Result
  solution: string;          // What worked
  outcome: 'success' | 'partial' | 'failed' | 'abandoned';
  
  // Metadata
  toolsUsed: string[];
  filesModified: string[];
  duration: number;
}

interface Approach {
  description: string;
  result: 'worked' | 'failed' | 'partial';
  learnings: string;
}
```

### 2. Pattern Extraction

**Runs:** During compaction / dream cycle / scheduled

```typescript
interface Pattern {
  id: string;
  domain: string;           // e.g., "turso", "nextjs", "auth"
  trigger: string;          // What problem indicates this pattern
  approach: string;         // What to try
  confidence: number;       // 0-1, based on success rate
  sourceTraces: string[];   // Which traces this came from
  successCount: number;
  failCount: number;
}
```

**Extraction logic:**
1. Cluster traces by problem similarity (embeddings)
2. Within cluster, identify common successful approaches
3. Extract pattern if: 3+ traces, >70% success rate
4. Store with confidence score

### 3. Skill Synthesis

**Trigger:** Pattern reaches synthesis threshold (5+ applications, >80% success)

```typescript
interface SynthesizedSkill {
  name: string;              // e.g., "turso-vector-debugging"
  description: string;
  
  // Generated SKILL.md content
  whenToUse: string;
  procedure: string[];
  commonPitfalls: string[];
  verification: string;
  
  // Provenance
  sourcePatterns: string[];
  sourceTraces: string[];
  generatedAt: string;
  
  // Lifecycle
  published: boolean;
  clawHubId?: string;
}
```

**Generation:** LLM synthesizes SKILL.md from patterns + traces

### 4. Context Injection (Enhanced)

**Current:** Inject relevant memories based on query

**Enhanced:** Also inject:
- Relevant traces (not just memories)
- Applicable patterns with confidence
- Auto-loaded skills if pattern matches

```typescript
// In assemble(), add:
const relevantTraces = await getRelevantTraces(lastUserMessage);
const applicablePatterns = await matchPatterns(lastUserMessage);

systemPromptAddition += formatTraces(relevantTraces);
systemPromptAddition += formatPatterns(applicablePatterns);
```

---

## API Additions

### Traces API

```
POST /api/v1/traces
  - Store a coding trace
  
GET /api/v1/traces/relevant?query=...
  - Get traces relevant to a problem
  
GET /api/v1/traces/stats
  - Success rates, common patterns, skill candidates
```

### Patterns API

```
GET /api/v1/patterns
  - List extracted patterns
  
GET /api/v1/patterns/match?problem=...
  - Find patterns that might apply
  
POST /api/v1/patterns/feedback
  - Report pattern success/failure (reinforcement)
```

### Skills API (Synthesis)

```
GET /api/v1/skills/candidates
  - Patterns ready for skill synthesis
  
POST /api/v1/skills/synthesize
  - Generate skill from pattern
  
POST /api/v1/skills/publish
  - Publish to ClawHub
```

---

## MVP Scope (2-3 Weeks)

### Week 1: Trace Capture
- [ ] Define trace schema
- [ ] Hook into OpenClaw afterTurn
- [ ] Capture reasoning from thinking blocks
- [ ] Store traces in FatHippo
- [ ] Basic trace retrieval API

### Week 2: Pattern Extraction + Injection
- [ ] Cluster traces by similarity
- [ ] Extract patterns from clusters
- [ ] Inject relevant traces in context
- [ ] Inject matching patterns in context
- [ ] Pattern feedback loop

### Week 3: Skill Synthesis
- [ ] Detect synthesis candidates
- [ ] Generate SKILL.md from patterns
- [ ] Local skill storage
- [ ] (Optional) ClawHub integration

### Dogfooding
- Run on our own FatHippo development
- Every coding session = training data
- Track: Does the agent get faster at FatHippo-specific bugs?

---

## Competitive Positioning

### vs. Hermes Agent (Nous Research)

| Aspect | Hermes | FatHippo Cognitive |
|--------|--------|-------------------|
| Runtime | Full agent | Extension (pluggable) |
| Learning trigger | 5+ tool calls | Outcome-based |
| Memory | Bounded local files | Cloud + graph |
| Skill format | Markdown (compatible) | Markdown (compatible) |
| Focus | General agent | Coding-specific |

**Our edge:** We're not rebuilding the agent. We're adding the learning layer that any agent can use.

### vs. Skills Marketplaces (ClawHub, skills.sh)

| Aspect | Marketplaces | FatHippo |
|--------|--------------|----------|
| Skills | Manually created | Auto-synthesized |
| Source | Human authors | Agent experience |
| Improvement | New versions | Continuous refinement |
| Personalization | Generic | Your codebase patterns |

**Our edge:** Skills that grow from YOUR usage, not generic recipes.

### vs. Native Memory (OpenAI, Anthropic)

| Aspect | Native | FatHippo Cognitive |
|--------|--------|-------------------|
| What's stored | Facts, preferences | Reasoning traces |
| Learning | Recall | Pattern extraction |
| Domain | General | Your stack |
| Cross-agent | Locked in | Works with any model |

**Our edge:** We don't just remember. We learn.

---

## Success Metrics

### MVP Success
1. **Trace coverage:** >80% of coding sessions captured
2. **Pattern extraction:** 10+ patterns identified from traces
3. **Injection relevance:** Injected context rated helpful >70%
4. **Skill synthesis:** 2-3 skills auto-generated
5. **Time improvement:** Measurable speedup on repeat problem types

### Product Success
1. **Expertise accumulation:** Agent measurably better at codebase over time
2. **Skill quality:** Auto-generated skills comparable to hand-written
3. **User retention:** Users keep cognitive engine enabled
4. **Network effects:** Popular patterns/skills shared across users

---

## IP Protection

### Keep Proprietary
- Trace → Pattern extraction algorithms
- Pattern → Skill synthesis prompts
- Confidence scoring and reinforcement logic
- Cross-user pattern aggregation (if implemented)

### Open (Strategically)
- Trace schema (interoperability)
- Skill format (ClawHub compatible)
- Basic API interface (adoption)

### Do NOT Open Source
- The cognitive loop implementation
- Pattern extraction models
- Synthesis prompt engineering
- Aggregated learning datasets

---

## Open Questions

1. **Privacy:** How do we handle sensitive code in traces?
   - Option A: All local, never leaves machine
   - Option B: Encrypted cloud, user-controlled
   - Option C: Sanitized traces (strip secrets)

2. **Cross-user learning:** Can patterns from User A help User B?
   - Risk: IP leakage
   - Opportunity: Network effects
   - Possible: Opt-in, anonymized, technology-specific only

3. **Skill quality control:** How do we prevent bad skills?
   - Confidence thresholds
   - User feedback loop
   - Deprecation for low-performing skills

4. **Integration depth:** How tightly do we couple with OpenClaw?
   - Tight: Better experience, dependency risk
   - Loose: Portable, more work

---

## Next Steps

### Immediate (This Week)
1. ~~Write strategy doc~~ ✅
2. Design trace schema
3. Implement trace capture hook in context engine
4. Test with FatHippo development sessions

### Week 2
1. Pattern extraction prototype
2. Context injection with traces
3. Feedback loop for pattern reinforcement

### Week 3
1. Skill synthesis from patterns
2. Full dogfooding cycle
3. Measure improvement

---

*Document version 2.0 — Pivoted from VC deals to coding focus*
*Keep local, do not commit to public repos*
