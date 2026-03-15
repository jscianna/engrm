import { NextResponse } from "next/server";
import {
  isConnectSessionError,
  pollOpenClawConnectSession,
} from "@/lib/connect-sessions";

export const runtime = "nodejs";

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) {
    return null;
  }
  const [scheme, token] = header.trim().split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
}

export async function GET(request: Request) {
  try {
    const pollToken = getBearerToken(request);
    if (!pollToken) {
      return NextResponse.json({ error: "Missing poll token." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const connectId = searchParams.get("connectId")?.trim();
    if (!connectId) {
      return NextResponse.json({ error: "connectId is required." }, { status: 400 });
    }

    const result = await pollOpenClawConnectSession({
      connectId,
      pollToken,
    });

    if (result.status === "pending") {
      return NextResponse.json(result, { status: 202 });
    }
    if (result.status === "authorized") {
      return NextResponse.json(result, { status: 200 });
    }

    return NextResponse.json(result, { status: 410 });
  } catch (error) {
    if (isConnectSessionError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to poll OpenClaw connect session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
