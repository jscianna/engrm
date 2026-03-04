import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createMemoryEdge, getMemoryById, listMemoryEdgesByUser } from "@/lib/db";
import type { MemoryRelationshipType } from "@/lib/types";

export const runtime = "nodejs";

const ALLOWED_RELATIONSHIP_TYPES: MemoryRelationshipType[] = [
  "similar",
  "same_entity",
  "updates",
  "contradicts",
  "extends",
  "derives_from",
  "references",
];

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") || 250);
  const edges = await listMemoryEdgesByUser(userId, Number.isFinite(limit) ? limit : 250);
  return NextResponse.json({ edges });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as {
      sourceId?: string;
      targetId?: string;
      relationshipType?: string;
      weight?: number;
      metadata?: Record<string, unknown> | null;
    };

    const sourceId = payload.sourceId?.trim();
    const targetId = payload.targetId?.trim();
    const relationshipType = payload.relationshipType?.trim() as MemoryRelationshipType | undefined;

    if (!sourceId || !targetId || !relationshipType) {
      return NextResponse.json({ error: "sourceId, targetId, and relationshipType are required" }, { status: 400 });
    }
    if (sourceId === targetId) {
      return NextResponse.json({ error: "sourceId and targetId must be different" }, { status: 400 });
    }
    if (!ALLOWED_RELATIONSHIP_TYPES.includes(relationshipType)) {
      return NextResponse.json({ error: "Invalid relationshipType" }, { status: 400 });
    }

    const [sourceMemory, targetMemory] = await Promise.all([getMemoryById(sourceId), getMemoryById(targetId)]);
    if (!sourceMemory || sourceMemory.userId !== userId || !targetMemory || targetMemory.userId !== userId) {
      return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    }

    const edge = await createMemoryEdge({
      userId,
      sourceId,
      targetId,
      relationshipType,
      weight: payload.weight,
      metadata: payload.metadata,
    });

    return NextResponse.json({ edge }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create edge";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
