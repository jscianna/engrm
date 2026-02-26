import { getMemoriesByIds, listMemoryRecordsByUser } from "@/lib/db";
import { embedText } from "@/lib/embeddings";
import { semanticSearchVectors } from "@/lib/vector";

export type DreamBondSuggestion = {
  leftId: string;
  rightId: string;
  leftTitle: string;
  rightTitle: string;
  score: number;
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
};

function dayDiff(createdAt: string): number {
  const millis = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, millis / (1000 * 60 * 60 * 24));
}

export async function runDreamCycle(userId: string): Promise<DreamCycleResult> {
  const memories = listMemoryRecordsByUser(userId, 120);
  const memoryById = new Map(memories.map((memory) => [memory.id, { id: memory.id, userId: memory.userId, title: memory.title }]));
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
    const fetched = getMemoriesByIds(userId, Array.from(missingIds));
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
      });
    }
  }

  const bonds = Array.from(bondsMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

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

  return {
    generatedAt: new Date().toISOString(),
    bonds,
    promotions,
    decay,
  };
}
