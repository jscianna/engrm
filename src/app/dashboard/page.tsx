import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Database, HardDrive, PlusCircle } from "lucide-react";
import { DreamCycleCard } from "@/components/dream-cycle-card";
import { MemoryCard } from "@/components/memory-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getMemories, getMemoryStats } from "@/lib/memories";

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  let memories: Awaited<ReturnType<typeof getMemories>> = [];
  let stats: Awaited<ReturnType<typeof getMemoryStats>> = { 
    totalMemories: 0, 
    committedMemories: 0, 
    pendingMemories: 0, 
    storageBytes: 0 
  };
  
  try {
    memories = await getMemories(userId);
  } catch (error) {
    console.error("[Dashboard] getMemories failed:", error);
  }
  
  try {
    stats = await getMemoryStats(userId);
  } catch (error) {
    console.error("[Dashboard] getMemoryStats failed:", error);
  }

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Dashboard</p>
          <h1 className="text-2xl font-semibold text-zinc-100">Your Permanent Memories</h1>
          <p className="text-sm text-zinc-400">{stats.totalMemories} memories indexed across your personal vault.</p>
        </div>
        <Button asChild className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
          <Link href="/dashboard/add">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Memory
          </Link>
        </Button>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
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
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardContent className="p-5">
            <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Arweave Status</p>
            <p className="text-2xl font-semibold text-zinc-100">{stats.committedMemories} committed</p>
            <p className="text-sm text-zinc-400">{stats.pendingMemories} pending</p>
          </CardContent>
        </Card>
      </section>

      <DreamCycleCard />

      {memories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-10 text-center text-sm text-zinc-400">
          No memories yet. Add your first memory and anchor it to Arweave.
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {memories.map((memory) => (
            <MemoryCard key={memory.id} memory={memory} />
          ))}
        </section>
      )}
    </div>
  );
}
