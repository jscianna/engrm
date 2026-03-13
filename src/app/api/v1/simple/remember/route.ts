/**
 * Simple Remember Endpoint
 * 
 * Opinionated memory storage with auto-classification.
 * Just send text, we handle the rest.
 */

import { embedText } from "@/lib/embeddings";
import { extractEntities } from "@/lib/entities";
import { classifyMemoryType } from "@/lib/memory-classification";
import { classifyMemory, type MemoryType } from "@/lib/memory-classifier";
import { semanticSearchVectors, upsertMemoryVector } from "@/lib/qdrant";
import { 
  insertAgentMemory, 
  getAgentMemoriesByIds,
  updateAgentMemory,
} from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";
import { detectSecretCategories, VAULT_HINT_MESSAGE } from "@/lib/secrets";
import { invalidateAllLocalResultsForUser, invalidateLocalResultsByMemoryIds } from "@/lib/local-retrieval";
import type { MemoryImportanceTier, MemoryKind } from "@/lib/types";

export const runtime = "nodejs";

// Consolidation threshold for auto-merge
const CONSOLIDATION_THRESHOLD = 0.90;

// Patterns that indicate higher importance
const HIGH_IMPORTANCE_PATTERNS = [
  /\b(?:always|never|must|required|important|critical|prefers?|preferred)\b/i,
  /\b(?:my name is|I am|I'm called)\b/i,
  /\b(?:remember|don't forget)\b/i,
];

const CRITICAL_PATTERNS = [
  /\b(?:must always|never ever|absolutely|core principle|fundamental)\b/i,
];

function classifyImportance(text: string): MemoryImportanceTier {
  for (const pattern of CRITICAL_PATTERNS) {
    if (pattern.test(text)) {
      return "critical";
    }
  }
  for (const pattern of HIGH_IMPORTANCE_PATTERNS) {
    if (pattern.test(text)) {
      return "high";
    }
  }
  return "normal";
}

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "simple.remember");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "body", reason: "Invalid request body" });
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "text", reason: "required" });
    }

    const matchedSecretCategories = detectSecretCategories(text);
    if (matchedSecretCategories.length > 0) {
      return Response.json(
        {
          stored: false,
          warning:
            "This looks like a sensitive credential. Store it in your secure vault instead of memories.",
          vault_hint: VAULT_HINT_MESSAGE,
          matched_categories: matchedSecretCategories,
        },
        { status: 200 },
      );
    }

    // Auto-classify memory type (fast pattern-based)
    const memoryType: MemoryKind = classifyMemoryType(text.slice(0, 60), text);
    
    // Auto-classify importance
    const importanceTier = classifyImportance(text);

    // Extract entities
    let entities: string[] = [];
    try {
      entities = extractEntities(text);
    } catch {
      // Best effort
    }

    // LLM-based classification for richer understanding (async, best effort)
    let classificationResult: Awaited<ReturnType<typeof classifyMemory>> | null = null;
    let structuredMetadata: Record<string, unknown> | null = null;
    let textForEmbedding = text; // May be replaced with canonical structured text
    
    try {
      classificationResult = await classifyMemory(text);
      
      if (classificationResult.structured) {
        // Store structured data in metadata
        structuredMetadata = {
          classified: {
            type: classificationResult.type,
            confidence: classificationResult.confidence,
            fields: classificationResult.structured.fields,
            canonical: classificationResult.structured.canonical,
          },
        };
        
        // Use canonical text for embedding (optimized for search)
        textForEmbedding = classificationResult.structured.canonical;
        
        // Merge extracted entities with classifier entities
        entities = [...new Set([...entities, ...classificationResult.entities])];
      } else if (classificationResult.type !== 'general') {
        // Store basic classification even without structure
        structuredMetadata = {
          classified: {
            type: classificationResult.type,
            confidence: classificationResult.confidence,
            entities: classificationResult.entities,
          },
        };
      }
    } catch (error) {
      // Classification is best-effort, don't fail the request
      console.error("Memory classification failed:", error);
    }

    // Generate embedding (using canonical text if available)
    let embedding: number[] | null = null;
    try {
      embedding = await embedText(textForEmbedding);
    } catch {
      // Embedding failed, continue without consolidation
    }

    // Check for similar memories (auto-consolidate)
    if (embedding) {
      try {
        const hits = await semanticSearchVectors({
          userId: identity.userId,
          query: text,
          vector: embedding,
          topK: 3,
        });

        const similarHit = hits.find((h) => h.score >= CONSOLIDATION_THRESHOLD);
        
        if (similarHit) {
          // Found very similar memory - update it instead of creating new
          const [existing] = await getAgentMemoriesByIds({
            userId: identity.userId,
            ids: [similarHit.item.id],
          });

          if (existing) {
            // Merge: append new content if it adds information
            const newText = existing.text.includes(text) 
              ? existing.text 
              : `${existing.text}\n\n${text}`;

            await updateAgentMemory(identity.userId, existing.id, { text: newText });

            // Invalidate cache entries referencing this updated memory.
            invalidateLocalResultsByMemoryIds(identity.userId, [existing.id]);

            // Update vector
            const newEmbedding = await embedText(newText);
            await upsertMemoryVector({
              memoryId: existing.id,
              userId: identity.userId,
              title: existing.title,
              sourceType: existing.sourceType,
              memoryType: existing.memoryType,
              importance: 5,
              vector: newEmbedding,
            });

            return Response.json({
              id: existing.id,
              stored: true,
              consolidated: true,
              mergedWith: existing.id,
            }, { status: 200 });
          }
        }
      } catch {
        // Consolidation check failed, create new memory
      }
    }

    // Create new memory
    const memory = await insertAgentMemory({
      userId: identity.userId,
      title: text.slice(0, 60),
      text,
      memoryType,
      importanceTier,
      entities,
      metadata: structuredMetadata || undefined,
    });

    // Store embedding
    if (embedding) {
      try {
        await upsertMemoryVector({
          memoryId: memory.id,
          userId: identity.userId,
          title: memory.title,
          sourceType: memory.sourceType,
          memoryType: memory.memoryType,
          importance: 5,
          vector: embedding,
        });
      } catch {
        // Best effort
      }
    }

    // New memory can change top-K retrieval relevance; invalidate user hot-cache.
    invalidateAllLocalResultsForUser(identity.userId);

    return Response.json({
      id: memory.id,
      stored: true,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
