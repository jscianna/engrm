# FatHippo Context Engine Specification

## Overview

Replace OpenClaw's native memory/compaction with FatHippo as the **entire context layer**. Not a hook that injects — the system that owns memory.

## Package

```
@fathippo/context-engine
```

Install: `openclaw plugins install @fathippo/context-engine`

## Configuration

```yaml
# ~/.openclaw/config.yaml
agents:
  defaults:
    context:
      engine: "@fathippo/context-engine"
      config:
        apiKey: "${FATHIPPO_API_KEY}"
        # Optional overrides
        injectCritical: true        # Auto-inject critical memories
        injectLimit: 20             # Max memories per turn
        captureUserOnly: true       # Don't capture assistant messages
        dreamCycleOnCompact: true   # Run Dream Cycle during compaction
        conversationId: null        # Scope memories (null = derive from session)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     OpenClaw Session                         │
├─────────────────────────────────────────────────────────────┤
│  bootstrap()     →  Load critical + recent from FatHippo    │
│  ingest()        →  Capture turn, store to FatHippo         │
│  assemble()      →  Query FatHippo, build context           │
│  compact()       →  Run Dream Cycle (synthesis, decay)      │
│  afterTurn()     →  Async: entities, reflection, edges      │
│  prepareSubagentSpawn() → Scope memories for child          │
│  onSubagentEnded()      → Absorb child learnings            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   FatHippo API  │
                    │  (encrypted)    │
                    └─────────────────┘
```

## Hook Implementations

### 1. bootstrap(session)

Called when session starts. Load context foundation.

```typescript
async bootstrap(session: Session): Promise<BootstrapResult> {
  const userId = await resolveUserId(session);
  
  // 1. Load critical-tier memories (synthesized principles first)
  const critical = await fathippo.getCriticalMemories(userId, {
    excludeAbsorbed: true,
    limit: 30,
  });
  
  // 2. Load recent conversation context (last 24h)
  const recent = await fathippo.getRecentMemories(userId, {
    hours: 24,
    limit: 10,
  });
  
  // 3. Load active session context if resuming
  const sessionContext = await fathippo.getSessionContext(session.id);
  
  return {
    systemContext: formatCriticalMemories(critical),
    priorContext: formatRecentMemories(recent),
    sessionState: sessionContext,
  };
}
```

### 2. ingest(turn)

Called after each turn. Capture and store.

```typescript
async ingest(turn: Turn): Promise<void> {
  // Only capture user messages (avoid self-poisoning)
  if (turn.role !== 'user' || !this.config.captureUserOnly) {
    return;
  }
  
  // Filter prompt injection attempts
  if (detectPromptInjection(turn.content)) {
    return;
  }
  
  // Check capture triggers (decisions, preferences, facts)
  const shouldCapture = matchesCapturePatterns(turn.content);
  if (!shouldCapture) {
    return;
  }
  
  // Store memory
  await fathippo.remember({
    content: turn.content,
    conversationId: this.config.conversationId || turn.sessionId,
    metadata: {
      turnId: turn.id,
      timestamp: turn.timestamp,
    },
  });
}
```

### 3. assemble(context)

Called before each LLM call. Build the context window.

```typescript
async assemble(context: AssembleContext): Promise<AssembledContext> {
  const userId = context.userId;
  const query = context.lastUserMessage;
  
  // 1. Semantic search for relevant memories
  const relevant = await fathippo.search({
    query,
    limit: this.config.injectLimit,
    excludeAbsorbed: true,
  });
  
  // 2. Get critical memories (always injected)
  const critical = this.config.injectCritical 
    ? await fathippo.getCriticalMemories(userId, { limit: 15 })
    : [];
  
  // 3. Dedupe and merge
  const memories = dedupeMemories([...critical, ...relevant]);
  
  // 4. Format for injection
  const memoryBlock = formatMemoriesForInjection(memories);
  
  return {
    ...context,
    prependSystemContext: memoryBlock,  // Uses new prepend field for caching
  };
}
```

### 4. compact(session)

Called when context window fills. Run Dream Cycle instead of lossy compaction.

```typescript
async compact(session: Session): Promise<CompactResult> {
  if (!this.config.dreamCycleOnCompact) {
    // Fall back to default compaction
    return { useDefault: true };
  }
  
  const userId = session.userId;
  
  // Run Dream Cycle phases
  await fathippo.runDreamCycle(userId, {
    // 1. Process completed tasks
    processCompleted: true,
    // 2. Process ephemeral memories
    processEphemeral: true,
    // 3. Cluster and synthesize critical memories
    synthesizeCritical: true,
    // 4. Decay unused memories
    applyDecay: true,
    // 5. Build/update graph edges
    updateGraph: true,
  });
  
  // Return fresh context (no lossy summarization needed)
  const freshContext = await this.bootstrap(session);
  
  return {
    useDefault: false,
    newContext: freshContext,
  };
}
```

### 5. afterTurn(turn)

Async post-turn processing. Non-blocking.

```typescript
async afterTurn(turn: Turn): Promise<void> {
  // Queue async processing (don't block response)
  await fathippo.queueProcessing({
    turnId: turn.id,
    userId: turn.userId,
    tasks: [
      'extractEntities',      // NER on turn content
      'detectImportance',     // Classify importance tier
      'buildRelationships',   // Find related memories
      'updateAccessPatterns', // Track what was useful
    ],
  });
}
```

### 6. prepareSubagentSpawn(spawn)

Scope memories for spawned subagents.

```typescript
async prepareSubagentSpawn(spawn: SubagentSpawn): Promise<SpawnContext> {
  const parentUserId = spawn.parentSession.userId;
  
  // Get task-relevant memories for the subagent
  const taskMemories = await fathippo.search({
    query: spawn.task,
    userId: parentUserId,
    limit: 10,
  });
  
  // Get critical memories (always needed)
  const critical = await fathippo.getCriticalMemories(parentUserId, {
    limit: 10,
  });
  
  return {
    inheritedContext: formatMemoriesForInjection([...critical, ...taskMemories]),
    // Subagent gets read access to parent's memories
    // but writes to its own scoped space
    memoryScope: `subagent:${spawn.id}`,
  };
}
```

### 7. onSubagentEnded(result)

Absorb learnings from completed subagent.

```typescript
async onSubagentEnded(result: SubagentResult): Promise<void> {
  if (!result.success) return;
  
  const parentUserId = result.parentSession.userId;
  
  // Extract key learnings from subagent's work
  const learnings = await extractLearnings(result.transcript);
  
  // Store as memories in parent's space
  for (const learning of learnings) {
    await fathippo.remember({
      userId: parentUserId,
      content: learning.content,
      title: `[From ${result.agentId}] ${learning.title}`,
      metadata: {
        source: 'subagent',
        subagentId: result.id,
        task: result.task,
      },
    });
  }
  
  // Clean up subagent's scoped memories (optional)
  if (this.config.cleanupSubagentMemories) {
    await fathippo.deleteScope(`subagent:${result.id}`);
  }
}
```

## API Additions Required

New FatHippo API endpoints to support context engine:

```typescript
// GET /v1/memories/critical
// Returns critical-tier memories for injection

// GET /v1/memories/recent?hours=24
// Returns recent memories within time window

// POST /v1/dream-cycle/run
// Triggers Dream Cycle processing

// POST /v1/processing/queue
// Queues async turn processing

// GET /v1/session/:id/context
// Returns stored session context

// DELETE /v1/scope/:scopeId
// Deletes all memories in a scope (for subagent cleanup)
```

## Migration Path

From `@fathippo/openclaw-hook` to `@fathippo/context-engine`:

1. Users install new package
2. Update config from hooks to context engine
3. Existing memories work unchanged
4. New captures use context engine pipeline

```yaml
# Before (hook)
plugins:
  hooks:
    - "@fathippo/openclaw-hook"

# After (context engine)  
agents:
  defaults:
    context:
      engine: "@fathippo/context-engine"
      config:
        apiKey: "${FATHIPPO_API_KEY}"
```

## Advantages Over Hook Approach

| Aspect | Hook | Context Engine |
|--------|------|----------------|
| Injection timing | Before agent start only | Every turn (assemble) |
| Compaction | OpenClaw's lossy default | Dream Cycle (lossless) |
| Subagent support | None | Full inheritance + absorption |
| Context placement | User prompt space | System prompt (cacheable) |
| Turn capture | Post-hoc | Integrated pipeline |

## Implementation Priority

1. **Phase 1**: Basic hooks (bootstrap, ingest, assemble)
2. **Phase 2**: Compaction replacement (compact, afterTurn)
3. **Phase 3**: Subagent support (prepareSubagentSpawn, onSubagentEnded)
4. **Phase 4**: Conversation scoping (per-topic/per-project memories)

## Package Structure

```
@fathippo/context-engine/
├── src/
│   ├── index.ts           # Plugin entry point
│   ├── engine.ts          # ContextEngine implementation
│   ├── hooks/
│   │   ├── bootstrap.ts
│   │   ├── ingest.ts
│   │   ├── assemble.ts
│   │   ├── compact.ts
│   │   ├── afterTurn.ts
│   │   └── subagent.ts
│   ├── api/
│   │   └── client.ts      # FatHippo API client
│   └── utils/
│       ├── formatting.ts  # Memory → prompt formatting
│       ├── filtering.ts   # Injection filtering
│       └── extraction.ts  # Learning extraction
├── package.json
└── README.md
```

## Next Steps

1. Review OpenClaw ContextEngine plugin interface docs
2. Implement Phase 1 (bootstrap, ingest, assemble)
3. Test with existing FatHippo API
4. Add new API endpoints as needed
5. Publish to npm
