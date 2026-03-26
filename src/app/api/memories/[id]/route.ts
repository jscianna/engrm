import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  deleteAgentMemoryById,
  getAgentMemoryById,
  getMemoryById,
  updateAgentMemory,
} from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { recordMemoryDeleted } from "@/lib/rate-limiter";

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

  return NextResponse.json({ memory });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const existing = await getMemoryById(id);
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const updates: { title?: string; text?: string } = {};

    if (typeof body.title === "string") {
      updates.title = body.title.trim();
    }
    if (typeof body.text === "string") {
      updates.text = body.text.trim();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await updateAgentMemory(userId, id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    const memory = await getMemoryById(id);
    if (!memory || memory.userId !== userId) {
      return NextResponse.json({ error: "Failed to load updated memory" }, { status: 500 });
    }

    return NextResponse.json({ memory });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const memory = await getAgentMemoryById(userId, id);
  if (!memory) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const deleted = await deleteAgentMemoryById(userId, id);
  if (!deleted) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }

  const sizeBytes = Buffer.byteLength(memory.text, "utf8");
  await recordMemoryDeleted(userId, sizeBytes);

  return NextResponse.json({ success: true });
}
