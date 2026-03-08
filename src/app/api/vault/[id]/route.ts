import { NextResponse } from "next/server";
import {
  deleteVaultEntryById,
  getVaultEntryById,
  updateVaultEntry,
  type VaultEntryCategory,
} from "@/lib/db";
import { requireVaultSessionAuth } from "@/lib/vault-auth";
import { extractRequestInfo, logAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

const ALLOWED_CATEGORIES = new Set<VaultEntryCategory>([
  "api_key",
  "password",
  "token",
  "connection_string",
  "private_key",
]);

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireVaultSessionAuth(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { id } = await context.params;
  const entry = await getVaultEntryById(authResult.userId, id);
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const requestInfo = extractRequestInfo(request);
  logAuditEvent({
    userId: authResult.userId,
    action: "vault.read",
    resourceType: "vault_entry",
    resourceId: id,
    ...requestInfo,
  }).catch(() => {});

  return NextResponse.json({ entry });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireVaultSessionAuth(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const updates: {
    name?: string;
    category?: string;
    value?: string;
    metadata?: Record<string, unknown> | null;
  } = {};

  if (typeof body?.name === "string") {
    updates.name = body.name.trim();
  }
  if (typeof body?.category === "string") {
    const normalizedCategory = body.category.trim();
    if (!ALLOWED_CATEGORIES.has(normalizedCategory as VaultEntryCategory)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    updates.category = normalizedCategory;
  }
  if (typeof body?.value === "string") {
    updates.value = body.value;
  }
  if (body && Object.prototype.hasOwnProperty.call(body, "metadata")) {
    if (body.metadata === null) {
      updates.metadata = null;
    } else if (body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)) {
      updates.metadata = body.metadata as Record<string, unknown>;
    } else {
      return NextResponse.json({ error: "metadata must be an object or null" }, { status: 400 });
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid update fields provided" }, { status: 400 });
  }

  const { id } = await context.params;
  const entry = await updateVaultEntry(authResult.userId, id, updates);
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const requestInfo = extractRequestInfo(request);
  logAuditEvent({
    userId: authResult.userId,
    action: "vault.update",
    resourceType: "vault_entry",
    resourceId: id,
    metadata: {
      fields: Object.keys(updates),
    },
    ...requestInfo,
  }).catch(() => {});

  return NextResponse.json({ entry });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireVaultSessionAuth(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { id } = await context.params;
  const deleted = await deleteVaultEntryById(authResult.userId, id);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const requestInfo = extractRequestInfo(request);
  logAuditEvent({
    userId: authResult.userId,
    action: "vault.delete",
    resourceType: "vault_entry",
    resourceId: id,
    ...requestInfo,
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
