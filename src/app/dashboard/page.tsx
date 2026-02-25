import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { PlusCircle } from "lucide-react";
import { MemoryCard } from "@/components/memory-card";
import { Button } from "@/components/ui/button";
import { getMemories } from "@/lib/memories";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const memories = getMemories(userId);

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Dashboard</p>
          <h1 className="text-2xl font-semibold text-zinc-100">Your Permanent Memories</h1>
          <p className="text-sm text-zinc-400">{memories.length} memories indexed across your personal vault.</p>
        </div>
        <Button asChild className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
          <Link href="/dashboard/add">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Memory
          </Link>
        </Button>
      </section>

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
