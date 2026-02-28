import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { listApiKeys, createApiKey } from "@/lib/db";

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

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const agentName = typeof body.agentName === "string" ? body.agentName : undefined;

    const { apiKey, agentId } = await createApiKey(userId, agentName);

    return NextResponse.json({
      apiKey,
      agentId,
      message: "API key created. Save it now — you won't see it again.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create API key";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
