/**
 * Memory Decay Service
 * 
 * Implements Ebbinghaus-inspired forgetting curve.
 * Memories that aren't accessed decay over time.
 * Run this as a daily cron job.
 */

import {
  getMemoriesForDecay,
  updateMemoryStrength,
  archiveMemory,
  deleteArchivedMemories,
} from './db';
import { calculateDecayedStrength, shouldArchive } from './memory-heuristics';

// =============================================================================
// Types
// =============================================================================

export interface DecayRunResult {
  userId: string;
  memoriesProcessed: number;
  memoriesDecayed: number;
  memoriesArchived: number;
  memoriesDeleted: number;
  averageStrength: number;
}

// =============================================================================
// Constants
// =============================================================================

const RETENTION_RATE = 0.9;  // 90% retention per halflife period
const ARCHIVE_DELETE_DAYS = 30;

// =============================================================================
// Decay Functions
// =============================================================================

function daysBetween(date1: string | null, date2: Date): number {
  if (!date1) return 0;
  const d1 = new Date(date1);
  const diffMs = date2.getTime() - d1.getTime();
  return Math.max(0, diffMs / (1000 * 60 * 60 * 24));
}

function getEffectiveHalflife(memory: {
  halflifeDays: number;
  accessCount: number;
  feedbackScore: number;
}): number {
  const accessBoost = Math.min(memory.accessCount, 50) * 0.5;
  const feedbackBoost = memory.feedbackScore * 2;
  return Math.max(7, memory.halflifeDays + accessBoost + feedbackBoost);
}

/**
 * Run decay for a single user.
 * 
 * For each memory:
 * 1. Calculate decayed strength based on time since last access
 * 2. If below archive threshold, move to archive
 * 3. Delete memories that have been archived > 30 days
 */
export async function runDecayForUser(userId: string): Promise<DecayRunResult> {
  const now = new Date();
  const memories = await getMemoriesForDecay(userId);
  
  let memoriesDecayed = 0;
  let memoriesArchived = 0;
  let totalStrength = 0;
  
  for (const memory of memories) {
    // Skip already archived memories (they'll be cleaned up separately)
    if (memory.archivedAt) {
      continue;
    }
    
    // Calculate days since last access
    const daysSinceAccess = daysBetween(memory.lastAccessedAt, now);
    
    // Calculate decayed strength
    const newStrength = calculateDecayedStrength(
      memory.baseStrength,
      daysSinceAccess,
      getEffectiveHalflife(memory),
      RETENTION_RATE
    );
    
    totalStrength += newStrength;
    
    // Check if strength changed significantly
    const strengthDelta = Math.abs(memory.strength - newStrength);
    if (strengthDelta > 0.01) {
      memoriesDecayed++;
      
      // Check if should archive
      if (shouldArchive(newStrength)) {
        await archiveMemory(memory.id, userId);
        memoriesArchived++;
      } else {
        await updateMemoryStrength(memory.id, userId, newStrength);
      }
    }
  }
  
  // Clean up old archived memories
  const memoriesDeleted = await deleteArchivedMemories(userId, ARCHIVE_DELETE_DAYS);
  
  const activeMemories = memories.filter(m => !m.archivedAt).length;
  
  return {
    userId,
    memoriesProcessed: memories.length,
    memoriesDecayed,
    memoriesArchived,
    memoriesDeleted,
    averageStrength: activeMemories > 0 ? totalStrength / activeMemories : 0,
  };
}

// =============================================================================
// Batch Decay (for all users)
// =============================================================================

// Note: In production, you'd want to paginate through users
// For now, this expects a list of user IDs to process

export async function runDecayBatch(userIds: string[]): Promise<DecayRunResult[]> {
  const results: DecayRunResult[] = [];
  
  for (const userId of userIds) {
    try {
      const result = await runDecayForUser(userId);
      results.push(result);
    } catch (err) {
      console.error(`[decay] Failed for user ${userId}:`, err);
    }
  }
  
  return results;
}

// =============================================================================
// Health Check
// =============================================================================

export interface MemoryHealthStats {
  totalMemories: number;
  activeMemories: number;
  archivedMemories: number;
  averageStrength: number;
  strengthDistribution: {
    strong: number;     // > 0.8
    moderate: number;   // 0.5 - 0.8
    weak: number;       // 0.3 - 0.5
    dying: number;      // < 0.3
  };
}

export async function getMemoryHealth(userId: string): Promise<MemoryHealthStats> {
  const memories = await getMemoriesForDecay(userId);
  
  let strong = 0;
  let moderate = 0;
  let weak = 0;
  let dying = 0;
  let totalStrength = 0;
  let archived = 0;
  
  for (const memory of memories) {
    if (memory.archivedAt) {
      archived++;
      continue;
    }
    
    totalStrength += memory.strength;
    
    if (memory.strength > 0.8) {
      strong++;
    } else if (memory.strength > 0.5) {
      moderate++;
    } else if (memory.strength > 0.3) {
      weak++;
    } else {
      dying++;
    }
  }
  
  const active = memories.length - archived;
  
  return {
    totalMemories: memories.length,
    activeMemories: active,
    archivedMemories: archived,
    averageStrength: active > 0 ? totalStrength / active : 0,
    strengthDistribution: {
      strong,
      moderate,
      weak,
      dying,
    },
  };
}
