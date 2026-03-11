import { embedText } from "@/lib/embeddings";
import crypto from "node:crypto";
import type { MemoryCluster, ClusteredMemory } from "./clustering";

export type RefinementOptions = {
  temporalWindowDays?: number;
  minSubClusterSize?: number;
  similarityThreshold?: number;
};

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  return magnitude === 0 ? 0 : dot / magnitude;
}

function find(parent: number[], i: number): number {
  if (parent[i] !== i) {
    parent[i] = find(parent, parent[i]);
  }
  return parent[i];
}

function union(parent: number[], a: number, b: number): void {
  const rootA = find(parent, a);
  const rootB = find(parent, b);
  if (rootA !== rootB) {
    parent[rootB] = rootA;
  }
}

function buildClusterId(memoryIds: string[]): string {
  const hash = crypto
    .createHash("sha1")
    .update(memoryIds.slice().sort().join(":"))
    .digest("hex");
  return `refined_${hash.slice(0, 24)}`;
}

function buildTopic(memories: ClusteredMemory[]): string {
  const counts = new Map<string, number>();

  for (const memory of memories) {
    for (const entity of memory.derivedEntities) {
      const key = entity.toLowerCase().trim();
      if (key) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  if (top) {
    return top[0];
  }

  return memories[0]?.title ?? "Memory Cluster";
}

function getDaysDiff(date1: string, date2: string): number {
  const ms = Math.abs(new Date(date1).getTime() - new Date(date2).getTime());
  return ms / (1000 * 60 * 60 * 24);
}

/**
 * Refine coarse clusters by temporal adjacency + semantic similarity.
 *
 * Algorithm:
 * 1. For each input cluster, sort memories by createdAt
 * 2. Group memories into temporal windows (default 14 days)
 * 3. Within each window, compute pairwise embedding similarities
 * 4. Use union-find to group highly similar memories (threshold 0.82)
 * 5. Only keep sub-clusters meeting min size (default 3)
 * 6. Return refined clusters with new IDs
 */
export async function refineClustersBySemanticCoherence(
  clusters: MemoryCluster[],
  options?: RefinementOptions,
): Promise<MemoryCluster[]> {
  const {
    temporalWindowDays = 14,
    minSubClusterSize = 3,
    similarityThreshold = 0.82,
  } = options ?? {};

  const refinedClusters: MemoryCluster[] = [];

  for (const cluster of clusters) {
    // Sort memories by createdAt for temporal processing
    const sortedMemories = cluster.memories
      .slice()
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (sortedMemories.length < minSubClusterSize) {
      // Keep small clusters as-is
      refinedClusters.push(cluster);
      continue;
    }

    // Group into temporal windows
    const windows: ClusteredMemory[][] = [];
    let currentWindow: ClusteredMemory[] = [sortedMemories[0]];

    for (let i = 1; i < sortedMemories.length; i++) {
      const memory = sortedMemories[i];
      const windowStart = currentWindow[0].createdAt;
      const daysDiff = getDaysDiff(memory.createdAt, windowStart);

      if (daysDiff <= temporalWindowDays) {
        currentWindow.push(memory);
      } else {
        windows.push(currentWindow);
        currentWindow = [memory];
      }
    }
    if (currentWindow.length > 0) {
      windows.push(currentWindow);
    }

    // Process each temporal window
    for (const window of windows) {
      if (window.length < minSubClusterSize) {
        // Skip windows too small for meaningful clustering
        continue;
      }

      // Get embeddings for all memories in window
      const embeddings = await Promise.all(
        window.map((memory) => embedText(memory.text.slice(0, 4000))),
      );

      // Union-find clustering based on embedding similarity
      const parent = window.map((_, i) => i);

      for (let i = 0; i < window.length; i++) {
        for (let j = i + 1; j < window.length; j++) {
          const similarity = cosineSimilarity(embeddings[i], embeddings[j]);
          if (similarity >= similarityThreshold) {
            union(parent, i, j);
          }
        }
      }

      // Extract groups from union-find
      const groups = new Map<number, ClusteredMemory[]>();
      for (let i = 0; i < window.length; i++) {
        const root = find(parent, i);
        const group = groups.get(root) ?? [];
        group.push(window[i]);
        groups.set(root, group);
      }

      // Create refined clusters from groups meeting min size
      for (const group of groups.values()) {
        if (group.length >= minSubClusterSize) {
          const topic = buildTopic(group);
          const entityKeys = Array.from(
            new Set(
              group.flatMap((memory) =>
                memory.derivedEntities.map((entity) => entity.toLowerCase().trim()),
              ),
            ),
          );

          refinedClusters.push({
            id: buildClusterId(group.map((memory) => memory.id)),
            userId: cluster.userId,
            topic,
            memories: group,
            entityKeys,
          });
        }
      }
    }

    // If no refined clusters were created from this cluster, keep the original
    const hasRefinedFromThisCluster = refinedClusters.some(
      (rc) => rc.userId === cluster.userId && rc.memories.some((m) =>
        cluster.memories.some((cm) => cm.id === m.id)
      )
    );

    if (!hasRefinedFromThisCluster) {
      refinedClusters.push(cluster);
    }
  }

  return refinedClusters;
}
