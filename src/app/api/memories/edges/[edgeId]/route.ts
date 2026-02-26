import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { deleteMemoryEdge } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ edgeId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { edgeId } = await context.params;
  const deleted = await deleteMemoryEdge(userId, edgeId);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
