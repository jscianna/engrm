import { createNamespace, listNamespaces } from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "namespaces.list");
    const namespaces = await listNamespaces(identity.userId);
    return Response.json({ namespaces });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "namespaces.create");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body) || typeof body.name !== "string" || !body.name.trim()) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "name", reason: "required" });
    }

    const namespace = await createNamespace(identity.userId, body.name);
    return Response.json({ namespace }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
