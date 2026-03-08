import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Activity, AlertTriangle, Database, Filter, ListTree, TrendingUp, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InjectionLogTable } from "@/components/injection-log-table";
import { getMemoryAnalyticsDashboard, type TrendPoint } from "@/lib/memory-analytics";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeDelta(current: number, previous: number): string {
  if (previous === 0) {
    return current === 0 ? "flat vs prior week" : "new this week";
  }

  const delta = current - previous;
  const percent = Math.round((Math.abs(delta) / previous) * 100);
  if (delta === 0) {
    return "flat vs prior week";
  }

  return `${delta > 0 ? "+" : "-"}${percent}% vs prior week`;
}

function MiniTrendChart({ points }: { points: TrendPoint[] }) {
  const maxValue = Math.max(1, ...points.map((point) => point.value));
  const path = points
    .map((point, index) => {
      const x = points.length === 1 ? 100 : (index / (points.length - 1)) * 100;
      const y = 100 - (point.value / maxValue) * 100;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <div className="space-y-2">
      <svg viewBox="0 0 100 100" className="h-20 w-full overflow-visible">
        <path d={path} fill="none" stroke="rgb(34 211 238)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="grid grid-cols-7 gap-1 text-[11px] text-zinc-500">
        {points.map((point) => (
          <div key={point.date} className="truncate text-center">
            {point.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityCard({
  title,
  count,
  delta,
  icon: Icon,
  points,
  scope,
}: {
  title: string;
  count: number;
  delta: string;
  icon: LucideIcon;
  points: TrendPoint[];
  scope: "global" | "filtered";
}) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-300">
          <Icon className="h-4 w-4 text-cyan-400" />
          {title}
          <Badge variant="outline" className="border-zinc-700 text-[10px] uppercase tracking-wide text-zinc-400">
            {scope}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-3xl font-semibold text-zinc-100">{count}</p>
          <p className="text-xs uppercase tracking-wide text-zinc-500">{delta}</p>
        </div>
        <MiniTrendChart points={points} />
      </CardContent>
    </Card>
  );
}

export default async function MemoryAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ conversationId?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const params = (await searchParams) ?? {};
  const selectedConversationId = typeof params.conversationId === "string" ? params.conversationId : undefined;
  const dashboard = await getMemoryAnalyticsDashboard(userId, {
    conversationId: selectedConversationId,
  });

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Memory Analytics</p>
          <h1 className="text-2xl font-semibold text-zinc-100">Implicit quality and injection telemetry</h1>
          <p className="text-sm text-zinc-400">
            Monitor recalls, memory creation, correction signals, and what context actually gets injected.
          </p>
        </div>
        {selectedConversationId ? (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-cyan-800 bg-cyan-950/40 text-cyan-200">
              <Filter className="mr-1 h-3 w-3" />
              {selectedConversationId}
            </Badge>
            <Button asChild variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800">
              <Link href="/dashboard/analytics">Clear Filter</Link>
            </Button>
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Memory Activity</p>
          <h2 className="text-xl font-semibold text-zinc-100">Recall and creation trends</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ActivityCard
            title="Recalls This Week"
            count={dashboard.memoryActivity.recallsThisWeek}
            delta={formatRelativeDelta(
              dashboard.memoryActivity.recallsThisWeek,
              dashboard.memoryActivity.recallsPreviousWeek,
            )}
            icon={TrendingUp}
            points={dashboard.memoryActivity.recallsTrend}
            scope="global"
          />
          <ActivityCard
            title="Memories Created This Week"
            count={dashboard.memoryActivity.memoriesCreatedThisWeek}
            delta={formatRelativeDelta(
              dashboard.memoryActivity.memoriesCreatedThisWeek,
              dashboard.memoryActivity.memoriesCreatedPreviousWeek,
            )}
            icon={Database}
            points={dashboard.memoryActivity.memoriesCreatedTrend}
            scope="global"
          />
        </div>
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-300">
              Most Accessed Memories
              <Badge variant="outline" className="border-zinc-700 text-[10px] uppercase tracking-wide text-zinc-400">
                Global
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.memoryActivity.mostAccessedMemories.length === 0 ? (
              <p className="text-sm text-zinc-400">No recall activity yet.</p>
            ) : (
              <div className="space-y-3">
                {dashboard.memoryActivity.mostAccessedMemories.map((memory, index) => (
                  <div
                    key={memory.id}
                    className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-zinc-500">#{index + 1}</p>
                      <Link href={`/dashboard/memory/${memory.id}`} className="truncate text-sm text-zinc-100 hover:text-cyan-300">
                        {memory.title}
                      </Link>
                    </div>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                      {memory.accessCount} accesses
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Quality Signals</p>
          <h2 className="text-xl font-semibold text-zinc-100">Correction patterns and review queues</h2>
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                Correction Events Detected
                <Badge variant="outline" className="border-cyan-800 bg-cyan-950/30 text-[10px] uppercase tracking-wide text-cyan-300">
                  {selectedConversationId ? "Filtered" : "All Conversations"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.qualitySignals.correctionEvents.length === 0 ? (
                <p className="text-sm text-zinc-400">No correction signals recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {dashboard.qualitySignals.correctionEvents.map((signal) => (
                    <Link
                      key={signal.id}
                      href={signal.conversationId ? `/dashboard/analytics?conversationId=${encodeURIComponent(signal.conversationId)}` : "/dashboard/analytics"}
                      className="block rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 transition-colors hover:border-cyan-800 hover:bg-zinc-950"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <p className="text-sm text-zinc-100">{signal.patternMatched}</p>
                          <p className="text-xs text-zinc-500">
                            {signal.signalType}
                            {signal.conversationId ? ` • ${signal.conversationId}` : ""}
                          </p>
                        </div>
                        <span className="whitespace-nowrap text-xs text-zinc-500">{formatTimestamp(signal.createdAt)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                  <ListTree className="h-4 w-4 text-cyan-400" />
                  Pattern Breakdown
                  <Badge variant="outline" className="border-cyan-800 bg-cyan-950/30 text-[10px] uppercase tracking-wide text-cyan-300">
                    {selectedConversationId ? "Filtered" : "All Conversations"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dashboard.qualitySignals.patternBreakdown.length === 0 ? (
                  <p className="text-sm text-zinc-400">No patterns detected yet.</p>
                ) : (
                  <div className="space-y-3">
                    {dashboard.qualitySignals.patternBreakdown.map((pattern) => (
                      <div key={`${pattern.signalType}-${pattern.pattern}`} className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm text-zinc-100">{pattern.pattern}</p>
                          <p className="text-xs uppercase tracking-wide text-zinc-500">{pattern.signalType}</p>
                        </div>
                        <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                          {pattern.count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                  <AlertTriangle className="h-4 w-4 text-cyan-400" />
                  Conversations Flagged for Review
                  <Badge variant="outline" className="border-zinc-700 text-[10px] uppercase tracking-wide text-zinc-400">
                    Global
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dashboard.qualitySignals.flaggedConversations.length === 0 ? (
                  <p className="text-sm text-zinc-400">No conversations flagged yet.</p>
                ) : (
                  <div className="space-y-3">
                    {dashboard.qualitySignals.flaggedConversations.map((conversation) => (
                      <Link
                        key={conversation.conversationId}
                        href={`/dashboard/analytics?conversationId=${encodeURIComponent(conversation.conversationId)}`}
                        className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 transition-colors hover:border-cyan-800 hover:bg-zinc-950"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs text-zinc-200">{conversation.conversationId}</p>
                          <p className="text-xs text-zinc-500">{formatTimestamp(conversation.lastSignalAt)}</p>
                        </div>
                        <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                          {conversation.signalCount} signals
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Injection Log</p>
            <h2 className="text-xl font-semibold text-zinc-100">Sortable injection telemetry</h2>
          </div>
          <Badge variant="outline" className="border-zinc-700 text-zinc-300">
            {dashboard.injectionLog.total} total events
          </Badge>
        </div>
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-300">
              <Activity className="h-4 w-4 text-cyan-400" />
              Recent Injections
              <Badge variant="outline" className="border-cyan-800 bg-cyan-950/30 text-[10px] uppercase tracking-wide text-cyan-300">
                {selectedConversationId ? "Filtered" : "All Conversations"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InjectionLogTable events={dashboard.injectionLog.events} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
