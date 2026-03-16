import Link from "next/link";
import nextDynamic from "next/dynamic";
import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";

// Force dynamic rendering — dashboard should always show fresh data
export const dynamic = "force-dynamic";
export const revalidate = 0;
import { ArrowRight, CheckCircle2, Database, HardDrive, PlusCircle, PlugZap, Sparkles } from "lucide-react";
import { MemoryCard } from "@/components/memory-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildFathippoReceipt, isOpenClawAgentName } from "@/lib/cognitive-receipts";
import { getRecentApplications } from "@/lib/cognitive-db";
import { listApiKeys } from "@/lib/db";
import { getCachedMemories, getCachedMemoryStats } from "@/lib/memories";
import { getOpenClawPluginStatus, pickPreferredOpenClawKey } from "@/lib/openclaw-plugin";

const DreamCycleCard = nextDynamic(
  () => import("@/components/dream-cycle-card").then((module) => module.DreamCycleCard),
  {
    loading: () => (
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="p-5 text-sm text-zinc-400">Loading dream cycle...</CardContent>
      </Card>
    ),
  },
);

const AnalyticsWidget = nextDynamic(
  () => import("@/components/analytics-widget").then((module) => module.AnalyticsWidget),
  {
    loading: () => (
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="p-5 text-sm text-zinc-400">Loading analytics...</CardContent>
      </Card>
    ),
  },
);

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatUsageDate(value: string | null | undefined): string {
  if (!value) {
    return "Never";
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

async function HeroSection({ statsPromise }: { statsPromise: ReturnType<typeof getCachedMemoryStats> }) {
  const stats = await statsPromise;

  return (
    <section className="reveal-up flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Dashboard</p>
        <h1 className="text-2xl font-semibold text-zinc-100">Your Memories</h1>
        <p className="text-sm text-zinc-400">{stats.totalMemories} memories indexed.</p>
      </div>
      <Button asChild className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
        <Link href="/dashboard/add">
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Memory
        </Link>
      </Button>
    </section>
  );
}

async function StatsSection({ statsPromise }: { statsPromise: ReturnType<typeof getCachedMemoryStats> }) {
  const stats = await statsPromise;

  return (
    <section className="reveal-up grid gap-4 md:grid-cols-3">
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="p-5">
          <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Memory Count</p>
          <p className="flex items-center gap-2 text-2xl font-semibold text-zinc-100">
            <Database className="h-5 w-5 text-cyan-300" />
            {stats.totalMemories}
          </p>
        </CardContent>
      </Card>
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="p-5">
          <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Storage Usage</p>
          <p className="flex items-center gap-2 text-2xl font-semibold text-zinc-100">
            <HardDrive className="h-5 w-5 text-cyan-300" />
            {formatBytes(stats.storageBytes)}
          </p>
        </CardContent>
      </Card>
      {/* Storage status intentionally simplified */}
    </section>
  );
}

async function MemoriesSection({ memoriesPromise }: { memoriesPromise: ReturnType<typeof getCachedMemories> }) {
  const memories = await memoriesPromise;

  if (memories.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-10 text-center text-sm text-zinc-400">
        No memories yet. Add your first memory to get started.
      </div>
    );
  }

  return (
    <section className="memory-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {memories.map((memory) => (
        <MemoryCard key={memory.id} memory={memory} />
      ))}
    </section>
  );
}

async function FatHippoHelpSection({ userId }: { userId: string }) {
  const [applications, apiKeys] = await Promise.all([
    getRecentApplications(userId, 8),
    listApiKeys(userId),
  ]);
  const openClawKey = pickPreferredOpenClawKey(
    apiKeys.filter((key) => isOpenClawAgentName(key.agentName)),
  );
  const pluginStatus = await getOpenClawPluginStatus(openClawKey ?? null);
  const receipts = applications
    .map((bundle) => buildFathippoReceipt(bundle))
    .filter((receipt): receipt is NonNullable<typeof receipt> => receipt != null)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  const connectionTitle = !openClawKey
    ? "Connect your existing OpenClaw"
    : openClawKey.lastUsed
      ? "OpenClaw is connected"
      : "Finish connecting OpenClaw";
  const connectionDescription = !openClawKey
    ? "Create one key, paste four commands into your terminal, and FatHippo will start learning from future sessions."
    : openClawKey.lastUsed
      ? pluginStatus.lastSeenVersion
        ? `FatHippo has been helping OpenClaw recently. Last seen v${pluginStatus.lastSeenVersion} in ${pluginStatus.lastSeenMode ?? "hosted"} mode on ${formatUsageDate(pluginStatus.lastSeenAt ?? openClawKey.lastUsed)}.`
        : `FatHippo has been helping OpenClaw recently. Last seen ${formatUsageDate(openClawKey.lastUsed)}.`
      : "You already have an OpenClaw key. Finish the terminal setup and FatHippo will start showing receipts here.";

  return (
    <section className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">FatHippo Helped</p>
              <h2 className="mt-2 text-lg font-semibold text-zinc-100">Recent wins</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Lightweight receipts so users can feel the value without interrupting the session.
              </p>
            </div>
            <Sparkles className="mt-1 h-5 w-5 text-cyan-300" />
          </div>

          {receipts.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 p-4 text-sm text-zinc-400">
              Once OpenClaw uses FatHippo on a few real tasks, you’ll see short receipts here showing reused patterns,
              suggested workflows, and likely retries saved.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {receipts.map((receipt) => (
                <div key={`${receipt.title}-${receipt.score}`} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-100">{receipt.title}</p>
                      <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                        {receipt.bullets.map((bullet) => (
                          <li key={bullet} className="flex items-start gap-2">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Badge variant={receipt.status === "warning" ? "destructive" : receipt.status === "neutral" ? "secondary" : "default"}>
                      score {receipt.score}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">OpenClaw</p>
              <h2 className="mt-2 text-lg font-semibold text-zinc-100">{connectionTitle}</h2>
              <p className="mt-1 text-sm text-zinc-400">{connectionDescription}</p>
            </div>
            <PlugZap className="mt-1 h-5 w-5 text-cyan-300" />
          </div>

          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 text-xs text-zinc-400">
            FatHippo works best when OpenClaw is already part of your daily workflow. Connect it once, then let it
            quietly improve retrieval, repeated fixes, and debugging order over time.
          </div>

          {pluginStatus.lastSeenVersion ? (
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-xs text-zinc-400">
              Connected plugin: <span className="text-zinc-100">v{pluginStatus.lastSeenVersion}</span>
              {pluginStatus.lastSeenMode ? ` (${pluginStatus.lastSeenMode})` : ""}
              {pluginStatus.updateAvailable ? (
                <Badge className="ml-2 bg-amber-500/15 text-amber-300 hover:bg-amber-500/15">
                  Update available: v{pluginStatus.publishedVersion ?? pluginStatus.currentVersion}
                </Badge>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
              <Link href="/dashboard/settings">
                {openClawKey ? "Review OpenClaw Setup" : "Connect OpenClaw"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/docs/guides/openclaw">Open Guide</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const statsPromise = getCachedMemoryStats(userId);
  const memoriesPromise = getCachedMemories(userId);

  return (
    <div className="space-y-6">
      <Suspense fallback={<div className="h-32 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/40" />}>
        <HeroSection statsPromise={statsPromise} />
      </Suspense>

      <Suspense fallback={<div className="h-36 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/40" />}>
        <StatsSection statsPromise={statsPromise} />
      </Suspense>

      <div className="grid gap-4 md:grid-cols-2">
        <DreamCycleCard />
        <AnalyticsWidget />
      </div>

      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/40" />}>
        <FatHippoHelpSection userId={userId} />
      </Suspense>

      <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/40" />}>
        <MemoriesSection memoriesPromise={memoriesPromise} />
      </Suspense>
    </div>
  );
}
