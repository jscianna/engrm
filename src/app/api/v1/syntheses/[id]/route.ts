import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getAgentMemoriesByIds,
  getSynthesizedMemoryById,
  incrementSynthesizedMemoryAccess,
  updateSynthesizedMemory,
  deleteSynthesizedMemory,
} from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "syntheses.get");
    const { id } = await context.params;
    const synthesis = await getSynthesizedMemoryById(identity.userId, id);

    if (!synthesis) {
      throw new MemryError("SYNTHESIS_NOT_FOUND");
    }

    await incrementSynthesizedMemoryAccess(identity.userId, synthesis.id);

    const sourceMemories = await getAgentMemoriesByIds({
      userId: identity.userId,
      ids: synthesis.sourceMemoryIds,
    });

    return Response.json({
      synthesis: {
        ...synthesis,
        accessCount: synthesis.accessCount + 1,
      },
      sourceMemories,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const { title, synthesis: content } = body;

  const existing = await getSynthesizedMemoryById(userId, id);
  if (!existing) {
    return NextResponse.json({ error: "Synthesis not found" }, { status: 404 });
  }

  const updated = await updateSynthesizedMemory(userId, id, {
    title: title ?? existing.title,
    synthesis: content ?? existing.synthesis,
  });

  const sourceMemories = await getAgentMemoriesByIds({
    userId,
    ids: updated.sourceMemoryIds,
  });

  return NextResponse.json({ synthesis: updated, sourceMemories });
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

  const existing = await getSynthesizedMemoryById(userId, id);
  if (!existing) {
    return NextResponse.json({ error: "Synthesis not found" }, { status: 404 });
  }

  await deleteSynthesizedMemory(userId, id);

  return NextResponse.json({ success: true });
}
