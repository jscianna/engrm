import { createSession, listSessions } from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { getRequestedNamespace, isObject, resolveNamespaceIdOrError } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "sessions.list");
    const url = new URL(request.url);
    const requestedNamespace = getRequestedNamespace(
      request,
      url.searchParams.get("namespace"),
    );

    const resolved = await resolveNamespaceIdOrError(
      identity.userId,
      requestedNamespace.name,
    );
    if (resolved.error) {
      return resolved.error;
    }

    const sessions = await listSessions({
      userId: identity.userId,
      namespaceId: resolved.namespaceId,
    });

    return Response.json({ sessions });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "sessions.create");
    const body = (await request.json().catch(() => ({}))) as unknown;
    
    if (!isObject(body)) {
      throw new FatHippoError("VALIDATION_ERROR", { reason: "Invalid JSON body" });
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

    const metadata = isObject(body.metadata) ? body.metadata : null;
    const session = await createSession({
      userId: identity.userId,
      namespaceId: resolved.namespaceId,
      metadata,
    });

    return Response.json({ session }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
