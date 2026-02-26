import { createNamespace, listNamespaces } from "@/lib/db";
import { ApiAuthError, validateApiKey } from "@/lib/api-auth";
import { isObject, jsonError } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request);
    const namespaces = await listNamespaces(identity.userId);
    return Response.json({ namespaces });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return jsonError(error.message, error.code, error.status);
    }
    const message = error instanceof Error ? error.message : "Failed to list namespaces";
    return jsonError(message, "NAMESPACE_LIST_FAILED", 400);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request);
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body) || typeof body.name !== "string" || !body.name.trim()) {
      return jsonError("'name' is required", "VALIDATION_ERROR", 400);
    }

    const namespace = await createNamespace(identity.userId, body.name);
    return Response.json({ namespace }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return jsonError(error.message, error.code, error.status);
    }
    const message = error instanceof Error ? error.message : "Failed to create namespace";
    return jsonError(message, "NAMESPACE_CREATE_FAILED", 400);
  }
}
