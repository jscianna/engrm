import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createMemory, getMemories } from "@/lib/memories";
import type { MemoryKind, MemorySourceType } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memories = getMemories(userId);
  return NextResponse.json({ memories });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();

    const sourceType = (formData.get("sourceType") || "text") as MemorySourceType;
    const memoryType = (formData.get("memoryType") || "episodic") as MemoryKind;
    const importance = Number(formData.get("importance") || 5);
    const tags = ((formData.get("tags") as string) || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const title = (formData.get("title") as string) || undefined;
    const text = (formData.get("text") as string) || undefined;
    const url = (formData.get("url") as string) || undefined;
    const file = formData.get("file");

    const memory = await createMemory({
      userId,
      sourceType,
      memoryType,
      importance,
      tags,
      title,
      text,
      url,
      file: file instanceof File && file.size > 0 ? file : undefined,
    });

    return NextResponse.json({ memory }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create memory";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
