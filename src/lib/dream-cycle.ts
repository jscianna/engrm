import {
  createMemoryEdge,
  createGraphEdge,
  getMemoriesByIds,
  getSynthesizedMemoryByClusterId,
  listMemoryEdgesByUser,
  listMemoryRecordsByUser,
  listSynthesizedMemoriesByUser,
  markSynthesizedMemoryStale,
  upsertSynthesizedMemory,
  validateSynthesizedMemories,
} from "@/lib/db";
import { embedText } from "@/lib/embeddings";
import type { SynthesizedMemoryRecord } from "@/lib/types";
import { clusterMemories, type MemoryCluster } from "@/lib/synthesis/clustering";
import {
  absorbMemoriesIntoSynthesis as absorbCriticalMemoriesIntoSynthesis,
  clusterCriticalMemories,
  synthesizeClusterToPrinciple,
} from "@/lib/synthesis/critical-synthesis";
import { synthesizeCluster } from "@/lib/synthesis/synthesize";
import { semanticSearchVectors } from "@/lib/vector";
import { processCompletedMemories, processEphemeralMemories } from "@/lib/memory/critical-processing";

export type DreamBondSuggestion = {
  leftId: string;
  rightId: string;
  leftTitle: string;
  rightTitle: string;
  score: number;
  persisted: boolean;
};

export type DreamPromotionSuggestion = {
  memoryId: string;
  title: string;
  from: "episodic";
  to: "semantic";
  reason: string;
};

export type DreamDecayPoint = {
  day: number;
  retained: number;
  count: number;
};

export type DreamCycleResult = {
  generatedAt: string;
  bonds: DreamBondSuggestion[];
  promotions: DreamPromotionSuggestion[];
  decay: DreamDecayPoint[];
  syntheses: SynthesizedMemoryRecord[];
};

function dayDiff(createdAt: string): number {
  const millis = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, millis / (1000 * 60 * 60 * 24));
}

export async function saveBond(params: {
  userId: string;
  leftId: string;
  rightId: string;
  score?: number;
  metadata?: Record<string, unknown> | null;
}) {
  return createMemoryEdge({
    userId: params.userId,
    sourceId: params.leftId,
    targetId: params.rightId,
    relationshipType: "similar",
    weight: params.score ?? 1,
    metadata: params.metadata ?? null,
  });
}

export async function runDreamCycle(userId: string): Promise<DreamCycleResult> {
  const memories = await listMemoryRecordsByUser(userId, 120);
  const memoryById = new Map(memories.map((memory) => [memory.id, { id: memory.id, userId: memory.userId, title: memory.title }]));
  const existingEdges = await listMemoryEdgesByUser(userId, 600);
  const existingSimilarEdges = existingEdges.filter((edge) => edge.relationshipType === "similar");
  const existingPairKeys = new Set(
    existingSimilarEdges.map((edge) => [edge.sourceId, edge.targetId].sort().join(":")),
  );
  const candidateSet = memories
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 14);

  const bondsMap = new Map<string, DreamBondSuggestion>();
  const vectors = await Promise.all(candidateSet.map((memory) => embedText(memory.contentText.slice(0, 6000))));
  const relatedLists = await Promise.all(
    candidateSet.map((memory, index) =>
      semanticSearchVectors({
        userId,
        query: memory.contentText.slice(0, 600),
        vector: vectors[index],
        topK: 3,
      }),
    ),
  );

  const missingIds = new Set<string>();
  for (const [index, related] of relatedLists.entries()) {
    const source = candidateSet[index];
    for (const hit of related) {
      if (hit.item.id === source.id || hit.score < 0.75) {
        continue;
      }
      if (!memoryById.has(hit.item.id)) {
        missingIds.add(hit.item.id);
      }
    }
  }
  if (missingIds.size > 0) {
    const fetched = await getMemoriesByIds(userId, Array.from(missingIds));
    for (const memory of fetched) {
      memoryById.set(memory.id, memory);
    }
  }

  for (const [index, related] of relatedLists.entries()) {
    const memory = candidateSet[index];
    for (const hit of related) {
      if (hit.item.id === memory.id || hit.score < 0.75) {
        continue;
      }

      const other = memoryById.get(hit.item.id);
      if (!other || other.userId !== userId) {
        continue;
      }

      const pair = [memory.id, other.id].sort();
      const pairKey = `${pair[0]}:${pair[1]}`;
      if (bondsMap.has(pairKey)) {
        continue;
      }

      bondsMap.set(pairKey, {
        leftId: memory.id,
        rightId: other.id,
        leftTitle: memory.title,
        rightTitle: other.title,
        score: hit.score,
        persisted: existingPairKeys.has(pairKey),
      });
    }
  }

  for (const edge of existingSimilarEdges) {
    const left = memoryById.get(edge.sourceId);
    const right = memoryById.get(edge.targetId);
    if (!left || !right) {
      continue;
    }
    const pairKey = [left.id, right.id].sort().join(":");
    if (bondsMap.has(pairKey)) {
      continue;
    }
    bondsMap.set(pairKey, {
      leftId: left.id,
      rightId: right.id,
      leftTitle: left.title,
      rightTitle: right.title,
      score: edge.weight,
      persisted: true,
    });
  }

  const bonds = Array.from(bondsMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  await Promise.all(
    bonds
      .filter((bond) => !bond.persisted && bond.score > 0.85)
      .map(async (bond) => {
        await saveBond({
          userId,
          leftId: bond.leftId,
          rightId: bond.rightId,
          score: bond.score,
          metadata: { source: "dream_cycle_auto" },
        });
        bond.persisted = true;
      }),
  );

  const promotions = candidateSet
    .filter((memory) => memory.memoryType === "episodic")
    .filter((memory) => memory.importance >= 7 || dayDiff(memory.createdAt) > 14)
    .slice(0, 6)
    .map((memory) => ({
      memoryId: memory.id,
      title: memory.title,
      from: "episodic" as const,
      to: "semantic" as const,
      reason:
        memory.importance >= 7
          ? `High importance (${memory.importance}/10) suggests long-term retention value.`
          : "Aging episodic memory appears stable enough to consolidate as semantic knowledge.",
    }));

  const decay = Array.from({ length: 10 }).map((_, idx) => {
    const day = idx * 3;
    const inWindow = memories.filter((memory) => {
      const age = dayDiff(memory.createdAt);
      return age >= day && age < day + 3;
    });

    const retained =
      inWindow.length === 0
        ? 0
        : inWindow.reduce((acc, memory) => {
            const age = dayDiff(memory.createdAt);
            const halfLife = 18 - Math.min(memory.importance, 10);
            const score = Math.exp(-age / Math.max(halfLife, 3));
            return acc + score;
          }, 0) / inWindow.length;

    return {
      day,
      retained: Number((retained * 100).toFixed(1)),
      count: inWindow.length,
    };
  });

  await processCompletedMemories(userId);
  await processEphemeralMemories(userId);

  const criticalClusters = await clusterCriticalMemories(userId);
  for (const cluster of criticalClusters) {
    if (cluster.memories.length < 2) {
      continue;
    }
    const synthesis = await synthesizeClusterToPrinciple(userId, cluster);
    await absorbCriticalMemoriesIntoSynthesis(
      userId,
      synthesis.id,
      cluster.memories.map((memory) => memory.id),
    );
  }

  const clusters = await clusterMemories(userId);
  const currentClusterIds = new Set(clusters.map((cluster) => cluster.id));
  const existingSyntheses = await listSynthesizedMemoriesByUser(userId, 500);

  await Promise.all(
    existingSyntheses.map(async (synthesis) => {
      const currentCluster = clusters.find((cluster) => cluster.id === synthesis.clusterId);
      const currentIds = currentCluster?.memories.map((memory) => memory.id).sort() ?? [];
      const previousIds = synthesis.sourceMemoryIds.slice().sort();
      const sourceSetChanged =
        currentIds.length === 0 ||
        currentIds.length !== previousIds.length ||
        currentIds.some((id, index) => id !== previousIds[index]);

      if (!currentClusterIds.has(synthesis.clusterId) || sourceSetChanged) {
        await markSynthesizedMemoryStale(userId, synthesis.id, true);
      }
    }),
  );

  const syntheses: SynthesizedMemoryRecord[] = [];
  for (const cluster of clusters) {
    const synthesized = await synthesizeClusterIfNeeded(userId, cluster);
    if (synthesized) {
      syntheses.push(synthesized);
    }
  }

  await validateSynthesizedMemories(userId);

  return {
    generatedAt: new Date().toISOString(),
    bonds,
    promotions,
    decay,
    syntheses,
  };
}

async function synthesizeClusterIfNeeded(
  userId: string,
  cluster: MemoryCluster,
): Promise<SynthesizedMemoryRecord | null> {
  if (cluster.memories.length < 3) {
    return null;
  }

  const existing = await getSynthesizedMemoryByClusterId(userId, cluster.id);
  const sourceIds = cluster.memories.map((memory) => memory.id);
  const sourceIdsKey = sourceIds.slice().sort().join(":");
  const existingIdsKey = existing?.sourceMemoryIds.slice().sort().join(":") ?? "";
  const needsRefresh = !existing || existing.stale || sourceIdsKey !== existingIdsKey;

  if (!needsRefresh) {
    return existing;
  }

  const synthesized = await synthesizeCluster(cluster);
  const savedSynthesis = await upsertSynthesizedMemory({
    id: existing?.id,
    userId,
    synthesis: synthesized.synthesis,
    title: synthesized.title,
    sourceMemoryIds: sourceIds,
    sourceCount: cluster.memories.length,
    clusterId: cluster.id,
    clusterTopic: cluster.topic,
    compressionRatio: synthesized.compressionRatio,
    confidence: synthesized.confidence,
    synthesizedAt: new Date().toISOString(),
    lastValidatedAt: new Date().toISOString(),
    stale: false,
    importanceTier: existing?.importanceTier ?? "normal",
    accessCount: existing?.accessCount ?? 0,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    synthesisQualityScore: synthesized.qualityScore,
    synthesisMetadata: synthesized.metadata,
  });

  // Create graph edges linking synthesis to source memories (decentralized graph model)
  // Only create edges for new syntheses or when sources changed
  if (!existing || sourceIdsKey !== existingIdsKey) {
    await Promise.all(
      sourceIds.map((memoryId) =>
        createGraphEdge({
          userId,
          sourceId: savedSynthesis.id,
          sourceType: "synthesis",
          targetId: memoryId,
          targetType: "memory",
          edgeType: "derives_from",
          weight: 1.0,
          metadata: { clusterId: cluster.id, clusterTopic: cluster.topic },
        }).catch(() => {
          // Ignore duplicate edge errors (UNIQUE constraint)
        }),
      ),
    );
  }

  return savedSynthesis;
}
