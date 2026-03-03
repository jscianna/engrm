import { embedText } from "@/lib/embeddings";
import { extractEntities } from "@/lib/entities";
import { upsertMemoryVector } from "@/lib/qdrant";
import { getSessionById, insertAgentMemory, listAgentMemories } from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { isObject, normalizeIsoTimestamp, normalizeLimit, resolveNamespaceIdOrError } from "@/lib/api-v1";

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
      throw new MemryError("VALIDATION_ERROR", { field: "body", reason: "Invalid request body" });
    }

    // Check for encrypted format (required)
    const hasEncrypted = typeof body.ciphertext === "string" && typeof body.iv === "string";
    const hasPlaintext = typeof body.text === "string" && body.text.trim();

    if (!hasEncrypted && !hasPlaintext) {
      throw new MemryError("VALIDATION_ERROR", { 
        field: "ciphertext", 
        reason: "Encrypted content required. Provide ciphertext and iv fields." 
      });
    }

    // Reject plaintext - encryption is required
    if (hasPlaintext && !hasEncrypted) {
      throw new MemryError("ENCRYPTION_REQUIRED", {
        reason: "All memories must be encrypted. Use client-side encryption and provide ciphertext + iv fields. See docs: https://engrm.xyz/docs#encryption"
      });
    }

    // Use encrypted content
    const encryptedText = JSON.stringify({ ciphertext: body.ciphertext, iv: body.iv });
    const titleForStorage = typeof body.title === "string" ? body.title : "Encrypted memory";
    const namespace = typeof body.namespace === "string" ? body.namespace : undefined;
    const resolved = await resolveNamespaceIdOrError(identity.userId, namespace);
    if (resolved.error) {
      return resolved.error;
    }

    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    if (sessionId) {
      const session = await getSessionById(identity.userId, sessionId);
      if (!session) {
        throw new MemryError("SESSION_NOT_FOUND");
      }
      if (resolved.namespaceId && session.namespaceId !== resolved.namespaceId) {
        throw new MemryError("VALIDATION_ERROR", {
          field: "sessionId",
          reason: "Session namespace does not match request namespace",
        });
      }
    }

    const metadata = isObject(body.metadata) ? body.metadata : null;
    // For encrypted content, we can't extract entities or embed - store as-is
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

    // Skip embedding for encrypted content (can't embed ciphertext meaningfully)
    // Encrypted memories won't appear in semantic search - use /v1/memories/zk for that

    return Response.json({ memory }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
