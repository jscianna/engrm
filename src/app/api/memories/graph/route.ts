import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getMemoryGraph, getFullMemoryGraph } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawLimit = Number(searchParams.get("limit") || 100);
  const limit = Number.isFinite(rawLimit) ? rawLimit : 100;
  const full = searchParams.get("full") === "true";

  // Use full graph (includes syntheses) when requested
  if (full) {
    const graph = await getFullMemoryGraph(userId, limit);
    return NextResponse.json(graph);
  }

  const graph = await getMemoryGraph(userId, limit);
  return NextResponse.json(graph);
}
