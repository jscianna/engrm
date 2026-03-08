# Critical Memory Synthesis Specification

## Problem
- 40+ critical memories injected = token waste
- Many are tactical (completed tasks) not strategic (principles)
- Related memories should compress into compact principles

## Architecture

### 1. Critical Memory Clustering

```typescript
interface CriticalCluster {
  id: string;
  theme: string;  // e.g., "privacy", "ux-principles", "workflow"
  memories: MemoryRecord[];
  themeEmbedding: number[];
}

async function clusterCriticalMemories(userId: string): Promise<CriticalCluster[]> {
  // Get all critical-tier memories (excluding completed/absorbed)
  const critical = await getCriticalMemories(userId, {
    excludeCompleted: true,
    excludeAbsorbed: true,
  });
  
  // Use existing clusterMemories() but filtered to critical only
  // Tighter similarity threshold (0.8 vs 0.75) for principle grouping
  const clusters = await clusterByEmbedding(critical, {
    minSimilarity: 0.8,
    maxClusterSize: 8,
    minClusterSize: 2,  // Singles stay as-is
  });
  
  // Label each cluster with a theme using LLM
  return Promise.all(clusters.map(labelClusterTheme));
}
```

### 2. Principle Synthesis (Different from Episodic)

```typescript
const PRINCIPLE_SYNTHESIS_PROMPT = `
Synthesize these related critical memories into ONE compact principle (1-2 sentences max).

Focus on:
- The UNDERLYING RULE, not specific instances
- Action-oriented guidance
- What to DO or NOT DO

Memories:
{memories}

Output format: A single imperative principle that captures the essence.
Do NOT include examples or context - just the distilled rule.
`;

interface SynthesizedPrinciple {
  id: string;
  principle: string;  // "Privacy-first: encrypt at rest, never log content"
  theme: string;
  sourceMemoryIds: string[];
  importanceTier: "critical";
  synthesizedAt: string;
}
```

### 3. Absorption Tracking

```typescript
async function absorbMemoriesIntoSynthesis(
  userId: string,
  synthesisId: string,
  memoryIds: string[],
): Promise<void> {
  const now = new Date().toISOString();
  
  // Mark originals as absorbed
  await db.execute({
    sql: `UPDATE memories 
          SET absorbed_by = ?, absorbed_at = ?, importance_tier = 'normal'
          WHERE id IN (${memoryIds.map(() => '?').join(',')}) AND user_id = ?`,
    args: [synthesisId, now, ...memoryIds, userId],
  });
  
  // Create graph edges: synthesis derives_from each source
  await Promise.all(memoryIds.map(memoryId => 
    createGraphEdge({
      userId,
      sourceId: synthesisId,
      sourceType: "synthesis",
      targetId: memoryId,
      targetType: "memory",
      edgeType: "derives_from",
    })
  ));
}
```

### 4. Completed Task Handling

```typescript
const COMPLETION_DETECTION_PATTERNS = [
  /\b(fixed|implemented|deployed|shipped|done|completed|resolved)\b/i,
  /\bcommit [a-f0-9]{7,}\b/i,  // Has commit hash
  /\b(v\d+\.\d+|version \d+)\b/i,  // Has version number
];

async function processCompletedMemories(userId: string): Promise<void> {
  // Get critical memories that look like completed tasks
  const critical = await getCriticalMemories(userId);
  
  for (const memory of critical) {
    const looksCompleted = COMPLETION_DETECTION_PATTERNS.some(p => 
      p.test(memory.title) || p.test(memory.contentText)
    );
    
    if (looksCompleted && !memory.completed) {
      // Ask LLM: Is this a completed task? If so, extract any lasting principle.
      const analysis = await analyzePotentialCompletion(memory);
      
      if (analysis.isCompleted) {
        await markMemoryCompleted(userId, memory.id, analysis.extractedPrinciple);
      }
    }
  }
}

async function markMemoryCompleted(
  userId: string,
  memoryId: string,
  extractedPrinciple?: string,
): Promise<void> {
  const now = new Date().toISOString();
  
  // Demote from critical to normal
  await db.execute({
    sql: `UPDATE memories 
          SET completed = 1, completed_at = ?, importance_tier = 'normal'
          WHERE id = ? AND user_id = ?`,
    args: [now, memoryId, userId],
  });
  
  // If there's a lasting principle, create new critical memory for it
  if (extractedPrinciple) {
    await createMemory({
      userId,
      title: `Principle: ${extractedPrinciple.slice(0, 50)}`,
      content: extractedPrinciple,
      importanceTier: "critical",
      sourceType: "synthesis",
      metadata: { derivedFrom: memoryId },
    });
  }
}
```

### 5. Ephemeral Memory Handling

```typescript
async function processEphemeralMemories(userId: string): Promise<void> {
  // Get ephemeral memories older than 7 days
  const ephemeral = await getEphemeralMemories(userId, { olderThanDays: 7 });
  
  for (const memory of ephemeral) {
    // Try to extract principle before allowing decay
    const principle = await extractPrincipleIfAny(memory);
    
    if (principle) {
      // Create principle memory, mark original absorbed
      const synthesisId = await createPrincipleMemory(userId, principle, memory.id);
      await absorbMemoriesIntoSynthesis(userId, synthesisId, [memory.id]);
    } else {
      // No principle - just demote and let decay naturally
      await demoteMemory(userId, memory.id, "normal");
    }
  }
}
```

### 6. Injection Changes

```typescript
async function getInjectionContext(userId: string, query: string): Promise<string> {
  // Get SYNTHESIZED principles first (fewer tokens, distilled knowledge)
  const principles = await getSynthesizedPrinciples(userId, {
    importanceTier: "critical",
    limit: 5,
  });
  
  // Get relevant non-absorbed critical memories
  const critical = await getCriticalMemories(userId, {
    excludeAbsorbed: true,  // Don't inject if already in a synthesis
    limit: 5,
  });
  
  // Get relevant episodic memories
  const relevant = await searchMemories(userId, query, {
    excludeAbsorbed: true,
    limit: 5,
  });
  
  return formatContext(principles, critical, relevant);
}
```

## Dream Cycle Integration

Add to `runDreamCycle()`:

```typescript
// 1. Process completed tasks (detect & demote)
await processCompletedMemories(userId);

// 2. Process ephemeral memories (extract principles before decay)
await processEphemeralMemories(userId);

// 3. Cluster and synthesize related critical memories
const criticalClusters = await clusterCriticalMemories(userId);
for (const cluster of criticalClusters) {
  if (cluster.memories.length >= 2) {
    const synthesis = await synthesizeClusterToPrinciple(userId, cluster);
    await absorbMemoriesIntoSynthesis(userId, synthesis.id, cluster.memories.map(m => m.id));
  }
}
```

## LLM Cost Optimization

1. **Batch completion detection** - Check multiple memories in one call
2. **Skip unchanged clusters** - Only re-synthesize if source memories changed
3. **Cache embeddings** - Already have embedding_hash for dedup
4. **Lazy principle extraction** - Only extract from high-access memories

## Migration

For existing memories:
1. Run `processCompletedMemories()` to detect already-completed tasks
2. Run `clusterCriticalMemories()` to create initial syntheses
3. Mark absorbed originals

## Success Metrics

- Critical injection count: 40 → 10 (75% reduction)
- Token usage per injection: Track via analytics
- Principle quality: Manual review of synthesized principles
