import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getMemory, getRelatedMemories } from "@/lib/memories";

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
  const memory = await getMemory(id);

  if (!memory || memory.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (memory.isEncrypted) {
    return NextResponse.json({ related: [] });
  }

  try {
    const results = await getRelatedMemories({
      userId,
      memoryId: memory.id,
      contentText: memory.contentText,
      topK: 5,
    });

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load related memories";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
