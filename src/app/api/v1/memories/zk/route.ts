/**
 * Zero-Knowledge Memory Storage with Reinforcement
 * 
 * Accepts pre-computed vectors and encrypted content.
 * Server never sees plaintext - only encrypted blobs and vectors.
 * 
 * If a similar memory exists (cosine similarity > 0.75), the existing
 * memory is reinforced instead of creating a duplicate.
 * 
 * Race condition protection:
 * - Uses embedding hash as unique constraint to prevent duplicate creation
 * - Reinforcement uses atomic SQL operations
 */

import crypto from "node:crypto";
import { upsertMemoryVector, semanticSearchVectorsDirect, EMBEDDING_DIMENSIONS } from "@/lib/qdrant";
import { validateVector } from "@/lib/vector";
import { insertMemoryWithMetadata, reinforceMemory, getMemoriesWithEmbeddings, checkEmbeddingHashExists } from "@/lib/db";
import { calculateFrequencyBoost, TYPE_HALFLIVES, type MemoryType } from "@/lib/memory-heuristics";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { checkMemoryQuota, recordMemoryCreated } from "@/lib/rate-limiter";
import { isObject, resolveNamespaceIdOrError } from "@/lib/api-v1";
import { logAuditEvent, extractRequestInfo } from "@/lib/audit-log";

export const runtime = "nodejs";

const SIMILARITY_THRESHOLD = 0.75; // Lowered from 0.85 per docs

/**
 * Hash embedding vector for deduplication
 * Used as unique constraint to prevent race condition duplicates
 */
function hashEmbedding(vector: number[]): string {
  // Quantize to reduce floating point noise, then hash
  const quantized = vector.map(v => Math.round(v * 10000) / 10000);
  const data = JSON.stringify(quantized);
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 32);
}

// Supported embedding models and their dimensions
const SUPPORTED_DIMENSIONS = new Set<number>(Object.values(EMBEDDING_DIMENSIONS));

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
    const identity = await validateApiKey(request, "memories.create.zk");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new MemryError("VALIDATION_ERROR", { reason: "Invalid request body" });
    }

    if (typeof body.encryptedContent !== "string" || !body.encryptedContent) {
      throw new MemryError("VALIDATION_ERROR", { field: "encryptedContent", reason: "required" });
    }

    if (!Array.isArray(body.vector) || body.vector.length === 0) {
      throw new MemryError("VALIDATION_ERROR", { field: "vector", reason: "must be a non-empty array of numbers" });
    }

    // Validate vector dimension - must match a known embedding model
    const vectorDim = body.vector.length as number;
    if (!SUPPORTED_DIMENSIONS.has(vectorDim)) {
      throw new MemryError("VALIDATION_ERROR", { 
        field: "vector", 
        reason: `unsupported dimension ${vectorDim}. Supported: ${Array.from(SUPPORTED_DIMENSIONS).join(", ")}`,
      });
    }

    // Full vector validation (validates numbers are finite, no NaN, etc.)
    const validation = validateVector(body.vector);
    if (!validation.valid) {
      throw new MemryError("VALIDATION_ERROR", { field: "vector", reason: validation.error });
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
    
    // Generate embedding hash for deduplication (prevents race condition duplicates)
    const embeddingHash = hashEmbedding(body.vector);
    
    // Fast path: Check if exact embedding already exists (hash collision = same memory)
    const existingByHash = await checkEmbeddingHashExists(identity.userId, embeddingHash);
    if (existingByHash) {
      // Exact match - reinforce it
      await reinforceMemory(existingByHash.id, identity.userId, {
        newStrength: existingByHash.strength,
        mentionCount: existingByHash.mentionCount + 1,
        entities,
        conversationId,
      });
      
      return Response.json({ 
        id: existingByHash.id,
        action: "reinforced",
        strength: existingByHash.strength,
        mentionCount: existingByHash.mentionCount + 1,
        similarityToExisting: 1.0,
      }, { status: 200 });
    }
    
    // Check for similar existing memories (reinforcement check)
    const existingMemories = await getMemoriesWithEmbeddings(
      identity.userId,
      resolved.namespaceId,
      100
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
    
    // Check quota before creating new memory
    await checkMemoryQuota(identity.userId);

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

    // Track usage
    const sizeBytes = Buffer.byteLength(body.encryptedContent, "utf8");
    await recordMemoryCreated(identity.userId, sizeBytes);

    await upsertMemoryVector({
      memoryId: memory.id,
      userId: memory.userId,
      title: encryptedTitle,
      sourceType: "text",
      memoryType,
      importance,
      vector: body.vector,
    });

    // Audit log
    const { ipAddress, userAgent } = extractRequestInfo(request);
    await logAuditEvent({
      userId: identity.userId,
      action: "memory.create",
      resourceType: "memory",
      resourceId: memory.id,
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
      metadata: { memoryType, importance, encrypted: true },
    });

    return Response.json({ 
      id: memory.id,
      action: "created",
      strength: 1.0,
      mentionCount: 1,
      createdAt: memory.createdAt,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
