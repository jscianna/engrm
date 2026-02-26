import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getOrCreateUserEncryptionKey,
  hasUserEncryptionKey,
  setUserEncryptionKey,
} from "@/lib/db";
import { exportKeyForUser, importKeyFromExport } from "@/lib/user-crypto";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const statusOnly = searchParams.get("status") === "true";

  try {
    if (statusOnly) {
      const hasKey = await hasUserEncryptionKey(userId);
      return NextResponse.json({ hasKey });
    }

    const key = await getOrCreateUserEncryptionKey(userId);
    const exported = exportKeyForUser(key);

    return NextResponse.json({
      hasKey: true,
      key: exported,
      filename: `memry-recovery-key-${userId}.txt`,
      warning: "Store this recovery key securely. Losing it means encrypted Arweave memories cannot be decrypted.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to export recovery key";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { key?: string };
    const imported = body.key?.trim();
    if (!imported) {
      return NextResponse.json({ error: "Recovery key is required" }, { status: 400 });
    }

    const key = importKeyFromExport(imported);
    await setUserEncryptionKey(userId, key);

    return NextResponse.json({
      ok: true,
      hasKey: true,
      message: "Recovery key imported successfully.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import recovery key";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
