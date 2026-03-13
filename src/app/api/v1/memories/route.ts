import { embedText } from "@/lib/embeddings";
import { extractEntities } from "@/lib/entities";
import { classifyMemoryType } from "@/lib/memory-classification";
import { semanticSearchVectors, upsertMemoryVector } from "@/lib/qdrant";
import { 
  createMemoryEdge,
  findMemoriesWithSharedEntities,
  getAgentMemoriesByIds,
  getSessionById, 
  insertAgentMemory, 
  listAgentMemories 
} from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { invalidateAllLocalResultsForUser } from "@/lib/local-retrieval";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { isObject, normalizeIsoTimestamp, normalizeLimit, resolveNamespaceIdOrError } from "@/lib/api-v1";
import type { MemoryKind } from "@/lib/types";

// Similarity threshold for consolidation suggestion
const CONSOLIDATION_THRESHOLD = 0.85;

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "memories.list");
    const url = new URL(request.url);
    const namespace = url.searchParams.get("namespace") ?? undefined;
    const limit = normalizeLimit(url.searchParams.get("limit"), 50, 200);
    const since = normalizeIsoTimestamp(url.searchParams.get("since"), "since");

    const resolved = await resolveNamespaceIdOrError(identity.userId, namespace);
    if (resolved.error) {
      return resolved.error;
    }

    const memories = await listAgentMemories({
      userId: identity.userId,
      namespaceId: resolved.namespaceId,
      limit,
      since,
      excludeSensitive: true,
    });

    return Response.json({ memories });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "memories.create");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "body", reason: "Invalid request body" });
    }

    // Check for encrypted vs plaintext format
    const hasEncrypted = typeof body.ciphertext === "string" && typeof body.iv === "string";
    const plaintextContent = typeof body.content === "string" ? body.content.trim() : 
                            typeof body.text === "string" ? body.text.trim() : null;
    const hasPlaintext = plaintextContent && plaintextContent.length > 0;

    if (!hasEncrypted && !hasPlaintext) {
      throw new FatHippoError("VALIDATION_ERROR", { 
        field: "content", 
        reason: "Provide either content (plaintext) or encrypted content with an iv" 
      });
    }

    const namespace = typeof body.namespace === "string" ? body.namespace : undefined;
    const resolved = await resolveNamespaceIdOrError(identity.userId, namespace);
    if (resolved.error) {
      return resolved.error;
    }

    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    if (sessionId) {
      const session = await getSessionById(identity.userId, sessionId);
      if (!session) {
        throw new FatHippoError("SESSION_NOT_FOUND");
      }
      if (resolved.namespaceId && session.namespaceId !== resolved.namespaceId) {
        throw new FatHippoError("VALIDATION_ERROR", {
          field: "sessionId",
          reason: "Session namespace does not match request namespace",
        });
      }
    }

    const metadata = isObject(body.metadata) ? body.metadata : null;

    if (hasEncrypted) {
      // Pre-encrypted path: store encrypted content as provided and skip embedding.
      const encryptedText = JSON.stringify({ ciphertext: body.ciphertext, iv: body.iv });
      const titleForStorage = typeof body.title === "string" ? body.title : "Encrypted memory";

      const memory = await insertAgentMemory({
        userId: identity.userId,
        title: titleForStorage,
        text: encryptedText,
        entities: [],
        metadata,
        namespaceId: resolved.namespaceId,
        sessionId,
        isEncrypted: true,
      });

      // Invalidate hot-cache because retrieval ranking may change with new memory.
      invalidateAllLocalResultsForUser(identity.userId);

      return Response.json({ memory }, { status: 201 });
    }

    // Plaintext path: extract entities, classify type, embed, store
    const contentText = plaintextContent as string;
    const titleForStorage = typeof body.title === "string" ? body.title : contentText.slice(0, 60);
    
    // Extract entities from content
    let entities: string[] = [];
    try {
      entities = extractEntities(contentText);
    } catch {
      // Entity extraction is best-effort, don't fail the request
    }

    // Classify memory type based on title and content
    // Allow explicit override via body.memoryType
    let memoryType: MemoryKind;
    if (typeof body.memoryType === "string" && body.memoryType) {
      memoryType = body.memoryType as MemoryKind;
    } else {
      memoryType = classifyMemoryType(titleForStorage, contentText);
    }

    // Allow explicit importance tier override (critical/high/normal)
    const importanceTier = typeof body.importanceTier === "string" && 
      ["critical", "high", "normal"].includes(body.importanceTier) 
      ? body.importanceTier as "critical" | "high" | "normal"
      : "normal";

    // Check for force=true query param to bypass consolidation
    const url = new URL(request.url);
    const forceCreate = url.searchParams.get("force") === "true";

    // Generate embedding for consolidation check and storage
    let embedding: number[] | null = null;
    try {
      embedding = await embedText(contentText);
    } catch {
      // Embedding failed, skip consolidation check
    }

    // Check for similar existing memories (consolidation suggestion)
    if (embedding && !forceCreate) {
      try {
        const hits = await semanticSearchVectors({
          userId: identity.userId,
          query: contentText,
          vector: embedding,
          topK: 5,
        });

        // Filter hits above consolidation threshold
        const similarHits = hits.filter((h) => h.score >= CONSOLIDATION_THRESHOLD);

        if (similarHits.length > 0) {
          // Get full memory records for similar memories
          const similarMemories = await getAgentMemoriesByIds({
            userId: identity.userId,
            ids: similarHits.map((h) => h.item.id),
            excludeSensitive: true,
          });

          // Return consolidation suggestion instead of creating
          return Response.json({
            status: "consolidation_suggested",
            newMemory: {
              title: titleForStorage,
              text: contentText,
              memoryType,
              importanceTier,
              entities,
            },
            similarMemories: similarMemories.map((m, idx) => ({
              id: m.id,
              title: m.title,
              text: m.text.slice(0, 500) + (m.text.length > 500 ? "..." : ""),
              similarity: Math.round(similarHits[idx]?.score * 100) / 100,
              memoryType: m.memoryType,
              createdAt: m.createdAt,
            })),
            suggestion: similarMemories.length === 1 
              ? "Consider merging with the existing memory"
              : `Found ${similarMemories.length} similar memories. Consider consolidating.`,
            hint: "Add ?force=true to create anyway",
          }, { status: 200 });
        }
      } catch {
        // Consolidation check is best-effort, continue with creation
      }
    }

    const memory = await insertAgentMemory({
      userId: identity.userId,
      title: titleForStorage,
      text: contentText,
      memoryType,
      importanceTier,
      entities,
      metadata,
      namespaceId: resolved.namespaceId,
      sessionId,
      isEncrypted: false,
    });

    // Store embedding in Qdrant for semantic search
    if (embedding) {
      try {
        await upsertMemoryVector({
          memoryId: memory.id,
          userId: identity.userId,
          title: titleForStorage,
          sourceType: memory.sourceType,
          memoryType: memory.memoryType,
          importance: 5, // Default importance
          vector: embedding,
        });
      } catch {
        // Vector storage is best-effort
      }
    }

    // Auto-link memories that share entities (same_entity relationship)
    if (entities.length > 0) {
      try {
        const sharedMemories = await findMemoriesWithSharedEntities(
          identity.userId,
          entities,
          memory.id,
          10 // Link to up to 10 related memories
        );

        for (const related of sharedMemories) {
          await createMemoryEdge({
            userId: identity.userId,
            sourceId: memory.id,
            targetId: related.id,
            relationshipType: "same_entity",
            weight: Math.min(entities.filter(e => 
              related.entities.some(re => 
                re.toLowerCase() === e.toLowerCase()
              )
            ).length * 0.5, 3), // Weight based on # of shared entities, max 3
          });
        }
      } catch {
        // Entity linking is best-effort, don't fail the request
      }
    }

    // Invalidate hot-cache because retrieval ranking may change with new memory.
    invalidateAllLocalResultsForUser(identity.userId);

    return Response.json({ memory }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
