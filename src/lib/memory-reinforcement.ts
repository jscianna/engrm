/**
 * Memory Reinforcement Service
 * 
 * Handles the "fire together, wire together" logic:
 * - Checks if incoming memory is similar to existing ones
 * - If similar: reinforce instead of creating new
 * - If novel: create new memory
 */

import {
  getMemoriesWithEmbeddings,
  reinforceMemory,
  insertMemoryWithMetadata,
  type MemoryWithEmbedding,
  type AgentMemoryRecord,
} from './db';
import {
  scoreMemory,
  calculateFrequencyBoost,
  TYPE_HALFLIVES,
  type MemoryType,
  type ScoringResult,
} from './memory-heuristics';

// =============================================================================
// Types
// =============================================================================

export interface StoreMemoryInput {
  userId: string;
  text: string;
  embedding: number[];
  title?: string;
  namespaceId?: string | null;
  sessionId?: string | null;
  conversationId?: string;
  metadata?: Record<string, unknown>;
  // If provided, skip scoring and use these values
  preScored?: {
    score: number;
    type: MemoryType;
    entities: string[];
  };
}

export interface StoreMemoryResult {
  action: 'created' | 'reinforced' | 'skipped';
  memoryId: string;
  strength: number;
  mentionCount: number;
  similarityToExisting?: number;
  scoringResult?: ScoringResult;
}

// =============================================================================
// Constants
// =============================================================================

const SIMILARITY_THRESHOLD = 0.85;  // Above this = same memory, reinforce
const STORAGE_THRESHOLD = 6.0;       // Below this = don't store

// =============================================================================
// Similarity Functions
// =============================================================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

function findMostSimilar(
  embedding: number[],
  memories: MemoryWithEmbedding[]
): { memory: MemoryWithEmbedding; similarity: number } | null {
  if (memories.length === 0) return null;
  
  let bestMatch: MemoryWithEmbedding | null = null;
  let bestSimilarity = 0;
  
  for (const memory of memories) {
    if (memory.embedding.length === 0) continue;
    
    const similarity = cosineSimilarity(embedding, memory.embedding);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = memory;
    }
  }
  
  return bestMatch ? { memory: bestMatch, similarity: bestSimilarity } : null;
}

// =============================================================================
// Reinforcement Logic
// =============================================================================

function calculateReinforcedStrength(
  existingStrength: number,
  newScore: number,
  mentionCount: number
): number {
  // EMA update
  const triggerIntensity = newScore / 10;
  const emaStrength = (existingStrength * 0.7) + (triggerIntensity * 0.3);
  
  // Apply frequency boost
  const frequencyBoost = calculateFrequencyBoost(mentionCount);
  
  // Cap at 2.5x base strength (assume base = 1.0)
  return Math.min(emaStrength * frequencyBoost, 2.5);
}

// =============================================================================
// Main Store Function
// =============================================================================

/**
 * Store or reinforce a memory based on similarity to existing memories.
 * 
 * If embedding is similar (>0.85) to an existing memory:
 *   - Don't create new memory
 *   - Reinforce existing memory (increase strength, merge entities)
 * 
 * If novel:
 *   - Score using heuristics
 *   - Only store if score >= 6.0
 *   - Create with appropriate type and halflife
 */
export async function storeOrReinforce(
  input: StoreMemoryInput
): Promise<StoreMemoryResult> {
  // Step 1: Score the memory (unless pre-scored)
  let scoringResult: ScoringResult;
  if (input.preScored) {
    scoringResult = {
      score: input.preScored.score,
      type: input.preScored.type,
      entities: input.preScored.entities,
      signals: [],
      shouldStore: input.preScored.score >= STORAGE_THRESHOLD,
      breakdown: {} as ScoringResult['breakdown'],
    };
  } else {
    scoringResult = scoreMemory(input.text);
  }
  
  // Step 2: Check if below threshold
  if (!scoringResult.shouldStore) {
    return {
      action: 'skipped',
      memoryId: '',
      strength: 0,
      mentionCount: 0,
      scoringResult,
    };
  }
  
  // Step 3: Get existing memories with embeddings
  const existingMemories = await getMemoriesWithEmbeddings(
    input.userId,
    input.namespaceId
  );
  
  // Step 4: Find most similar
  const match = findMostSimilar(input.embedding, existingMemories);
  
  // Step 5: If similar enough, reinforce instead of creating
  if (match && match.similarity >= SIMILARITY_THRESHOLD) {
    const existingMemory = match.memory;
    const newMentionCount = existingMemory.mentionCount + 1;
    const newStrength = calculateReinforcedStrength(
      existingMemory.strength,
      scoringResult.score,
      newMentionCount
    );
    
    await reinforceMemory(existingMemory.id, input.userId, {
      newStrength,
      mentionCount: newMentionCount,
      entities: scoringResult.entities,
      conversationId: input.conversationId,
    });
    
    return {
      action: 'reinforced',
      memoryId: existingMemory.id,
      strength: newStrength,
      mentionCount: newMentionCount,
      similarityToExisting: match.similarity,
      scoringResult,
    };
  }
  
  // Step 6: Create new memory
  const halflifeDays = TYPE_HALFLIVES[scoringResult.type] || 60;
  
  const newMemory = await insertMemoryWithMetadata({
    userId: input.userId,
    title: input.title,
    text: input.text,
    embedding: input.embedding,
    memoryType: scoringResult.type,
    importance: Math.round(scoringResult.score),
    halflifeDays,
    entities: scoringResult.entities,
    conversationId: input.conversationId,
    namespaceId: input.namespaceId,
    sessionId: input.sessionId,
    metadata: {
      ...input.metadata,
      scoring: {
        score: scoringResult.score,
        signals: scoringResult.signals,
      },
    },
  });
  
  return {
    action: 'created',
    memoryId: newMemory.id,
    strength: 1.0,
    mentionCount: 1,
    similarityToExisting: match?.similarity,
    scoringResult,
  };
}

// =============================================================================
// Batch Processing
// =============================================================================

export interface BatchStoreResult {
  created: number;
  reinforced: number;
  skipped: number;
  results: StoreMemoryResult[];
}

export async function batchStoreMemories(
  inputs: StoreMemoryInput[]
): Promise<BatchStoreResult> {
  const results: StoreMemoryResult[] = [];
  let created = 0;
  let reinforced = 0;
  let skipped = 0;
  
  for (const input of inputs) {
    const result = await storeOrReinforce(input);
    results.push(result);
    
    switch (result.action) {
      case 'created':
        created++;
        break;
      case 'reinforced':
        reinforced++;
        break;
      case 'skipped':
        skipped++;
        break;
    }
  }
  
  return { created, reinforced, skipped, results };
}

// =============================================================================
// Co-Retrieval Strengthening
// =============================================================================

/**
 * When memories are retrieved together, strengthen their bonds.
 * This implements the "fire together, wire together" principle.
 */
export async function strengthenCoRetrieved(
  userId: string,
  memoryIds: string[]
): Promise<void> {
  if (memoryIds.length < 2) return;
  
  // Import createMemoryEdge dynamically to avoid circular deps
  const { createMemoryEdge, updateMemoryAccess } = await import('./db');
  
  // Update access for all memories
  for (const id of memoryIds) {
    await updateMemoryAccess(id, userId);
  }
  
  // Strengthen edges between all pairs
  for (let i = 0; i < memoryIds.length; i++) {
    for (let j = i + 1; j < memoryIds.length; j++) {
      try {
        await createMemoryEdge({
          userId,
          sourceId: memoryIds[i],
          targetId: memoryIds[j],
          relationshipType: 'similar',
          weight: 0.5,  // Incremental weight, will accumulate via ON CONFLICT
          metadata: { source: 'co_retrieval' },
        });
      } catch (err) {
        // Ignore errors (might be edge already exists, etc.)
        console.warn('[strengthenCoRetrieved] Edge creation failed:', err);
      }
    }
  }
}
