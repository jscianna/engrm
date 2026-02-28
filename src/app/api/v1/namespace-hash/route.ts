/**
 * Server-Side Namespace Hashing API
 * 
 * Clients call this to get the hashed namespace using server-side salt.
 * This ensures consistent hashing even if client doesn't have the salt.
 * 
 * POST /api/v1/namespace-hash
 * Body: { namespace: string, vaultPassword: string }
 * Returns: { hash: string }
 */

import { validateApiKey } from "@/lib/api-auth";
import { hashNamespaceWithServerSalt } from "@/lib/user-salt";
import { logAuditEvent, extractRequestInfo } from "@/lib/audit-log";
import { errorResponse, MemryError } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "namespace.hash");
    const body = await request.json().catch(() => null);

    if (!body || typeof body.namespace !== "string" || !body.namespace.trim()) {
      throw new MemryError("VALIDATION_ERROR", { field: "namespace", reason: "required" });
    }

    if (typeof body.vaultPassword !== "string" || !body.vaultPassword) {
      throw new MemryError("VALIDATION_ERROR", { field: "vaultPassword", reason: "required" });
    }

    const hash = await hashNamespaceWithServerSalt(
      identity.userId,
      body.namespace.trim(),
      body.vaultPassword
    );

    // Audit log (don't log the actual namespace or password)
    const { ipAddress, userAgent } = extractRequestInfo(request);
    await logAuditEvent({
      userId: identity.userId,
      action: "vault.access",
      resourceType: "namespace",
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
      metadata: { action: "hash" },
    });

    return Response.json({ hash });
  } catch (error) {
    return errorResponse(error);
  }
}
