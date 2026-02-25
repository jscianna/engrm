import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getArweaveWalletStatus } from "@/lib/arweave";
import { clearUserArweaveJwk, setUserArweaveJwk } from "@/lib/db";
import { parseArweaveJwk } from "@/lib/turbo";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const wallet = await getArweaveWalletStatus(userId);
    return NextResponse.json({ wallet });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load wallet status";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { jwk?: string };
    const jwkRaw = body.jwk?.trim();

    if (!jwkRaw) {
      return NextResponse.json({ error: "JWK JSON is required" }, { status: 400 });
    }

    parseArweaveJwk(jwkRaw);
    setUserArweaveJwk(userId, jwkRaw);

    const wallet = await getArweaveWalletStatus(userId);
    return NextResponse.json({ wallet });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save wallet";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  clearUserArweaveJwk(userId);
  const wallet = await getArweaveWalletStatus(userId);
  return NextResponse.json({ wallet });
}
