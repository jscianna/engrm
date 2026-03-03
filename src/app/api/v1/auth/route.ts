import { auth } from "@clerk/nextjs/server";
import { createApiKey, getUserVaultSalt } from "@/lib/db";
import { isObject, jsonError } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return jsonError("Unauthorized", "UNAUTHORIZED", 401);
  }

  try {
    // Require vault setup before creating API keys
    const vaultSalt = await getUserVaultSalt(userId);
    if (!vaultSalt) {
      return jsonError(
        "Please set up your encryption vault in Settings before creating API keys",
        "VAULT_REQUIRED",
        400
      );
    }

    const body = (await request.json().catch(() => ({}))) as unknown;
    const agentName = isObject(body) && typeof body.agentName === "string" ? body.agentName.trim() : undefined;
    const result = await createApiKey(userId, agentName);
    return Response.json({ key: result.apiKey, agentId: result.agentId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create API key";
    return jsonError(message, "API_KEY_CREATE_FAILED", 400);
  }
}
