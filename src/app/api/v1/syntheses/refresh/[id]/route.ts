import { extractEntities, normalizeEntityKey } from "@/lib/entities";
import {
  getAgentMemoriesByIds,
  getSynthesizedMemoryById,
  upsertSynthesizedMemory,
} from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { clusterMemories, type ClusteredMemory, type MemoryCluster } from "@/lib/synthesis/clustering";
import { synthesizeCluster } from "@/lib/synthesis/synthesize";

export const runtime = "nodejs";

function buildAdHocCluster(
  userId: string,
  synthesisId: string,
  topic: string,
  sourceMemories: ClusteredMemory[],
): MemoryCluster {
  return {
    id: synthesisId,
    userId,
    topic,
    memories: sourceMemories,
    entityKeys: Array.from(
      new Set(sourceMemories.flatMap((memory) => memory.derivedEntities.map((entity) => normalizeEntityKey(entity)))),
    ),
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "syntheses.refresh");
    const { id } = await context.params;
    const existing = await getSynthesizedMemoryById(identity.userId, id);

    if (!existing) {
      throw new MemryError("SYNTHESIS_NOT_FOUND");
    }

    const clusters = await clusterMemories(identity.userId);
    const matchedCluster =
      clusters.find((cluster) => cluster.id === existing.clusterId) ??
      clusters.find((cluster) => {
        const liveIds = new Set(cluster.memories.map((memory) => memory.id));
        return existing.sourceMemoryIds.some((sourceId) => liveIds.has(sourceId));
      });

    let cluster: MemoryCluster;
    if (matchedCluster) {
      cluster = matchedCluster;
    } else {
      const sourceMemories = await getAgentMemoriesByIds({
        userId: identity.userId,
        ids: existing.sourceMemoryIds,
      });

      if (sourceMemories.length < 3) {
        throw new MemryError("VALIDATION_ERROR", {
          reason: "At least 3 live source memories are required to refresh a synthesis",
        });
      }

      cluster = buildAdHocCluster(
        identity.userId,
        existing.clusterId,
        existing.clusterTopic,
        sourceMemories.map((memory) => ({
          ...memory,
          derivedEntities: memory.entities.length > 0 ? memory.entities : extractEntities(`${memory.title}\n${memory.text}`),
        })),
      );
    }

    const next = await synthesizeCluster(cluster);
    const synthesis = await upsertSynthesizedMemory({
      id: existing.id,
      userId: identity.userId,
      synthesis: next.synthesis,
      title: next.title,
      sourceMemoryIds: cluster.memories.map((memory) => memory.id),
      sourceCount: cluster.memories.length,
      clusterId: cluster.id,
      clusterTopic: cluster.topic,
      compressionRatio: next.compressionRatio,
      confidence: next.confidence,
      synthesizedAt: new Date().toISOString(),
      lastValidatedAt: new Date().toISOString(),
      stale: false,
      importanceTier: existing.importanceTier,
      accessCount: existing.accessCount,
      createdAt: existing.createdAt,
    });

    return Response.json({ synthesis });
  } catch (error) {
    return errorResponse(error);
  }
}
