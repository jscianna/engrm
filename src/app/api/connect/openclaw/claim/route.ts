import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { assertEntitlement, EntitlementFeature } from "@/lib/entitlements";
import {
  claimOpenClawConnectSession,
  isConnectSessionError,
} from "@/lib/connect-sessions";
import { FatHippoError } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await assertEntitlement(userId, EntitlementFeature.HostedSync);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const connectId = typeof body.connectId === "string" ? body.connectId.trim() : "";
    if (!connectId) {
      return NextResponse.json({ error: "connectId is required." }, { status: 400 });
    }

    const baseUrl = new URL("/api", request.url).toString();
    const claimed = await claimOpenClawConnectSession({
      baseUrl,
      connectId,
      namespace: typeof body.namespace === "string" ? body.namespace : null,
      userId,
    });

    return NextResponse.json(claimed);
  } catch (error) {
    if (error instanceof FatHippoError) {
      return NextResponse.json(
        {
          error: error.userMessage,
          code: error.code,
          details: error.details,
        },
        { status: error.status },
      );
    }
    if (isConnectSessionError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to authorize OpenClaw install";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
