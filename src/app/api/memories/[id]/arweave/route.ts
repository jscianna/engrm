import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getMemory } from "@/lib/memories";
import { getMemoryFromArweave } from "@/lib/arweave";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const memory = getMemory(id);

  if (!memory || memory.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!memory.arweaveTxId) {
    return NextResponse.json({ error: "Memory is not committed to Arweave" }, { status: 400 });
  }

  const arweave = await getMemoryFromArweave(memory.arweaveTxId);
  if (!arweave) {
    return NextResponse.json({ error: "Failed to fetch data from Arweave" }, { status: 502 });
  }

  return NextResponse.json({
    txId: memory.arweaveTxId,
    local: {
      memoryId: memory.id,
      title: memory.title,
      contentHash: memory.contentHash,
      tags: memory.tags,
      sourceType: memory.sourceType,
      memoryType: memory.memoryType,
      importance: memory.importance,
    },
    arweave,
  });
}
