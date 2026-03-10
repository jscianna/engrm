import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { deleteApiKey, revokeApiKey, setApiKeyExpiration, setApiKeyScopes } from "@/lib/db";
import { extractRequestInfo, logAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const deleted = await deleteApiKey(userId, id);
    if (!deleted) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }
    const requestInfo = extractRequestInfo(_request);
    logAuditEvent({
      userId,
      action: "auth.api_key_delete",
      resourceType: "api_key",
      resourceId: id,
      ...requestInfo,
    }).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete API key";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH - Revoke or set expiration on an API key
 * Body: { action: "revoke" } or { action: "expire", expiresAt: "ISO-8601" } or { action: "clearExpiration" } or { action: "setScopes", scopes: string[] }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action;

    if (action === "revoke") {
      const revoked = await revokeApiKey(userId, id);
      if (!revoked) {
        return NextResponse.json({ error: "API key not found or already revoked" }, { status: 404 });
      }
      const requestInfo = extractRequestInfo(request);
      logAuditEvent({
        userId,
        action: "auth.api_key_revoke",
        resourceType: "api_key",
        resourceId: id,
        ...requestInfo,
      }).catch(() => {});
      return NextResponse.json({ success: true, message: "API key revoked" });
    }

    if (action === "expire") {
      const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
      if (!expiresAt || isNaN(expiresAt.getTime())) {
        return NextResponse.json({ error: "Invalid expiresAt date" }, { status: 400 });
      }
      const updated = await setApiKeyExpiration(userId, id, expiresAt);
      if (!updated) {
        return NextResponse.json({ error: "API key not found" }, { status: 404 });
      }
      const requestInfo = extractRequestInfo(request);
      logAuditEvent({
        userId,
        action: "auth.api_key_expire",
        resourceType: "api_key",
        resourceId: id,
        metadata: { expiresAt: expiresAt.toISOString() },
        ...requestInfo,
      }).catch(() => {});
      return NextResponse.json({ success: true, message: "Expiration set", expiresAt: expiresAt.toISOString() });
    }

    if (action === "clearExpiration") {
      const updated = await setApiKeyExpiration(userId, id, null);
      if (!updated) {
        return NextResponse.json({ error: "API key not found" }, { status: 404 });
      }
      const requestInfo = extractRequestInfo(request);
      logAuditEvent({
        userId,
        action: "auth.api_key_expiration_clear",
        resourceType: "api_key",
        resourceId: id,
        ...requestInfo,
      }).catch(() => {});
      return NextResponse.json({ success: true, message: "Expiration cleared" });
    }

    if (action === "setScopes") {
      const scopes = Array.isArray(body.scopes)
        ? body.scopes.filter((scope: unknown): scope is string => typeof scope === "string")
        : null;
      if (!scopes || scopes.length === 0) {
        return NextResponse.json({ error: "At least one scope is required" }, { status: 400 });
      }
      const updated = await setApiKeyScopes(userId, id, scopes);
      if (!updated) {
        return NextResponse.json({ error: "API key not found" }, { status: 404 });
      }
      const requestInfo = extractRequestInfo(request);
      logAuditEvent({
        userId,
        action: "settings.update",
        resourceType: "api_key",
        resourceId: id,
        metadata: { scopes },
        ...requestInfo,
      }).catch(() => {});
      return NextResponse.json({ success: true, message: "Scopes updated", scopes });
    }

    return NextResponse.json({ error: "Invalid action. Use: revoke, expire, clearExpiration, setScopes" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update API key";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
