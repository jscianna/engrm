import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { commitMemoryToArweave } from "@/lib/memories";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const memory = await commitMemoryToArweave({ userId, memoryId: id });
    return NextResponse.json({ memory });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Commit failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
