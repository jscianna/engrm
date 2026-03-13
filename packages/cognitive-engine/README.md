# @fathippo/cognitive-engine

**PROPRIETARY - DO NOT PUBLISH**

Cognitive substrate for AI coding agents. Turns coding sessions into compounding expertise.

## What This Does

```
Coding Session:
  User: "Fix the auth bug"
  
  BEFORE (without cognitive engine):
    Agent attempts fix, succeeds or fails, nothing learned
  
  AFTER (with cognitive engine):
    1. Context injection: "Last time you hit auth bugs, checking token refresh worked"
    2. Agent attempts fix with learned approach
    3. Trace capture: problem → reasoning → solution
    4. Pattern extraction: "auth + token + refresh = check expiry first"
    5. Next auth bug: agent is faster
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│              COGNITIVE ENGINE                    │
├─────────────────────────────────────────────────┤
│  1. TRACE CAPTURE (hooks/trace-capture.ts)      │
│     - Hook into OpenClaw afterTurn              │
│     - Extract reasoning from thinking blocks    │
│     - Sanitize secrets before storage           │
│     - Store to FatHippo API                     │
├─────────────────────────────────────────────────┤
│  2. PATTERN EXTRACTION (extraction/)            │
│     - Cluster similar traces (embeddings)       │
│     - Identify successful approaches            │
│     - Calculate confidence scores               │
│     - Store patterns with provenance            │
├─────────────────────────────────────────────────┤
│  3. SKILL SYNTHESIS (synthesis/)                │
│     - Detect patterns ready for synthesis       │
│     - Generate SKILL.md content via LLM         │
│     - Quality scoring                           │
│     - Optional ClawHub publishing               │
├─────────────────────────────────────────────────┤
│  4. CONTEXT INJECTION (in assemble())           │
│     - Before session: find relevant traces      │
│     - Inject matching patterns                  │
│     - Auto-load synthesized skills              │
└─────────────────────────────────────────────────┘
```

## Integration with OpenClaw

This extends the existing `@fathippo/fathippo-context-engine`:

```typescript
// In context-engine's assemble():
async assemble(params) {
  // Existing: inject memories
  const memories = await this.getRelevantMemories(query);
  
  // NEW: inject traces and patterns
  const { traces, patterns } = await this.cognitiveEngine.getRelevantContext(query);
  
  // NEW: auto-load synthesized skills if pattern matches
  const skills = await this.cognitiveEngine.matchSkills(query);
  
  return {
    systemPromptAddition: formatAll(memories, traces, patterns, skills)
  };
}

// In context-engine's afterTurn():
async afterTurn(params) {
  // NEW: capture trace from completed turn
  if (this.shouldCaptureTrace(params)) {
    await this.cognitiveEngine.captureTrace({
      sessionId: params.sessionId,
      messages: params.messages,
      outcome: this.detectOutcome(params),
    });
  }
}
```

## Key Files to Implement

### hooks/trace-capture.ts
```typescript
export class TraceCapture {
  // Extract reasoning from thinking blocks in messages
  extractReasoning(messages: AgentMessage[]): string;
  
  // Detect problem type from conversation
  detectProblemType(messages: AgentMessage[]): TraceType;
  
  // Detect outcome (success/fail) from conversation
  detectOutcome(messages: AgentMessage[]): TraceOutcome;
  
  // Sanitize secrets from trace before storage
  sanitize(trace: CodingTrace): CodingTrace;
  
  // Store trace to FatHippo API
  store(trace: CodingTrace): Promise<void>;
}
```

### extraction/pattern-extractor.ts
```typescript
export class PatternExtractor {
  // Cluster similar traces using embeddings
  clusterTraces(traces: CodingTrace[]): TraceCluster[];
  
  // Extract pattern from a cluster of similar traces
  extractPattern(cluster: TraceCluster): Pattern | null;
  
  // Update pattern confidence based on new trace
  updatePatternConfidence(pattern: Pattern, trace: CodingTrace, outcome: TraceOutcome): Pattern;
  
  // Find patterns that might apply to a problem
  matchPatterns(problem: string, context: TraceContext): Pattern[];
}
```

### synthesis/skill-synthesizer.ts
```typescript
export class SkillSynthesizer {
  // Check if pattern is ready for synthesis
  isReadyForSynthesis(pattern: Pattern): boolean;
  
  // Generate SKILL.md content from pattern + traces
  synthesize(pattern: Pattern, traces: CodingTrace[]): SynthesizedSkill;
  
  // Validate generated skill quality
  validateSkill(skill: SynthesizedSkill): QualityReport;
  
  // Publish skill to ClawHub
  publishToClawHub(skill: SynthesizedSkill): Promise<string>;
}
```

### api/client.ts
```typescript
export class CognitiveClient {
  // Trace operations
  storeTrace(trace: StoreTraceRequest): Promise<StoreTraceResponse>;
  getRelevantTraces(request: GetRelevantTracesRequest): Promise<GetRelevantTracesResponse>;
  
  // Pattern operations
  getPatterns(domain?: string): Promise<Pattern[]>;
  matchPatterns(problem: string): Promise<Pattern[]>;
  submitPatternFeedback(feedback: PatternFeedbackRequest): Promise<void>;
  
  // Skill operations
  getSkillCandidates(): Promise<Pattern[]>;
  synthesizeSkill(request: SynthesizeSkillRequest): Promise<SynthesizedSkill>;
}
```

## Secret Sanitization (CRITICAL)

Before ANY trace leaves local or gets shared:

```typescript
const SECRET_PATTERNS = [
  /(['"]?)(?:api[_-]?key|apikey|secret|password|token|bearer|auth)(['"]?\s*[:=]\s*)(['"]?)[\w\-\.]+\3/gi,
  /sk-[a-zA-Z0-9]{32,}/g,           // OpenAI keys
  /ghp_[a-zA-Z0-9]{36}/g,           // GitHub tokens  
  /mem_[a-zA-Z0-9]{32,}/g,          // FatHippo keys
  /AKIA[A-Z0-9]{16}/g,              // AWS access keys
  /-----BEGIN.*PRIVATE KEY-----/gs,  // Private keys
  /mongodb(\+srv)?:\/\/[^\s]+/gi,   // MongoDB URIs
  /postgres(ql)?:\/\/[^\s]+/gi,     // Postgres URIs
];

// NEVER skip sanitization. NEVER publish unsanitized traces.
```

## Configuration

```yaml
# In OpenClaw config
contextEngines:
  - id: fathippo-cognitive
    config:
      apiKey: mem_xxx
      captureEnabled: true
      sanitizeSecrets: true          # ALWAYS true
      patternExtractionEnabled: true
      minTracesForPattern: 3
      skillSynthesisEnabled: true
      minPatternsForSkill: 5
      autoPublishToClawHub: false    # Manual review first
```

## Development

```bash
cd packages/cognitive-engine
pnpm install
pnpm build
pnpm test
```

## Testing Strategy

1. **Unit tests**: Sanitization, pattern matching, skill generation
2. **Integration tests**: Full trace → pattern → skill flow
3. **Dogfooding**: Run on FatHippo development itself

## What NOT to Open Source

- Pattern extraction algorithms
- Skill synthesis prompts
- Confidence scoring logic
- Cross-user aggregation code
