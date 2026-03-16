import { auth } from "@clerk/nextjs/server";
import { createApiKey } from "@/lib/db";
import { jsonError } from "@/lib/api-v1";
import { deviceCodes } from "../route";

export const runtime = "nodejs";

// POST /api/v1/auth/device/verify — User submits the code after logging in on the web
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return jsonError("Unauthorized — please log in first", "UNAUTHORIZED", 401);
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const user_code = typeof body.user_code === "string" ? body.user_code.trim().toUpperCase() : "";

  if (!user_code) {
    return jsonError("user_code required", "MISSING_PARAM", 400);
  }

  // Find the entry by user_code (normalize dashes for comparison)
  let found_entry: { key: string; entry: (typeof deviceCodes extends Map<string, infer V> ? V : never) } | null = null;
  for (const [key, entry] of deviceCodes) {
    if (entry.user_code.replace("-", "") === user_code.replace("-", "") && entry.status === "pending") {
      found_entry = { key, entry };
      break;
    }
  }

  if (!found_entry) {
    return jsonError("Invalid or expired code", "INVALID_CODE", 404);
  }

  if (Date.now() > found_entry.entry.expires_at) {
    deviceCodes.delete(found_entry.key);
    return jsonError("Code expired", "EXPIRED", 410);
  }

  // Create API key for this user
  try {
    const result = await createApiKey(userId, "CLI (device auth)");

    // Update the entry to mark it authorized
    found_entry.entry.status = "authorized";
    found_entry.entry.user_id = userId;
    found_entry.entry.api_key = result.apiKey;
    found_entry.entry.agent_id = result.agentId;

    return Response.json({ status: "authorized", message: "Device authorized. You can close this page." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create API key";
    return jsonError(message, "KEY_CREATE_FAILED", 500);
  }
}
