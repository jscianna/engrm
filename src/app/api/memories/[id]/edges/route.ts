import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getMemoriesByIds, getMemoryById, getMemoryEdgesForMemory } from "@/lib/db";

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
  const memory = await getMemoryById(id);
  if (!memory || memory.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const edges = await getMemoryEdgesForMemory(userId, id);
  const relatedIds = Array.from(
    new Set([
      ...edges.incoming.map((edge) => edge.sourceId),
      ...edges.outgoing.map((edge) => edge.targetId),
    ]),
  );
  const relatedMemories = await getMemoriesByIds(userId, relatedIds);
  return NextResponse.json({ ...edges, relatedMemories });
}
