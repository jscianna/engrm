import crypto from "node:crypto";
import {
  absorbMemoriesByIds,
  createGraphEdge,
  getCriticalMemories,
  getSynthesizedMemoryByClusterId,
  type AgentMemoryRecord,
  upsertSynthesizedMemory,
} from "@/lib/db";
import { embedText } from "@/lib/embeddings";
import { callLLM } from "@/lib/llm";
import type { SynthesizedMemoryRecord } from "@/lib/types";

const CRITICAL_CLUSTER_THRESHOLD = 0.8;
const MIN_CLUSTER_SIZE = 2;
const MAX_CLUSTER_SIZE = 8;
const SYNTHESIS_MODEL = "gpt-4o-mini";

export type CriticalCluster = {
  id: string;
  theme: string;
  memories: AgentMemoryRecord[];
  themeEmbedding: number[];
};

type PrincipleResponse = {
  principle?: unknown;
  theme?: unknown;
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

function findRoot(parent: number[], index: number): number {
  if (parent[index] !== index) {
    parent[index] = findRoot(parent, parent[index]);
  }
  return parent[index];
}

function union(parent: number[], left: number, right: number): void {
  const leftRoot = findRoot(parent, left);
  const rightRoot = findRoot(parent, right);
  if (leftRoot !== rightRoot) {
    parent[rightRoot] = leftRoot;
  }
}

function buildClusterId(memoryIds: string[]): string {
  const digest = crypto
    .createHash("sha1")
    .update(memoryIds.slice().sort().join(":"))
    .digest("hex");
  return `critical_${digest.slice(0, 24)}`;
}

function deriveTheme(memories: AgentMemoryRecord[]): string {
  const counts = new Map<string, number>();
  for (const memory of memories) {
    for (const entity of memory.entities ?? []) {
      const normalized = entity.trim().toLowerCase();
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top) {
    return top;
  }
  return memories[0]?.title ?? "critical-principle";
}

function averageEmbedding(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];
  const dimension = embeddings[0].length;
  const totals = new Array<number>(dimension).fill(0);
  for (const embedding of embeddings) {
    for (let i = 0; i < dimension; i += 1) {
      totals[i] += embedding[i];
    }
  }
  return totals.map((value) => value / embeddings.length);
}

export async function clusterCriticalMemories(userId: string): Promise<CriticalCluster[]> {
  const critical = (await getCriticalMemories(userId, {
    excludeCompleted: true,
    excludeAbsorbed: true,
  })).filter((memory) => !memory.sensitive);

  if (critical.length < MIN_CLUSTER_SIZE) {
    return [];
  }

  const embeddings = await Promise.all(
    critical.map((memory) => embedText(memory.text.slice(0, 4000))),
  );
  const parent = critical.map((_, idx) => idx);

  for (let left = 0; left < critical.length; left += 1) {
    for (let right = left + 1; right < critical.length; right += 1) {
      const similarity = cosineSimilarity(embeddings[left], embeddings[right]);
      if (similarity >= CRITICAL_CLUSTER_THRESHOLD) {
        union(parent, left, right);
      }
    }
  }

  const grouped = new Map<number, Array<{ memory: AgentMemoryRecord; embedding: number[] }>>();
  for (let index = 0; index < critical.length; index += 1) {
    const root = findRoot(parent, index);
    const current = grouped.get(root) ?? [];
    current.push({ memory: critical[index], embedding: embeddings[index] });
    grouped.set(root, current);
  }

  return Array.from(grouped.values())
    .filter((group) => group.length >= MIN_CLUSTER_SIZE)
    .map((group) => {
      const sorted = group
        .slice()
        .sort((a, b) => new Date(a.memory.createdAt).getTime() - new Date(b.memory.createdAt).getTime())
        .slice(0, MAX_CLUSTER_SIZE);
      const memories = sorted.map((item) => item.memory);
      const clusterEmbeddings = sorted.map((item) => item.embedding);
      const theme = deriveTheme(memories);
      return {
        id: buildClusterId(memories.map((memory) => memory.id)),
        theme,
        memories,
        themeEmbedding: averageEmbedding(clusterEmbeddings),
      };
    })
    .sort((a, b) => b.memories.length - a.memories.length);
}

export async function synthesizeClusterToPrinciple(
  userId: string,
  cluster: CriticalCluster,
): Promise<SynthesizedMemoryRecord> {
  const sourceIds = cluster.memories.map((memory) => memory.id);
  const existing = await getSynthesizedMemoryByClusterId(userId, cluster.id);
  const existingIdsKey = existing?.sourceMemoryIds.slice().sort().join(":") ?? "";
  const sourceIdsKey = sourceIds.slice().sort().join(":");
  const needsRefresh = !existing || existing.stale || existingIdsKey !== sourceIdsKey;

  if (!needsRefresh && existing) {
    return existing;
  }

  const prompt = `
Synthesize these related critical memories into ONE compact principle (1-2 sentences max).

Focus on:
- The underlying rule, not specific instances
- Action-oriented guidance
- What to do or not do

Output JSON:
{
  "theme": "short theme label",
  "principle": "single imperative principle"
}

Memories:
${cluster.memories
  .map(
    (memory, index) =>
      `${index + 1}. TITLE: ${memory.title}\nTEXT: ${memory.text}`,
  )
  .join("\n\n")}
`.trim();

  const systemPrompt =
    "You distill critical memories into durable principles. Keep output compact, direct, and implementation-ready.";
  const raw = await callLLM(prompt, systemPrompt, { model: SYNTHESIS_MODEL });
  const parsed = JSON.parse(raw) as PrincipleResponse;
  const principle = typeof parsed.principle === "string" ? parsed.principle.trim() : "";
  if (!principle) {
    throw new Error("Critical synthesis response missing principle text");
  }

  const theme =
    typeof parsed.theme === "string" && parsed.theme.trim().length > 0
      ? parsed.theme.trim()
      : cluster.theme;

  return upsertSynthesizedMemory({
    id: existing?.id,
    userId,
    synthesis: principle,
    title: `Principle: ${theme.slice(0, 80)}`,
    sourceMemoryIds: sourceIds,
    sourceCount: sourceIds.length,
    clusterId: cluster.id,
    clusterTopic: theme,
    confidence: existing?.confidence ?? 0.75,
    compressionRatio: existing?.compressionRatio ?? null,
    synthesizedAt: new Date().toISOString(),
    lastValidatedAt: new Date().toISOString(),
    stale: false,
    importanceTier: "critical",
    accessCount: existing?.accessCount ?? 0,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  });
}

export async function absorbMemoriesIntoSynthesis(
  userId: string,
  synthesisId: string,
  memoryIds: string[],
): Promise<void> {
  if (memoryIds.length === 0) {
    return;
  }

  await absorbMemoriesByIds(userId, synthesisId, memoryIds);

  await Promise.all(
    memoryIds.map((memoryId) =>
      createGraphEdge({
        userId,
        sourceId: synthesisId,
        sourceType: "synthesis",
        targetId: memoryId,
        targetType: "memory",
        edgeType: "derives_from",
        weight: 1.0,
      }).catch(() => {
        // Ignore duplicate graph edge conflicts.
      }),
    ),
  );
}
