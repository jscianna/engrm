import { NextResponse } from "next/server";
import {
  startOpenClawConnectSession,
  isConnectSessionError,
} from "@/lib/connect-sessions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const started = await startOpenClawConnectSession({
      arch: typeof body.arch === "string" ? body.arch : null,
      cliVersion: typeof body.cliVersion === "string" ? body.cliVersion : null,
      installationName: typeof body.installationName === "string" ? body.installationName : null,
      mode: typeof body.mode === "string" ? body.mode : null,
      namespaceHint: typeof body.namespaceHint === "string" ? body.namespaceHint : null,
      platform: typeof body.platform === "string" ? body.platform : null,
    });
    const loginUrl = new URL(`/connect/openclaw?connectId=${encodeURIComponent(started.connectId)}`, request.url);

    return NextResponse.json({
      ...started,
      loginUrl: loginUrl.toString(),
    });
  } catch (error) {
    if (isConnectSessionError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to create OpenClaw connect session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
