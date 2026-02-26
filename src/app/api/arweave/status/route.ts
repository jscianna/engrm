import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getMemoryStats } from "@/lib/memories";
import { getArweaveWalletStatus } from "@/lib/arweave";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [wallet, stats] = await Promise.all([
      getArweaveWalletStatus(userId),
      Promise.resolve(await getMemoryStats(userId)),
    ]);

    return NextResponse.json({
      wallet,
      uploads: {
        committed: stats.committedMemories,
        pending: stats.pendingMemories,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch Arweave status";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
