# Context Engine Knowledge Base

**Package:** `@fathippo/context-engine`  
**Version:** 0.1.1  
**License:** MIT  
**Purpose:** OpenClaw plugin for encrypted agent memory

---

## OVERVIEW

Context Engine is FatHippo's **OpenClaw plugin** that provides encrypted, persistent memory for AI agents. It intercepts agent conversations, stores memories securely, and injects relevant context into each turn.

**Key Idea:** Agents shouldn't wake up with amnesia. Every conversation builds on past interactions.

---

## ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                         OPENCLAW                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Agent     │  │  Messaging  │  │   Skills    │              │
│  │   Runtime   │  │  (TG/Disc)  │  │  (ClawHub)  │              │
│  └──────┬──────┘  └─────────────┘  └─────────────┘              │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              FATHIPPO CONTEXT ENGINE                      │  │
│  │                   (This Package)                          │  │
│  │                                                            │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │ LIFECYCLE HOOKS                                     │   │  │
│  │  │ • bootstrap()  → Load critical memories            │   │  │
│  │  │ • ingest()     → Capture user messages             │   │  │
│  │  │ • assemble()   → Inject relevant context           │   │  │
│  │  │ • compact()    → Dream Cycle (synthesis, decay)    │   │  │
│  │  │ • afterTurn()  → Cache invalidation, trace capture │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  │                                                            │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │ FEATURES                                            │   │  │
│  │  │ • Encrypted storage (AES-256-GCM)                   │   │  │
│  │  │ • Semantic search (vector + BM25)                   │   │  │
│  │  │ • Tiered importance (critical/high/normal/low)      │   │  │
│  │  │ • Dream Cycle synthesis                             │   │  │
│  │  │ • Indexed memory summaries                          │   │  │
│  │  │ • Constraint detection & injection                  │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                    │
└──────────────────────────────┼────────────────────────────────────┘
                               │ HTTPS
                    ┌──────────▼──────────┐
                    │   FATHIPPO CLOUD    │
                    │   (Turso + Qdrant)  │
                    └─────────────────────┘
```

---

## STRUCTURE

```
packages/context-engine/
├── src/
│   ├── index.ts               # Plugin registration & exports
│   ├── engine.ts              # FatHippoContextEngine class
│   ├── types.ts               # TypeScript interfaces
│   │
│   ├── api/
│   │   └── client.ts          # FatHippoClient HTTP wrapper
│   │
│   └── utils/
│       ├── filtering.ts       # Content filtering & sanitization
│       └── formatting.ts      # Memory formatting for injection
│
├── dist/                      # Compiled JavaScript output
├── openclaw.plugin.json       # OpenClaw plugin manifest
├── README.md
├── package.json
└── tsconfig.json
```

---

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| **Plugin entry point** | `src/index.ts` | Registers with OpenClaw |
| **Main engine** | `src/engine.ts` | Implements ContextEngine interface |
| **Type definitions** | `src/types.ts` | Memory, Config, SearchResult types |
| **API client** | `src/api/client.ts` | All FatHippo API calls |
| **Content filtering** | `src/utils/filtering.ts` | Prompt injection, noise detection |
| **Memory formatting** | `src/utils/formatting.ts` | Format for system prompt injection |
| **Plugin manifest** | `openclaw.plugin.json` | OpenClaw plugin configuration |

---

## LIFECYCLE HOOKS

Context Engine implements OpenClaw's `ContextEngine` interface with these hooks:

### 1. bootstrap()
**Called:** Once at session start  
**Purpose:** Load critical memories and syntheses into cache

```typescript
async bootstrap(params: {
  sessionId: string;
  sessionFile: string;
}): Promise<BootstrapResult>
```

### 2. ingest()
**Called:** On every message  
**Purpose:** Capture user messages to memory

```typescript
async ingest(params: {
  sessionId: string;
  message: AgentMessage;
  isHeartbeat?: boolean;
}): Promise<IngestResult>
```

**Filters applied:**
- Skip heartbeat messages
- Skip non-user messages (configurable)
- Detect prompt injection attempts
- Match capture patterns (decisions, preferences, constraints)
- Sanitize content before storage

### 3. assemble()
**Called:** Before each LLM call  
**Purpose:** Inject relevant memories into context

```typescript
async assemble(params: {
  sessionId: string;
  messages: AgentMessage[];
  tokenBudget?: number;
}): Promise<AssembleResult>
```

**Context injected:**
1. **Indexed summaries** — Always included (compact)
2. **Active constraints** — Critical rules from user
3. **Relevant memories** — Semantic search results
4. **Cognitive context** — Traces & patterns (if cognitive enabled)

### 4. compact()
**Called:** On `/compact` command  
**Purpose:** Run Dream Cycle instead of lossy truncation

```typescript
async compact(params: {
  sessionId: string;
  sessionFile: string;
  tokenBudget?: number;
  force?: boolean;
}): Promise<CompactResult>
```

**Dream Cycle actions:**
- Synthesize related memories
- Apply memory decay
- Archive absorbed memories
- Update relationship graph

### 5. afterTurn()
**Called:** After each LLM response  
**Purpose:** Cache invalidation, cognitive trace capture

```typescript
async afterTurn(params: {
  sessionId: string;
  messages: AgentMessage[];
  // ... other params
}): Promise<void>
```

### 6. prepareSubagentSpawn()
**Called:** Before spawning subagent  
**Purpose:** Scope memories for child agents

### 7. onSubagentEnded()
**Called:** When subagent completes  
**Purpose:** Absorb learnings from child agents

---

## CORE TYPES

### FatHippoConfig — Plugin Configuration

```typescript
interface FatHippoConfig {
  apiKey: string;                    // Required: FatHippo API key
  baseUrl?: string;                  // Optional: Custom API endpoint
  injectCritical?: boolean;          // Auto-inject critical memories (default: true)
  injectLimit?: number;              // Max memories per turn (default: 20)
  captureUserOnly?: boolean;         // Only capture user messages (default: true)
  dreamCycleOnCompact?: boolean;     // Run Dream Cycle on /compact (default: true)
  conversationId?: string | null;    // Conversation grouping
  cognitiveEnabled?: boolean;        // Enable cognitive features (default: true)
}
```

### Memory — Stored Memory Record

```typescript
interface Memory {
  id: string;
  title: string;
  content: string;
  userId: string;
  memoryType?: string;
  importanceTier?: "critical" | "high" | "normal" | "low";
  importance?: number;
  entities?: string[];
  createdAt: string;
  updatedAt: string;
  accessCount?: number;
  lastAccessedAt?: string;
  absorbed?: boolean;
  absorbedIntoSynthesisId?: string | null;
}
```

### SearchResult — Memory with Relevance Score

```typescript
interface SearchResult {
  memory: Memory;
  score: number;                     // 0-1 relevance score
  matchType?: "vector" | "bm25" | "hybrid";
}
```

### SynthesizedMemory — Consolidated Knowledge

```typescript
interface SynthesizedMemory {
  id: string;
  userId: string;
  title: string;
  content: string;
  sourceMemoryIds: string[];         // Provenance
  theme?: string;
  createdAt: string;
}
```

---

## KEY CLASSES

### FatHippoContextEngine (`src/engine.ts`)

**Purpose:** Main plugin class implementing OpenClaw's ContextEngine interface.

**Key Properties:**
```typescript
readonly info: ContextEngineInfo = {
  id: "fathippo-context-engine",
  name: "FatHippo Context Engine",
  version: "0.1.1",
  ownsCompaction: true,  // We handle compaction via Dream Cycle
};
```

**Internal State:**
- `cachedCritical` — Cached critical memories (5min TTL)
- `sessionStartTimes` — For cognitive trace duration tracking
- `cognitiveEnabled` — Toggle for cognitive features

**Key Methods:**
- `bootstrap()` — Load critical memories on session start
- `ingest()` — Capture messages to memory
- `assemble()` — Build context for LLM calls
- `compact()` — Run Dream Cycle
- `afterTurn()` — Post-turn processing

### FatHippoClient (`src/api/client.ts`)

**Purpose:** HTTP client for FatHippo API.

**Key Methods:**
- `remember(params)` — Store a memory
- `search(params)` — Semantic search
- `getCriticalMemories()` — Get critical tier memories
- `getContext(query)` — Optimized context endpoint
- `getIndexedSummaries()` — Get compact indexed summaries
- `runDreamCycle()` — Trigger maintenance/synthesis

**Base URL:** `https://www.fathippo.com/api` (configurable)

---

## CONTENT FILTERING

**Location:** `src/utils/filtering.ts`

### Prompt Injection Detection

Blocks messages matching these patterns:
- "ignore all previous instructions"
- "disregard all prior rules"
- "you are now a..."
- "system: you are..."
- "jailbreak"
- "override your rules"

### Noise Detection

Skips low-value content:
- Very short messages (< 10 chars)
- Just acknowledgments ("ok", "thanks", "sure")
- Just emoji
- Just numbers or URLs
- Terminal error output (npm ERR!, stack traces)

### Capture Patterns

Identifies memory-worthy content containing:
- Decisions ("decided", "decision")
- Preferences ("prefer", "always", "never")
- Constraints ("must", "should not", "requirement")
- Identity ("I am", "my name")
- Important rules ("critical", "key", "remember")

### Sanitization

- Normalizes line endings (`\r\n` → `\n`)
- Collapses excessive newlines
- Trims whitespace
- Limits length to 10,000 chars

---

## MEMORY FORMATTING

**Location:** `src/utils/formatting.ts`

### Format for System Prompt Injection

Memories are formatted as markdown for the agent's system prompt:

```markdown
# Agent Memory (FatHippo)

## Core Principles
- **Title**: Content from syntheses

## Critical Context
- Memory title or truncated content

## Important Context  
- Memory summaries

## Relevant Context
- Additional memories
```

### Deduplication

Memories are deduplicated by ID before injection to avoid duplicates.

### Token Estimation

Rough approximation: ~4 characters per token for budget calculations.

---

## COGNITIVE ENGINE INTEGRATION

Context Engine integrates with `@fathippo/cognitive-engine` when `cognitiveEnabled` is true:

### Trace Capture (`afterTurn()`)

After coding sessions, captures:
- Problem description (from first user message)
- Reasoning (from thinking blocks)
- Solution (from final assistant message)
- Technologies detected
- Outcome (success/partial/failed)

### Context Injection (`assemble()`)

Injects for coding queries:
- Learned patterns with confidence scores
- Past similar problems with outcomes
- Active constraints

### Constraint Detection

Auto-detects constraints from user messages:
- File-specific rules
- Technology preferences
- Workflow requirements
- Security restrictions

---

## CONVENTIONS

### Code Style
- TypeScript strict mode
- ES modules (`"type": "module"`)
- `.js` extensions in imports

### Memory Capture Rules
1. **User messages only** — By default, only capture user messages
2. **Pattern matching** — Must match capture patterns (not just any text)
3. **Sanitize first** — Clean content before API call
4. **Best effort** — Fire-and-forget, don't block on failures

### Context Assembly Rules
1. **Trivial query detection** — Skip search for "ok", "thanks", etc.
2. **Tier priority** — Critical > High > Normal
3. **Similarity threshold** — 0.75 min for vector matches
4. **Token budget** — Respect budget constraints
5. **Deduplication** — Never inject same memory twice

### Cache Management
- Critical memories cached for 5 minutes
- Cache invalidated after dream cycle
- Cache invalidated after 5+ minutes

---

## ANTI-PATTERNS (NEVER DO)

```typescript
// ❌ NEVER: Return memories without checking authorization
return { memories: await client.getMemories() }; // Check userId!

// ❌ NEVER: Skip prompt injection detection
await client.remember({ content: userInput }); // Validate first!

// ❌ NEVER: Inject all memories regardless of relevance
const allMemories = await client.getAllMemories();
systemPrompt += formatAll(allMemories); // Use search!

// ❌ NEVER: Ignore token budget
const context = formatMemories(allMemories); // May exceed budget!

// ❌ NEVER: Cache sensitive data indefinitely
this.cache = memories; // Set TTL!

// ❌ NEVER: Block on memory operations
await client.remember(data); // Use fire-and-forget for non-critical
```

---

## INSTALLATION & CONFIGURATION

### Installation

```bash
openclaw plugins install @fathippo/context-engine
```

### Configuration

```yaml
# ~/.openclaw/config.yaml
plugins:
  slots:
    contextEngine: "fathippo-context-engine"
  entries:
    fathippo-context-engine:
      enabled: true
      config:
        apiKey: "${FATHIPPO_API_KEY}"
        injectCritical: true
        injectLimit: 20
        captureUserOnly: true
        dreamCycleOnCompact: true
        cognitiveEnabled: true
```

### Environment Variables

```bash
export FATHIPPO_API_KEY="mem_xxx"
```

---

## COMMANDS

```bash
# Development
cd packages/context-engine
npm run build          # Compile TypeScript
npm run dev            # Watch mode
npm run prepublishOnly # Build before publish

# Usage via OpenClaw
openclaw plugins install @fathippo/context-engine
openclaw config set plugins.slots.contextEngine=fathippo-context-engine
```

---

## DEPENDENCIES

**Runtime:**
- `openclaw` (peer dependency >=2026.3.7)
- Native `fetch` API (Node.js 18+)

**Build:**
- `typescript` ^5.9.0
- `@types/node` ^22.0.0

---

## GOTCHAS

1. **Peer dependency** — Requires OpenClaw, won't work standalone
2. **No workspace** — Install deps in package directory, not root
3. **Cognitive dependency** — Optional, loads `@fathippo/cognitive-engine` if available
4. **Token estimation** — Rough approximation (~4 chars/token)
5. **Cache TTL** — 5 minutes, manual refresh via `afterTurn()`
6. **Capture filtering** — Most messages are filtered out (intentionally)
7. **Indexed summaries** — Always included, very compact format
8. **API key format** — Must start with `mem_`
