/**
 * Zero-Knowledge Memory Storage
 * 
 * Accepts pre-computed vectors and encrypted content.
 * Server never sees plaintext - only encrypted blobs and vectors.
 */

import { upsertMemoryVector } from "@/lib/vector";
import { insertAgentMemory } from "@/lib/db";
import { ApiAuthError, validateApiKey } from "@/lib/api-auth";
import { isObject, jsonError, resolveNamespaceIdOrError } from "@/lib/api-v1";

export const runtime = "nodejs";

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
      : body.encryptedContent.slice(0, 200); // Use content prefix if no title

    const inputMetadata = isObject(body.metadata) ? body.metadata : {};
    const importance = typeof inputMetadata.importance === "number" ? inputMetadata.importance : 5;
    
    const metadata = {
      ...inputMetadata,
      zk: true, // Mark as zero-knowledge encrypted
    };

    // Store the encrypted memory (we can't read it)
    const memory = await insertAgentMemory({
      userId: identity.userId,
      title: encryptedTitle,
      text: body.encryptedContent,
      metadata,
      namespaceId: resolved.namespaceId,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
    });

    // Store the pre-computed vector (we don't know what it represents)
    await upsertMemoryVector({
      memoryId: memory.id,
      userId: memory.userId,
      title: encryptedTitle,
      sourceType: "text",
      memoryType: "episodic",
      importance,
      vector: body.vector,
    });

    return Response.json({ 
      id: memory.id,
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
