/**
 * Simple Remember Endpoint
 *
 * Opinionated memory storage with auto-classification.
 * Just send text, we handle the rest.
 */

import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { getRequestedNamespace, isObject, resolveNamespaceIdOrError } from "@/lib/api-v1";
import { storeAutoMemory, VAULT_HINT_MESSAGE } from "@/lib/turn-capture";

export const runtime = "nodejs";

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

    const requestedNamespace = getRequestedNamespace(
      request,
      typeof body.namespace === "string" ? body.namespace : undefined,
    );
    const resolved = await resolveNamespaceIdOrError(
      identity.userId,
      requestedNamespace.name,
      {
        createIfMissing: requestedNamespace.autoCreateIfMissing,
      },
    );
    if (resolved.error) {
      return resolved.error;
    }

    const result = await storeAutoMemory({
      userId: identity.userId,
      namespaceId: resolved.namespaceId,
      text,
    });

    if (result.action === "skipped" && result.matchedSecretCategories?.length) {
      return Response.json(
        {
          stored: false,
          warning: result.warning,
          vault_hint: VAULT_HINT_MESSAGE,
          matched_categories: result.matchedSecretCategories,
        },
        { status: 200 },
      );
    }

    return Response.json(
      {
        id: result.id,
        stored: result.action !== "skipped",
        consolidated: result.action === "updated" || result.action === "merged" || undefined,
        mergedWith: result.mergedWith,
        updated: result.action === "updated" || undefined,
      },
      { status: result.action === "stored" ? 201 : 200 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
