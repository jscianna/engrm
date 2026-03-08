import { NextResponse } from "next/server";
import {
  createVaultEntry,
  listVaultEntriesByUser,
  type VaultEntryCategory,
} from "@/lib/db";
import { requireVaultSessionAuth } from "@/lib/vault-auth";

export const runtime = "nodejs";

const ALLOWED_CATEGORIES = new Set<VaultEntryCategory>([
  "api_key",
  "password",
  "token",
  "connection_string",
  "private_key",
]);

export async function GET(request: Request) {
  const authResult = await requireVaultSessionAuth(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const url = new URL(request.url);
  const category = url.searchParams.get("category")?.trim() ?? "";
  const normalizedCategory = category.length > 0 ? category : undefined;

  if (normalizedCategory && !ALLOWED_CATEGORIES.has(normalizedCategory as VaultEntryCategory)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const entries = await listVaultEntriesByUser(authResult.userId, normalizedCategory);
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const authResult = await requireVaultSessionAuth(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const category = typeof body?.category === "string" ? body.category.trim() : "";
  const value = typeof body?.value === "string" ? body.value.trim() : "";
  const metadata =
    body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : undefined;

  if (!name || !category || !value) {
    return NextResponse.json(
      { error: "name, category, and value are required" },
      { status: 400 },
    );
  }

  if (!ALLOWED_CATEGORIES.has(category as VaultEntryCategory)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const entry = await createVaultEntry({
    userId: authResult.userId,
    name,
    category,
    value,
    metadata,
  });

  return NextResponse.json({ entry }, { status: 201 });
}
