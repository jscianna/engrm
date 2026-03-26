import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { assertAdminViewer } from "@/lib/admin-auth";
import { getDecisionLedger } from "@/lib/audit-log";

function computeSince(window: string): string {
  const now = Date.now();
  if (window === "1h") return new Date(now - 60 * 60 * 1000).toISOString();
  if (window === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  return new Date(now - 24 * 60 * 60 * 1000).toISOString();
}

function formatTs(value: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function decisionBadge(decision: string): "default" | "secondary" | "outline" | "destructive" {
  if (decision === "accepted") return "default";
  if (decision === "rejected") return "destructive";
  if (decision === "merged" || decision === "updated") return "secondary";
  return "outline";
}

function reasonLabel(code: string): string {
  const labels: Record<string, string> = {
    stored: "Stored",
    updated_existing: "Updated existing",
    merged_exact_duplicate: "Merged duplicate",
    rejected_empty: "Empty",
    rejected_low_quality: "Low quality",
    rejected_hard_deny: "Hard deny",
    rejected_secret: "Secret detected",
    rejected_duplicate_cooldown: "Cooldown",
  };
  return labels[code] ?? code;
}

export default async function AuditLedgerPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    await assertAdminViewer();
  } catch {
    redirect("/dashboard");
  }

  const resolved = (await searchParams) ?? {};
  const window = typeof resolved.window === "string" ? resolved.window : "24h";
  const mcpOnly = resolved.mcp_only === "true";
  const reasonCode = typeof resolved.reason_code === "string" ? resolved.reason_code : undefined;

  const since = computeSince(window);

  const ledger = await getDecisionLedger({ since, mcpOnly, reasonCode, limit: 200 });

  const allReasonCodes = [
    "stored", "updated_existing", "merged_exact_duplicate",
    "rejected_empty", "rejected_low_quality", "rejected_hard_deny",
    "rejected_secret", "rejected_duplicate_cooldown",
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Admin &gt; Audit</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-100">Memory Decision Ledger</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Every memory write decision with reason codes, MCP origin tracing, and source metadata.
        </p>
      </section>

      {/* Filters */}
      <section className="flex flex-wrap items-center gap-2">
        {["1h", "24h", "7d"].map((w) => (
          <a
            key={w}
            href={`/dashboard/admin/audit?window=${w}${mcpOnly ? "&mcp_only=true" : ""}${reasonCode ? `&reason_code=${reasonCode}` : ""}`}
            className={`rounded-lg border px-3 py-1.5 text-xs transition ${
              window === w
                ? "border-cyan-700 bg-cyan-950/60 text-cyan-200"
                : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            {w}
          </a>
        ))}
        <span className="mx-1 text-zinc-700">|</span>
        <a
          href={`/dashboard/admin/audit?window=${window}${!mcpOnly ? "&mcp_only=true" : ""}${reasonCode ? `&reason_code=${reasonCode}` : ""}`}
          className={`rounded-lg border px-3 py-1.5 text-xs transition ${
            mcpOnly
              ? "border-violet-700 bg-violet-950/60 text-violet-200"
              : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500"
          }`}
        >
          MCP only
        </a>
        <span className="mx-1 text-zinc-700">|</span>
        <a
          href={`/dashboard/admin/audit?window=${window}${mcpOnly ? "&mcp_only=true" : ""}`}
          className={`rounded-lg border px-3 py-1.5 text-xs transition ${
            !reasonCode
              ? "border-zinc-600 bg-zinc-800 text-zinc-200"
              : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500"
          }`}
        >
          All reasons
        </a>
        {allReasonCodes.map((rc) => (
          <a
            key={rc}
            href={`/dashboard/admin/audit?window=${window}${mcpOnly ? "&mcp_only=true" : ""}&reason_code=${rc}`}
            className={`rounded-lg border px-3 py-1.5 text-xs transition ${
              reasonCode === rc
                ? "border-amber-700 bg-amber-950/60 text-amber-200"
                : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            {reasonLabel(rc)}
          </a>
        ))}
      </section>

      {/* Summary cards */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardDescription>Total decisions</CardDescription>
            <CardTitle className="text-zinc-100">{ledger.entries.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardDescription>MCP-origin</CardDescription>
            <CardTitle className="text-violet-300">{ledger.mcpCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardDescription>Direct / API</CardDescription>
            <CardTitle className="text-zinc-100">{ledger.directCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardDescription>Accept rate</CardDescription>
            <CardTitle className="text-emerald-300">
              {ledger.entries.length > 0
                ? `${Math.round(((ledger.totals["stored"] ?? 0) + (ledger.totals["updated_existing"] ?? 0) + (ledger.totals["merged_exact_duplicate"] ?? 0)) / ledger.entries.length * 100)}%`
                : "N/A"}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      {/* Breakdown by reason code */}
      <section>
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle>Breakdown by Reason Code</CardTitle>
            <CardDescription>
              Window: {formatTs(ledger.window.since)} &ndash; {formatTs(ledger.window.until)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(ledger.totals).length === 0 ? (
              <p className="text-sm text-zinc-500">No decisions in this window.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(ledger.totals)
                  .sort(([, a], [, b]) => b - a)
                  .map(([code, count]) => (
                    <div key={code} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                      <p className="text-xs text-zinc-500">{reasonLabel(code)}</p>
                      <p className="mt-1 text-lg font-semibold text-zinc-100">{count}</p>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Decision log table */}
      <section>
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle>Decision Log</CardTitle>
            <CardDescription>Most recent {ledger.entries.length} decisions</CardDescription>
          </CardHeader>
          <CardContent>
            {ledger.entries.length === 0 ? (
              <p className="text-sm text-zinc-500">No memory write decisions recorded in this window.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                      <th className="pb-2 pr-4">Time</th>
                      <th className="pb-2 pr-4">Decision</th>
                      <th className="pb-2 pr-4">Reason</th>
                      <th className="pb-2 pr-4">Source</th>
                      <th className="pb-2 pr-4">Runtime</th>
                      <th className="pb-2">Preview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.entries.map((entry) => (
                      <tr key={entry.id} className="border-b border-zinc-800/50">
                        <td className="whitespace-nowrap py-2 pr-4 text-xs text-zinc-400">
                          {formatTs(entry.timestamp)}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant={decisionBadge(entry.decision)}>{entry.decision}</Badge>
                        </td>
                        <td className="py-2 pr-4 text-xs text-zinc-300">{reasonLabel(entry.reasonCode)}</td>
                        <td className="py-2 pr-4">
                          {entry.mcpRelated ? (
                            <span className="inline-flex items-center gap-1 rounded bg-violet-950/60 px-1.5 py-0.5 text-xs text-violet-300">
                              MCP
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-500">direct</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-xs text-zinc-500">{entry.runtime ?? "-"}</td>
                        <td className="max-w-xs truncate py-2 text-xs text-zinc-400">{entry.textPreview}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
