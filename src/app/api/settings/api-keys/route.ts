import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { listApiKeys } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const keys = await listApiKeys(userId);
    return NextResponse.json({ keys });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list API keys";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
