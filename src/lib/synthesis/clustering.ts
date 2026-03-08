import crypto from "node:crypto";
import { extractEntities, findSharedEntities, normalizeEntityKey } from "@/lib/entities";
import { embedText } from "@/lib/embeddings";
import { listAgentMemories } from "@/lib/db";
import { semanticSearchVectors } from "@/lib/qdrant";
import type { AgentMemoryRecord } from "@/lib/db";

const MIN_CLUSTER_SIZE = 3;
const MAX_CLUSTER_SIZE = 20;
const EMBEDDING_SIMILARITY_THRESHOLD = 0.75;

export type ClusteredMemory = AgentMemoryRecord & {
  derivedEntities: string[];
};

export type MemoryCluster = {
  id: string;
  userId: string;
  topic: string;
  memories: ClusteredMemory[];
  entityKeys: string[];
};

function buildTopic(memories: ClusteredMemory[]): string {
  const counts = new Map<string, { label: string; count: number }>();

  for (const memory of memories) {
    for (const entity of memory.derivedEntities) {
      const key = normalizeEntityKey(entity);
      const current = counts.get(key);
      counts.set(key, {
        label: current?.label ?? entity,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  const top = Array.from(counts.values()).sort((a, b) => b.count - a.count)[0];
  if (top) {
    return top.label;
  }

  return memories[0]?.title ?? "Memory Cluster";
}

function buildClusterId(memoryIds: string[]): string {
  const hash = crypto
    .createHash("sha1")
    .update(memoryIds.slice().sort().join(":"))
    .digest("hex");
  return `cluster_${hash.slice(0, 24)}`;
}

function getDerivedEntities(memory: AgentMemoryRecord): string[] {
  if (memory.entities.length > 0) {
    return memory.entities;
  }

  return extractEntities(`${memory.title}\n${memory.text}`);
}

function union(parent: number[], a: number, b: number) {
  const rootA = find(parent, a);
  const rootB = find(parent, b);
  if (rootA !== rootB) {
    parent[rootB] = rootA;
  }
}

function find(parent: number[], value: number): number {
  if (parent[value] !== value) {
    parent[value] = find(parent, parent[value]);
  }
  return parent[value];
}

export async function clusterMemories(userId: string): Promise<MemoryCluster[]> {
  const allMemories = await listAgentMemories({
    userId,
    limit: 500,
  });

  const memories: ClusteredMemory[] = allMemories
    .filter((memory) => !memory.sensitive)
    .map((memory) => ({
      ...memory,
      derivedEntities: getDerivedEntities(memory),
    }));

  if (memories.length < MIN_CLUSTER_SIZE) {
    return [];
  }

  const indexById = new Map(memories.map((memory, index) => [memory.id, index]));
  const parent = memories.map((_, index) => index);

  for (let left = 0; left < memories.length; left += 1) {
    for (let right = left + 1; right < memories.length; right += 1) {
      const shared = findSharedEntities(memories[left].derivedEntities, memories[right].derivedEntities);
      if (shared.length > 0) {
        union(parent, left, right);
      }
    }
  }

  await Promise.all(
    memories.map(async (memory) => {
      const vector = await embedText(memory.text.slice(0, 4000));
      const related = await semanticSearchVectors({
        userId,
        query: memory.text.slice(0, 500),
        vector,
        topK: 8,
      });

      for (const hit of related) {
        if (hit.item.id === memory.id || hit.score < EMBEDDING_SIMILARITY_THRESHOLD) {
          continue;
        }

        const otherIndex = indexById.get(hit.item.id);
        if (typeof otherIndex === "number") {
          union(parent, indexById.get(memory.id)!, otherIndex);
        }
      }
    }),
  );

  const groups = new Map<number, ClusteredMemory[]>();
  memories.forEach((memory, index) => {
    const root = find(parent, index);
    const current = groups.get(root) ?? [];
    current.push(memory);
    groups.set(root, current);
  });

  const clusters = Array.from(groups.values())
    .filter((group) => group.length >= MIN_CLUSTER_SIZE)
    .map((group) => {
      const sorted = group
        .slice()
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(0, MAX_CLUSTER_SIZE);
      const topic = buildTopic(sorted);
      const entityKeys = Array.from(
        new Set(sorted.flatMap((memory) => memory.derivedEntities.map((entity) => normalizeEntityKey(entity)))),
      );

      return {
        id: buildClusterId(sorted.map((memory) => memory.id)),
        userId,
        topic,
        memories: sorted,
        entityKeys,
      };
    })
    .sort((a, b) => b.memories.length - a.memories.length);

  return clusters;
}
