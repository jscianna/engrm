/**
 * Zero-Knowledge Memory Storage with Reinforcement
 * 
 * Accepts pre-computed vectors and encrypted content.
 * Server never sees plaintext - only encrypted blobs and vectors.
 * 
 * If a similar memory exists (cosine similarity > 0.85), the existing
 * memory is reinforced instead of creating a duplicate.
 */

import { upsertMemoryVector, semanticSearchVectorsDirect } from "@/lib/vector";
import { insertMemoryWithMetadata, reinforceMemory, getMemoriesWithEmbeddings } from "@/lib/db";
import { calculateFrequencyBoost, TYPE_HALFLIVES, type MemoryType } from "@/lib/memory-heuristics";
import { ApiAuthError, validateApiKey } from "@/lib/api-auth";
import { isObject, jsonError, resolveNamespaceIdOrError } from "@/lib/api-v1";

export const runtime = "nodejs";

const SIMILARITY_THRESHOLD = 0.85;

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

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request);
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      return jsonError("Invalid request body", "VALIDATION_ERROR", 400);
    }

    // Validate required fields
    if (typeof body.encryptedContent !== "string" || !body.encryptedContent) {
      return jsonError("'encryptedContent' is required", "VALIDATION_ERROR", 400);
    }

    if (!Array.isArray(body.vector) || body.vector.length === 0) {
      return jsonError("'vector' must be a non-empty array of numbers", "VALIDATION_ERROR", 400);
    }

    // Validate vector contains only numbers
    if (!body.vector.every((v: unknown) => typeof v === "number" && !isNaN(v))) {
      return jsonError("'vector' must contain only valid numbers", "VALIDATION_ERROR", 400);
    }

    const namespace = typeof body.namespace === "string" ? body.namespace : undefined;
    const resolved = await resolveNamespaceIdOrError(identity.userId, namespace);
    if (resolved.error) {
      return resolved.error;
    }

    const encryptedTitle = typeof body.encryptedTitle === "string" 
      ? body.encryptedTitle 
      : body.encryptedContent.slice(0, 200);

    const inputMetadata = isObject(body.metadata) ? body.metadata : {};
    const importance = typeof inputMetadata.importance === "number" ? inputMetadata.importance : 5;
    const memoryType = (typeof inputMetadata.memory_type === "string" 
      ? inputMetadata.memory_type 
      : "episodic") as MemoryType;
    const halflifeDays = typeof inputMetadata.halflife_days === "number"
      ? inputMetadata.halflife_days
      : TYPE_HALFLIVES[memoryType] || 60;
    const entities = Array.isArray(inputMetadata.entities) 
      ? inputMetadata.entities.filter((e: unknown) => typeof e === "string")
      : [];
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : undefined;
    
    // Check for similar existing memories (reinforcement check)
    const existingMemories = await getMemoriesWithEmbeddings(
      identity.userId,
      resolved.namespaceId,
      100 // Check last 100 memories
    );
    
    let bestMatch: { id: string; similarity: number; mentionCount: number; strength: number } | null = null;
    
    for (const existing of existingMemories) {
      if (existing.embedding.length === 0) continue;
      
      const similarity = cosineSimilarity(body.vector, existing.embedding);
      if (similarity >= SIMILARITY_THRESHOLD) {
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = {
            id: existing.id,
            similarity,
            mentionCount: existing.mentionCount,
            strength: existing.strength,
          };
        }
      }
    }
    
    // If similar memory exists, reinforce it instead of creating new
    if (bestMatch) {
      const newMentionCount = bestMatch.mentionCount + 1;
      const triggerIntensity = importance / 10;
      const emaStrength = (bestMatch.strength * 0.7) + (triggerIntensity * 0.3);
      const frequencyBoost = calculateFrequencyBoost(newMentionCount);
      const newStrength = Math.min(emaStrength * frequencyBoost, 2.5);
      
      await reinforceMemory(bestMatch.id, identity.userId, {
        newStrength,
        mentionCount: newMentionCount,
        entities,
        conversationId,
      });
      
      return Response.json({ 
        id: bestMatch.id,
        action: "reinforced",
        strength: newStrength,
        mentionCount: newMentionCount,
        similarityToExisting: bestMatch.similarity,
      }, { status: 200 });
    }
    
    // Create new memory
    const metadata = {
      ...inputMetadata,
      zk: true,
    };

    const memory = await insertMemoryWithMetadata({
      userId: identity.userId,
      title: encryptedTitle,
      text: body.encryptedContent,
      embedding: body.vector,
      memoryType,
      importance,
      halflifeDays,
      entities,
      conversationId,
      namespaceId: resolved.namespaceId,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
      metadata,
    });

    // Also store in vector index for fast similarity search
    await upsertMemoryVector({
      memoryId: memory.id,
      userId: memory.userId,
      title: encryptedTitle,
      sourceType: "text",
      memoryType,
      importance,
      vector: body.vector,
    });

    return Response.json({ 
      id: memory.id,
      action: "created",
      strength: 1.0,
      mentionCount: 1,
      createdAt: memory.createdAt,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return jsonError(error.message, error.code, error.status);
    }
    const message = error instanceof Error ? error.message : "Failed to store memory";
    return jsonError(message, "MEMORY_CREATE_FAILED", 400);
  }
}
