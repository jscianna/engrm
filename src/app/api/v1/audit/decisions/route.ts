/**
 * Memory Write Decision Ledger API
 *
 * Returns audit log entries for memory write decisions, filterable by
 * reason_code, MCP origin, and time window. Admin-only.
 */

import { assertAdminAccess } from "@/lib/admin-auth";
import { getDecisionLedger } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await assertAdminAccess(request);
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const reasonCode = url.searchParams.get("reason_code") ?? undefined;
  const mcpOnly = url.searchParams.get("mcp_only") === "true";
  const userId = url.searchParams.get("user_id") ?? undefined;
  const since = url.searchParams.get("since") ?? undefined;
  const until = url.searchParams.get("until") ?? undefined;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 500);

  // Shorthand time windows
  const window = url.searchParams.get("window");
  let computedSince = since;
  if (!computedSince && window) {
    const now = Date.now();
    if (window === "1h") computedSince = new Date(now - 60 * 60 * 1000).toISOString();
    else if (window === "24h") computedSince = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    else if (window === "7d") computedSince = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  try {
    const ledger = await getDecisionLedger({
      userId,
      reasonCode,
      mcpOnly,
      since: computedSince,
      until,
      limit,
    });

    return Response.json(ledger);
  } catch (error) {
    console.error("[Audit] Decision ledger query failed:", error);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
