import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Brain, CheckCircle2, Clock3, Download, GitBranchPlus, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildFathippoReceipt } from "@/lib/cognitive-receipts";
import {
  getAdaptivePolicySummaries,
  getCognitiveJobHealth,
  getCognitiveMetrics,
  getCognitiveUserSettings,
  getPatterns,
  getRecentBenchmarkRuns,
  getRecentApplications,
  getRecentTraces,
  getSkills,
  getToolWorkflowSummaries,
} from "@/lib/cognitive-db";
import {
  deleteCognitiveDataAction,
  deprecatePatternAction,
  disablePublishAction,
  publishSkillAction,
  refreshSkillAction,
  updatePrivacySettingsAction,
} from "./actions";

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
  if (status.includes("deprecated") || status.includes("failed") || status === "stale") {
    return "destructive";
  }
  if (status.includes("candidate") || status.includes("draft")) {
    return "secondary";
  }
  return "default";
}

export default async function CognitiveDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/");
  }
  const resolvedSearchParams = (await searchParams) ?? {};
  const notice = typeof resolvedSearchParams.notice === "string" ? resolvedSearchParams.notice : null;
  const error = typeof resolvedSearchParams.error === "string" ? resolvedSearchParams.error : null;

  const [metrics, settings, traces, patterns, skills, applications, jobs, benchmarkRuns, policySummaries, workflowSummaries] = await Promise.all([
    getCognitiveMetrics(userId, 14),
    getCognitiveUserSettings(userId),
    getRecentTraces(userId, 12),
    getPatterns(userId),
    getSkills(userId),
    getRecentApplications(userId, 12),
    getCognitiveJobHealth(),
    getRecentBenchmarkRuns(userId, 6),
    getAdaptivePolicySummaries(userId),
    getToolWorkflowSummaries(userId),
  ]);

  const lowConfidenceApps = applications.filter(
    ({ application }) => application.finalOutcome === "failed" || application.acceptedPatternId == null,
  ).slice(0, 6);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Cognition</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-100">Cognition Control Room</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Monitor trace capture, pattern promotion, skill freshness, application feedback, and heartbeat health from one place.
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
            <CardDescription>Traces captured (14d)</CardDescription>
            <CardTitle className="flex items-center gap-2 text-zinc-100"><Brain className="h-4 w-4 text-cyan-300" />{metrics.tracesCaptured}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardDescription>Patterns created / deprecated</CardDescription>
            <CardTitle className="flex items-center gap-2 text-zinc-100"><GitBranchPlus className="h-4 w-4 text-cyan-300" />{metrics.patternsCreated} / {metrics.patternsDeprecated}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardDescription>Skills created / stale</CardDescription>
            <CardTitle className="flex items-center gap-2 text-zinc-100"><Sparkles className="h-4 w-4 text-cyan-300" />{metrics.skillsCreated} / {metrics.staleSkills}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardDescription>Shared learning</CardDescription>
            <CardTitle className="flex items-center gap-2 text-zinc-100"><CheckCircle2 className="h-4 w-4 text-cyan-300" />{settings.sharedLearningEnabled ? "Enabled" : "Disabled"}</CardTitle>
            <p className="text-xs text-zinc-500">{Math.round(metrics.sharedTraceOptInRate * 100)}% of recent traces were share-eligible.</p>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-zinc-100">Privacy Controls</CardTitle>
            <CardDescription>Control sharing, benchmark inclusion, and retention for your cognitive data.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updatePrivacySettingsAction} className="space-y-4">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-100">Shared learning</p>
                  <p className="text-xs text-zinc-500">Allow sanitized traces to contribute to shared global patterns.</p>
                </div>
                <input
                  type="checkbox"
                  name="sharedLearningEnabled"
                  defaultChecked={settings.sharedLearningEnabled}
                  className="h-4 w-4 accent-cyan-400"
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-100">Benchmark inclusion</p>
                  <p className="text-xs text-zinc-500">Allow your application history to be used in generated eval fixtures.</p>
                </div>
                <input
                  type="checkbox"
                  name="benchmarkInclusionEnabled"
                  defaultChecked={settings.benchmarkInclusionEnabled}
                  className="h-4 w-4 accent-cyan-400"
                />
              </label>

              <label className="block rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3">
                <p className="text-sm font-medium text-zinc-100">Trace retention</p>
                <p className="mt-1 text-xs text-zinc-500">How long raw cognitive traces should be kept before retention cleanup removes them.</p>
                <select
                  name="traceRetentionDays"
                  defaultValue={String(settings.traceRetentionDays)}
                  className="mt-3 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                >
                  <option value="30">30 days</option>
                  <option value="60">60 days</option>
                  <option value="90">90 days</option>
                  <option value="180">180 days</option>
                </select>
              </label>

              <Button type="submit" size="sm">Save Privacy Settings</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-zinc-100">Export or Delete Data</CardTitle>
            <CardDescription>Use these controls for access and deletion requests on your cognitive data.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
              <p className="text-sm font-medium text-zinc-100">Export cognitive data</p>
              <p className="mt-1 text-xs text-zinc-500">Download your traces, applications, local patterns, skills, settings, and benchmark history as JSON.</p>
              <Button asChild size="sm" className="mt-3">
                <a href="/dashboard/cognitive/export">
                  <Download className="h-4 w-4" />
                  Export JSON
                </a>
              </Button>
            </div>
            <div className="rounded-xl border border-red-900 bg-red-950/30 p-4">
              <p className="text-sm font-medium text-zinc-100">Delete cognitive data</p>
              <p className="mt-1 text-xs text-zinc-400">This removes your cognitive traces, local patterns, local skills, benchmark runs, and settings. Shared-learning contributions are revoked first.</p>
              <form action={deleteCognitiveDataAction} className="mt-3">
                <Button type="submit" size="sm" variant="destructive">
                  <Trash2 className="h-4 w-4" />
                  Delete Cognitive Data
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-zinc-100">Adaptive Retrieval Policies</CardTitle>
            <CardDescription>Private per-user strategy learning for traces, patterns, and synthesized skills.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {policySummaries.length === 0 ? (
              <p className="text-sm text-zinc-500">No adaptive policy data yet. FatHippo will start learning once retrievals are used and outcomes are recorded.</p>
            ) : policySummaries.map((policy) => (
              <div key={policy.policyKey} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{policy.policyKey.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {policy.successCount}/{policy.resolvedCount} successful · {policy.verifiedSuccessCount} verified · {policy.acceptedCount} accepted
                    </p>
                  </div>
                  <Badge variant={policy.avgReward < 0 ? "destructive" : policy.avgReward < 0.1 ? "secondary" : "default"}>
                    reward {policy.avgReward.toFixed(2)}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-zinc-400">
                  {policy.sampleCount} total applications
                  {policy.avgRetries != null ? ` · avg retries ${policy.avgRetries.toFixed(1)}` : ""}
                  {policy.avgTimeToResolutionMs != null ? ` · avg time ${Math.round(policy.avgTimeToResolutionMs / 60000)}m` : ""}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-zinc-100">Learned Tool Workflows</CardTitle>
            <CardDescription>Private workflow hints learned from your own tool sequences and verified outcomes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {workflowSummaries.length === 0 ? (
              <p className="text-sm text-zinc-500">No workflow recommendations yet. FatHippo will learn after a few captured sessions with tool activity and outcomes.</p>
            ) : workflowSummaries.map((workflow) => (
              <div key={workflow.strategyKey} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{workflow.strategyKey.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {workflow.successCount}/{workflow.resolvedCount} successful · {workflow.verifiedSuccessCount} verified
                    </p>
                  </div>
                  <Badge variant={workflow.avgReward < 0 ? "destructive" : workflow.avgReward < 0.1 ? "secondary" : "default"}>
                    reward {workflow.avgReward.toFixed(2)}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-zinc-400">{workflow.sampleCount} matched workflow runs</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-zinc-100">Recent Traces</CardTitle>
            <CardDescription>Outcome source, duration, and automated signal context.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {traces.map((trace) => {
              const context = JSON.parse(trace.contextJson) as Record<string, unknown>;
              const automatedSignals = JSON.parse(trace.automatedSignalsJson) as Record<string, unknown>;
              return (
                <div key={trace.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-100">{trace.problem}</p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {trace.type} · {trace.outcomeSource} · {Math.round(trace.outcomeConfidence * 100)}% confidence · {Math.round(trace.durationMs / 1000)}s
                      </p>
                    </div>
                    <Badge variant={statusVariant(trace.outcome)}>{trace.outcome}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    {(Array.isArray(context.technologies) ? context.technologies.join(", ") : "no technologies")} ·{" "}
                    {typeof automatedSignals.resolutionKind === "string" ? automatedSignals.resolutionKind : "manual_only"}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-zinc-100">Heartbeat Jobs</CardTitle>
            <CardDescription>Current lease and checkpoint state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobs.map((job) => (
              <div key={job.jobName} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-100">{job.jobName}</p>
                  <Clock3 className="h-4 w-4 text-zinc-500" />
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  Last run {formatDate(job.lastRunAt)} · Last success {formatDate(job.lastSuccessAt)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">Lease expires {formatDate(job.leaseExpiresAt)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-zinc-100">Benchmark Gates</CardTitle>
            <CardDescription>Recent curated/generated benchmark runs and release gate status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {benchmarkRuns.length === 0 ? (
              <p className="text-sm text-zinc-500">No benchmark runs recorded yet.</p>
            ) : benchmarkRuns.map((run) => (
              <div key={run.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{run.dataset} · {run.fixtureCount} fixtures</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      trace MRR {Number(run.result.traceMrr ?? 0).toFixed(2)} · success {Math.round(Number(run.result.successRate ?? 0) * 100)}%
                    </p>
                  </div>
                  <Badge variant={run.gate?.passed === true ? "default" : "destructive"}>
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

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-zinc-100">Impact Leaders</CardTitle>
            <CardDescription>Patterns and skills with the strongest verified impact.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {patterns
              .filter((pattern) => pattern.applicationCount > 0)
              .sort((left, right) => right.impactScore - left.impactScore)
              .slice(0, 6)
              .map((pattern) => (
                <div key={pattern.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                  <p className="text-sm font-medium text-zinc-100">{pattern.domain}</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    impact {pattern.impactScore.toFixed(2)} · {Math.round(pattern.verificationPassRate * 100)}% verified · {pattern.acceptedApplicationCount}/{pattern.applicationCount} accepted
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{pattern.promotionReason ?? "No promotion reason yet."}</p>
                </div>
              ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-zinc-100">Patterns</CardTitle>
            <CardDescription>Promoted, candidate, and deprecated pattern state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {patterns.slice(0, 12).map((pattern) => (
              <div key={pattern.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{pattern.domain}</p>
                    <p className="mt-1 text-xs text-zinc-400">{pattern.approach.slice(0, 180)}</p>
                  </div>
                  <Badge variant={statusVariant(pattern.status)}>{pattern.status}</Badge>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {Math.round(pattern.confidence * 100)}% confidence · {pattern.successCount} success / {pattern.failCount} fail · {pattern.sourceTraceCount} traces
                </p>
                {pattern.scope === "local" ? (
                  <form action={deprecatePatternAction} className="mt-3">
                    <input type="hidden" name="patternId" value={pattern.id} />
                    <Button type="submit" size="xs" variant="outline">Mark Deprecated</Button>
                  </form>
                ) : (
                  <p className="mt-3 text-xs text-zinc-500">Global pattern controls require an approved admin or service path.</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-zinc-100">Skills</CardTitle>
            <CardDescription>Freshness, publication state, and operator controls.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {skills.slice(0, 12).map((skill) => (
              <div key={skill.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/dashboard/cognitive/skills/${skill.id}`} className="text-sm font-medium text-zinc-100 hover:text-cyan-300 transition-colors">{skill.name}</Link>
                    <p className="mt-1 text-xs text-zinc-400">{skill.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant={statusVariant(skill.status)}>{skill.status}</Badge>
                    {skill.published ? <Badge variant="outline">published</Badge> : null}
                  </div>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {Math.round(skill.successRate * 100)}% success · {skill.usageCount} uses · {skill.sourceTraceCount} source traces
                </p>
                {skill.scope === "local" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={refreshSkillAction}>
                      <input type="hidden" name="skillId" value={skill.id} />
                      <Button type="submit" size="xs" variant="outline">Refresh Draft</Button>
                    </form>
                    <form action={publishSkillAction}>
                      <input type="hidden" name="skillId" value={skill.id} />
                      <Button type="submit" size="xs" variant="outline">Publish</Button>
                    </form>
                    <form action={disablePublishAction}>
                      <input type="hidden" name="skillId" value={skill.id} />
                      <Button type="submit" size="xs" variant="outline">Disable Publish</Button>
                    </form>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-zinc-500">Global skill controls require an approved service publish path.</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-zinc-100">Application Feedback</CardTitle>
            <CardDescription>Inspect injected patterns and skills, accepted entities, and weak failures.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {applications.map(({ application, matches }) => {
              const receipt = buildFathippoReceipt({ application, matches });
              return (
                <div key={application.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-100">{application.problem}</p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {application.endpoint} · {formatDate(application.createdAt)}
                      </p>
                    </div>
                    <Badge variant={statusVariant(application.finalOutcome ?? "candidate")}>
                      {application.finalOutcome ?? "pending"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {matches.map((match) => (
                      <Badge key={match.id} variant={match.accepted ? "default" : "outline"}>
                        {match.entityType} #{match.rank} · {match.entityScope} {match.accepted ? "accepted" : ""}
                      </Badge>
                    ))}
                  </div>
                  {receipt ? (
                    <div className="mt-3 rounded-lg border border-cyan-950 bg-cyan-950/20 p-3">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">FatHippo helped</p>
                      <ul className="mt-2 space-y-1 text-xs text-zinc-300">
                        {receipt.bullets.map((bullet) => (
                          <li key={bullet}>• {bullet}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-zinc-100">Needs Attention</CardTitle>
            <CardDescription>Failed or unresolved applications with no accepted entity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {lowConfidenceApps.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-sm text-zinc-400">
                No weak applications in the recent sample.
              </div>
            ) : (
              lowConfidenceApps.map(({ application }) => (
                <div key={application.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-100">{application.problem}</p>
                    <ShieldAlert className="h-4 w-4 text-amber-300" />
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">
                    Outcome {application.finalOutcome ?? "pending"} · accepted pattern {application.acceptedPatternId ?? "none"} · accepted skill {application.acceptedSkillId ?? "none"}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
