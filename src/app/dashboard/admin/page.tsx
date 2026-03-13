import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, CheckCircle2, KeyRound, Shield, Siren } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { assertAdminViewer } from "@/lib/admin-auth";
import { getOperationalAlertDeliveryConfig } from "@/lib/alert-delivery";
import { getOperationalAlertsSummary } from "@/lib/operational-alerts";
import { getApiKeyScopeMigrationStatus } from "@/lib/db";
import { getCognitiveJobHealth, getRecentBenchmarkRuns } from "@/lib/cognitive-db";
import { getPublishedOpenClawPluginVersion } from "@/lib/openclaw-plugin";
import { applyApiKeyBackfillAction, sendOperationalAlertTestAction } from "./actions";

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Never";
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "critical" || status === "failed") {
    return "destructive";
  }
  if (status === "warning") {
    return "secondary";
  }
  return "default";
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  let identity;
  try {
    identity = await assertAdminViewer();
  } catch {
    redirect("/dashboard");
  }

  const resolvedParams = (await searchParams) ?? {};
  const notice = typeof resolvedParams.notice === "string" ? resolvedParams.notice : null;
  const error = typeof resolvedParams.error === "string" ? resolvedParams.error : null;

  const [alertsSummary, delivery, migration, jobs, benchmarkRuns] = await Promise.all([
    getOperationalAlertsSummary(),
    Promise.resolve(getOperationalAlertDeliveryConfig()),
    getApiKeyScopeMigrationStatus(),
    getCognitiveJobHealth(),
    identity.userId ? getRecentBenchmarkRuns(identity.userId, 6) : Promise.resolve([]),
  ]);
  const publishedOpenClawPluginVersion = getPublishedOpenClawPluginVersion();

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Admin</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-100">Platform Control Room</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          You are signed in as an admin{identity.email ? ` (${identity.email})` : ""}. Use this page to check launch readiness, alerting, benchmark health, and API key rollout.
        </p>
      </section>

      {notice ? (
        <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">{notice}</div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardDescription>Open alerts</CardDescription>
            <CardTitle className="flex items-center gap-2 text-zinc-100">
              <Siren className="h-4 w-4 text-cyan-300" />
              {alertsSummary.alerts.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardDescription>Alert delivery</CardDescription>
            <CardTitle className="flex items-center gap-2 text-zinc-100">
              <BellRing className="h-4 w-4 text-cyan-300" />
              {delivery.configured ? "Configured" : "Missing webhook"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardDescription>Legacy API keys</CardDescription>
            <CardTitle className="flex items-center gap-2 text-zinc-100">
              <KeyRound className="h-4 w-4 text-cyan-300" />
              {migration.legacyKeysMissingScopes}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardDescription>Wildcard API keys</CardDescription>
            <CardTitle className="flex items-center gap-2 text-zinc-100">
              <Shield className="h-4 w-4 text-cyan-300" />
              {migration.revocableWildcardKeys}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Simple launch tasks you can trigger from the dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <form action={sendOperationalAlertTestAction}>
              <Button type="submit" size="sm">Send Alert Smoke Test</Button>
            </form>
            <form action={applyApiKeyBackfillAction}>
              <Button type="submit" size="sm" variant="outline">Backfill Legacy API Keys</Button>
            </form>
            <Button asChild type="button" size="sm" variant="secondary">
              <Link href="/dashboard/cognitive">Open Cognition</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle>What To Check Before Launch</CardTitle>
            <CardDescription>Keep these green before you open the product up.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-300">
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> Alert delivery configured</p>
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> Benchmark runs passing</p>
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> No stale heartbeat jobs</p>
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> No unexpected wildcard keys</p>
            <p className="flex items-center gap-2">
              <CheckCircle2 className={`h-4 w-4 ${publishedOpenClawPluginVersion ? "text-emerald-300" : "text-amber-300"}`} />
              {publishedOpenClawPluginVersion ? "OpenClaw published plugin version configured" : "Set OPENCLAW_PUBLISHED_PLUGIN_VERSION"}
            </p>
            <p className="pt-2 text-xs text-zinc-500">Reference: docs/PRODUCTION-LAUNCH-RUNBOOK.md</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle>Active Alerts</CardTitle>
            <CardDescription>Operational issues that should be reviewed before launch.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {alertsSummary.alerts.length === 0 ? (
              <p className="text-sm text-zinc-500">No active alerts right now.</p>
            ) : alertsSummary.alerts.map((alert) => (
              <div key={alert.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{alert.message}</p>
                    <p className="mt-1 text-xs text-zinc-500">Source: {alert.source} · Count: {alert.count}</p>
                  </div>
                  <Badge variant={statusVariant(alert.severity)}>{alert.severity}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle>Alert Delivery</CardTitle>
            <CardDescription>Where launch-critical alerts are sent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-300">
            <p><span className="text-zinc-500">Status:</span> {delivery.configured ? "Ready" : "Not configured"}</p>
            <p><span className="text-zinc-500">Format:</span> {delivery.format}</p>
            <p><span className="text-zinc-500">Destination:</span> {delivery.destination ?? "Missing OPS_ALERT_WEBHOOK_URL"}</p>
            <p><span className="text-zinc-500">Auth:</span> {delivery.hasBearerToken ? "Bearer token configured" : "No bearer token"}</p>
            <p><span className="text-zinc-500">Schedule:</span> every {delivery.schedule.intervalMinutes} min, repeat every {delivery.schedule.repeatMinutes} min</p>
            <p><span className="text-zinc-500">Dispatch secret:</span> {delivery.schedule.secretConfigured ? "Configured" : "Missing dispatch secret"}</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle>OpenClaw Plugin Release Tracking</CardTitle>
            <CardDescription>Controls whether the user dashboard can show a real plugin update badge.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-300">
            <p><span className="text-zinc-500">Status:</span> {publishedOpenClawPluginVersion ? "Configured" : "Missing"}</p>
            <p><span className="text-zinc-500">Published plugin version:</span> {publishedOpenClawPluginVersion ?? "Missing OPENCLAW_PUBLISHED_PLUGIN_VERSION"}</p>
            <p className="text-xs text-zinc-500">
              Set <code>OPENCLAW_PUBLISHED_PLUGIN_VERSION</code> in your deployment environment to the latest published
              <code> @fathippo/fathippo-context-engine</code> version after each npm release.
            </p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle>Recommended Server Env</CardTitle>
            <CardDescription>Copy this into your deployment provider when you publish a new OpenClaw plugin.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-300">
            <pre className="overflow-x-auto rounded-lg bg-zinc-950 px-3 py-3 text-xs text-zinc-200">
              <code>{`OPENCLAW_PUBLISHED_PLUGIN_VERSION=${publishedOpenClawPluginVersion ?? "0.1.1"}`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle>API Key Scope Rollout</CardTitle>
            <CardDescription>Legacy and wildcard keys that still need attention.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-300">
            <p><span className="text-zinc-500">Total keys:</span> {migration.totalKeys}</p>
            <p><span className="text-zinc-500">Scoped keys:</span> {migration.scopedKeys}</p>
            <p><span className="text-zinc-500">Legacy keys missing scopes:</span> {migration.legacyKeysMissingScopes}</p>
            <p><span className="text-zinc-500">Wildcard keys:</span> {migration.wildcardKeys}</p>
            <p><span className="text-zinc-500">Revocable wildcard keys:</span> {migration.revocableWildcardKeys}</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle>Heartbeat Jobs</CardTitle>
            <CardDescription>Background learning work should stay fresh.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobs.map((job) => (
              <div key={job.jobName} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-sm">
                <p className="font-medium text-zinc-100">{job.jobName}</p>
                <p className="mt-1 text-zinc-400">Last success {formatDate(job.lastSuccessAt)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle>Recent Benchmark Gates</CardTitle>
            <CardDescription>Your latest benchmark results from the cognitive pipeline.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {benchmarkRuns.length === 0 ? (
              <p className="text-sm text-zinc-500">No benchmark runs recorded for your account yet.</p>
            ) : benchmarkRuns.map((run) => (
              <div key={run.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{run.dataset} · {run.fixtureCount} fixtures</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      trace MRR {Number(run.result.traceMrr ?? 0).toFixed(2)} · success {Math.round(Number(run.result.successRate ?? 0) * 100)}%
                    </p>
                  </div>
                  <Badge variant={statusVariant(run.gate?.passed === true ? "passed" : "failed")}>
                    {run.gate?.passed === true ? "passed" : "failed"}
                  </Badge>
                </div>
                {Array.isArray(run.gate?.reasons) && run.gate.reasons.length > 0 ? (
                  <p className="mt-2 text-xs text-zinc-500">{run.gate.reasons.join(", ")}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
