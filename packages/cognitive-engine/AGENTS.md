# Cognitive Engine Knowledge Base

**Package:** `@fathippo/cognitive-engine`  
**Version:** 0.1.0  
**License:** PROPRIETARY — Do not publish or open source  
**Purpose:** AI learning & pattern extraction for coding agents

---

## OVERVIEW

Cognitive Engine is FatHippo's **learning substrate** for AI coding agents. It turns coding sessions into compounding expertise by capturing traces, extracting patterns, and synthesizing skills.

**Key Idea:** Every bug fixed makes the next bug easier. Agents learn from their own problem-solving history.

---

## ARCHITECTURE

```
┌─────────────────────────────────────────────────┐
│         COGNITIVE ENGINE (OpenClaw Extension)    │
├─────────────────────────────────────────────────┤
│                                                  │
│  1. TRACE CAPTURE (src/hooks/trace-capture.ts)   │
│     ├── Hook into OpenClaw afterTurn             │
│     ├── Extract reasoning from thinking blocks   │
│     ├── Detect problem type & outcome            │
│     └── Sanitize secrets before storage          │
│                                                  │
│  2. PATTERN EXTRACTION (src/extraction/)         │
│     ├── Cluster similar traces by domain         │
│     ├── Identify successful approaches           │
│     ├── Calculate confidence scores              │
│     └── Match patterns to new problems           │
│                                                  │
│  3. CONTEXT INJECTION (in engine.ts)             │
│     ├── Inject relevant traces per query         │
│     ├── Inject matching patterns                 │
│     └── "Last time you hit this, X worked"       │
│                                                  │
│  4. SKILL SYNTHESIS (Phase 2 - planned)          │
│     ├── Detect patterns ready for synthesis      │
│     ├── Generate SKILL.md via LLM                │
│     └── Optional ClawHub publishing              │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## STRUCTURE

```
packages/cognitive-engine/
├── src/
│   ├── index.ts                    # Main exports
│   ├── engine.ts                   # CognitiveEngine class
│   ├── types.ts                    # Core type definitions
│   │
│   ├── api/
│   │   └── client.ts               # FatHippo API client
│   │
│   ├── hooks/
│   │   └── trace-capture.ts        # TraceCapture class
│   │
│   ├── extraction/
│   │   └── pattern-extractor.ts    # PatternExtractor class
│   │
│   ├── utils/
│   │   └── sanitize.ts             # Secret sanitization (CRITICAL)
│   │
│   └── constraints/
│       └── detector.ts             # Constraint detection
│
├── STRATEGY.md                     # Internal strategy doc (PRIVATE)
├── README.md                       # Package documentation
├── package.json
└── tsconfig.json
```

---

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| **Main engine logic** | `src/engine.ts` | CognitiveEngine class - entry point |
| **Type definitions** | `src/types.ts` | CodingTrace, Pattern, SynthesizedSkill |
| **Trace capture** | `src/hooks/trace-capture.ts` | Extract reasoning, detect outcomes |
| **Pattern extraction** | `src/extraction/pattern-extractor.ts` | Clustering, confidence scoring |
| **API client** | `src/api/client.ts` | HTTP client for FatHippo API |
| **Secret sanitization** | `src/utils/sanitize.ts` | **MUST** be called before storage |
| **Constraint detection** | `src/constraints/detector.ts` | Auto-extract user constraints |

---

## CORE TYPES

### CodingTrace — Captured Session Data

```typescript
interface CodingTrace {
  id: string;
  userId: string;
  sessionId: string;
  timestamp: string;
  
  // What happened
  type: 'debugging' | 'building' | 'refactoring' | 'reviewing' | 'configuring';
  problem: string;              // Initial problem description
  context: TraceContext;        // Files, technologies, errors
  
  // How it was approached
  reasoning: string;            // Agent's thought process
  approaches: Approach[];       // What was tried
  
  // Result
  solution?: string;            // What worked
  outcome: 'success' | 'partial' | 'failed' | 'abandoned';
  
  // Metadata
  toolsUsed: string[];
  filesModified: string[];
  durationMs: number;
  
  // Sanitization tracking
  sanitized: boolean;
  sanitizedAt?: string;
}
```

### Pattern — Extracted Expertise

```typescript
interface Pattern {
  id: string;
  domain: string;               // e.g., "turso", "nextjs-auth"
  trigger: PatternTrigger;      // When this pattern applies
  approach: string;             // What to do
  confidence: number;           // 0-1 success rate
  successCount: number;
  failCount: number;
  status: 'candidate' | 'active' | 'synthesized' | 'deprecated';
}
```

### TraceContext — Problem Context

```typescript
interface TraceContext {
  technologies: string[];       // e.g., ["turso", "nextjs", "typescript"]
  files: string[];              // File paths (not content)
  errorMessages?: string[];     // Error messages encountered
  stackTraces?: string[];       // Sanitized stack traces
  environment?: string;         // "development", "production"
  projectType?: string;         // "web-app", "cli", "library"
}
```

---

## KEY CLASSES

### CognitiveEngine (`src/engine.ts`)

**Purpose:** Main orchestrator that ties together all components.

**Key Methods:**
- `getRelevantContext(problem, technologies)` — Query for traces/patterns to inject
- `captureFromTurn(params)` — Capture trace after coding session
- `extractPatterns()` — Batch pattern extraction from traces
- `getSkillCandidates()` — Get patterns ready for skill synthesis

**Configuration:**
```typescript
interface CognitiveEngineConfig {
  apiKey: string;
  baseUrl?: string;
  
  // Trace capture
  captureEnabled: boolean;
  sanitizeSecrets: boolean;     // ALWAYS true in production
  minTraceDurationMs?: number;
  
  // Pattern extraction
  patternExtractionEnabled: boolean;
  minTracesForPattern: number;      // Default: 3
  minSuccessRateForPattern: number; // Default: 0.7
  
  // Context injection
  injectRelevantTraces: boolean;
  injectPatterns: boolean;
  maxInjectedTraces: number;    // Default: 5
  maxInjectedPatterns: number;  // Default: 3
}
```

### TraceCapture (`src/hooks/trace-capture.ts`)

**Purpose:** Extract traces from agent message history.

**Key Methods:**
- `captureTrace(params)` — Full trace extraction from message history
- `extractReasoning(messages)` — Pull thinking blocks from assistant responses
- `detectProblemType(messages)` — Classify as debugging/building/refactoring/etc
- `detectOutcome(messages)` — Success/partial/failed from conversation
- `shouldCapture(messages)` — Filter out trivial sessions

### PatternExtractor (`src/extraction/pattern-extractor.ts`)

**Purpose:** Cluster traces and extract reusable patterns.

**Key Methods:**
- `clusterTraces(traces)` — Group similar traces by technology + type
- `extractPattern(cluster)` — Create pattern from successful cluster
- `matchPatterns(problem, technologies, patterns)` — Find applicable patterns
- `updatePatternConfidence(pattern, outcome)` — Reinforcement learning

---

## SECRET SANITIZATION (CRITICAL)

**Location:** `src/utils/sanitize.ts`

**NEVER** store or transmit traces without sanitization. The `sanitizeTrace()` function:
- Redacts API keys (OpenAI, GitHub, AWS, etc.)
- Removes connection strings (MongoDB, Postgres, Redis)
- Strips private keys
- Masks tokens and passwords

**Usage:**
```typescript
import { sanitizeTrace } from './utils/sanitize.js';

// ALWAYS sanitize before storage
const sanitized = sanitizeTrace(rawTrace);
await client.storeTrace(sanitized);
```

**Detected Secrets:**
- OpenAI keys (`sk-...`)
- GitHub tokens (`ghp_...`, `github_pat_...`)
- AWS credentials (`AKIA...`)
- FatHippo keys (`mem_...`)
- JWT tokens
- MongoDB/Postgres/Redis URIs
- Private keys (RSA, EC, SSH)
- Generic API keys, secrets, passwords, tokens

---

## CONVENTIONS

### Code Style
- TypeScript strict mode
- ES modules (`"type": "module"`)
- `.js` extensions in imports (Node.js ESM requirement)

### Trace Capture Rules
1. **Minimum session length** — At least 3 messages
2. **Must have user + assistant** — Both roles required
3. **Minimum duration** — Configurable (default: skip trivial ops)
4. **Always sanitize** — Before ANY storage or sharing

### Pattern Extraction Rules
1. **Minimum traces** — 3+ traces per cluster
2. **Minimum success rate** — 70%+ to extract pattern
3. **Confidence tracking** — Update on each application
4. **Provenance** — Track source trace IDs

---

## ANTI-PATTERNS (NEVER DO)

```typescript
// ❌ NEVER: Skip secret sanitization
const trace = captureTrace(messages);
await client.storeTrace(trace); // SECRETS EXPOSED!

// ❌ NEVER: Store unsanitized reasoning
const trace: CodingTrace = {
  reasoning: rawThinking, // May contain API keys!
  sanitized: false,       // WRONG
  // ...
};

// ❌ NEVER: Return trace data to user without sanitization
return { trace: await client.getTrace(id) }; // Potential leak!

// ❌ NEVER: Include file content in traces
context: {
  files: filesWithContent // Only store PATHS, not content!
}

// ❌ NEVER: Log trace content at INFO level
console.log('Captured trace:', trace); // May leak secrets!
```

---

## INTEGRATION WITH OPENCLAW

Cognitive Engine extends the Context Engine (`@fathippo/context-engine`):

**In Context Engine's `assemble()`:**
```typescript
// Existing: inject memories
const memories = await this.getRelevantMemories(query);

// NEW: inject cognitive context
const cognitive = await this.cognitiveEngine.getRelevantContext(
  lastUserMessage,
  detectedTechnologies
);

systemPrompt += cognitive.formatted;
```

**In Context Engine's `afterTurn()`:**
```typescript
// NEW: capture trace after completed turn
if (this.cognitiveEnabled && looksLikeCoding(messages)) {
  await this.cognitiveEngine.captureFromTurn({
    sessionId,
    messages,
    startTime,
    endTime,
  });
}
```

---

## PROPRIETARY COMPONENTS (DO NOT OPEN SOURCE)

The following are **internal IP** and must not be published:

| Component | Reason |
|-----------|--------|
| Pattern extraction algorithms | Competitive advantage |
| Confidence scoring logic | Proprietary reinforcement |
| Trace → pattern clustering | Core learning mechanism |
| Pattern matching heuristics | Trade secret |
| STRATEGY.md | Internal product strategy |

**What CAN be open sourced:**
- Trace schema (interoperability)
- Basic API client
- Sanitization utilities
- Type definitions

---

## COMMANDS

```bash
# Development
cd packages/cognitive-engine
npm run build          # Compile TypeScript
npm run dev            # Watch mode compilation
npm run test           # Run vitest tests

# Integration
# Cognitive Engine is imported by context-engine
# No independent deployment
```

---

## TESTING

**Test Files:**
- `src/utils/sanitize.test.ts` — Secret detection/redaction
- `src/hooks/trace-capture.test.ts` — Reasoning extraction
- `src/extraction/pattern-extractor.test.ts` — Clustering logic

**Test Strategy:**
1. Unit tests: Sanitization, pattern matching
2. Integration: Full trace → pattern flow
3. Dogfooding: Run on FatHippo development itself

---

## GOTCHAS

1. **Sanitization is mandatory** — Never skip, even in development
2. **Pattern cache TTL** — 5 minutes, refreshes automatically
3. **Trace size limits** — Reasoning capped at 5000 chars, problem at 500
4. **No file content** — Only store file paths, never content
5. **Outcome detection** — Keyword-based, can be ambiguous
6. **Proprietary license** — Cannot publish to npm (use private registry)
