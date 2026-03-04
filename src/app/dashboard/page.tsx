import Link from "next/link";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { Database, HardDrive, PlusCircle } from "lucide-react";
import { MemoryCard } from "@/components/memory-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCachedMemories, getCachedMemoryStats } from "@/lib/memories";

const DreamCycleCard = dynamic(
  () => import("@/components/dream-cycle-card").then((module) => module.DreamCycleCard),
  {
    loading: () => (
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="p-5 text-sm text-zinc-400">Loading dream cycle...</CardContent>
      </Card>
    ),
  },
);

const AnalyticsWidget = dynamic(
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

      <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/40" />}>
        <MemoriesSection memoriesPromise={memoriesPromise} />
      </Suspense>
    </div>
  );
}
