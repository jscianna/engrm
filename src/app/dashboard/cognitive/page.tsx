import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Brain, CheckCircle2, Clock3, GitBranchPlus, ShieldAlert, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getCognitiveJobHealth,
  getCognitiveMetrics,
  getPatterns,
  getRecentApplications,
  getRecentTraces,
  getSkills,
} from "@/lib/cognitive-db";
import {
  deprecatePatternAction,
  disablePublishAction,
  publishSkillAction,
  refreshSkillAction,
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

export default async function CognitiveDashboardPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/");
  }

  const [metrics, traces, patterns, skills, applications, jobs] = await Promise.all([
    getCognitiveMetrics(userId, 14),
    getRecentTraces(userId, 12),
    getPatterns(userId),
    getSkills(userId),
    getRecentApplications(userId, 12),
    getCognitiveJobHealth(),
  ]);

  const lowConfidenceApps = applications.filter(
    ({ application }) => application.finalOutcome === "failed" || application.acceptedPatternId == null,
  ).slice(0, 6);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Cognitive Ops</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-100">Learning Loop Control Room</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Monitor trace capture, pattern promotion, skill freshness, application feedback, and heartbeat health from one place.
        </p>
      </section>

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
            <CardDescription>Shared trace opt-in rate</CardDescription>
            <CardTitle className="flex items-center gap-2 text-zinc-100"><CheckCircle2 className="h-4 w-4 text-cyan-300" />{Math.round(metrics.sharedTraceOptInRate * 100)}%</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle>Recent Traces</CardTitle>
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
            <CardTitle>Heartbeat Jobs</CardTitle>
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

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle>Patterns</CardTitle>
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
                <form action={deprecatePatternAction} className="mt-3">
                  <input type="hidden" name="patternId" value={pattern.id} />
                  <Button type="submit" size="xs" variant="outline">Mark Deprecated</Button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle>Skills</CardTitle>
            <CardDescription>Freshness, publication state, and operator controls.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {skills.slice(0, 12).map((skill) => (
              <div key={skill.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{skill.name}</p>
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
            <CardTitle>Application Feedback</CardTitle>
            <CardDescription>Inspect injected patterns and skills, accepted entities, and weak failures.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {applications.map(({ application, matches }) => (
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
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle>Needs Attention</CardTitle>
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
