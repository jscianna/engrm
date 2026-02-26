import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserVaultSalt, hasUserVaultSalt, setUserVaultSalt } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [hasVault, salt] = await Promise.all([hasUserVaultSalt(userId), getUserVaultSalt(userId)]);
  return NextResponse.json({ hasVault, salt: salt ?? null });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { salt?: string };
    const salt = body.salt?.trim();

    if (!salt) {
      return NextResponse.json({ error: "Salt is required" }, { status: 400 });
    }

    await setUserVaultSalt(userId, salt);
    return NextResponse.json({ ok: true, hasVault: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to store vault salt";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
