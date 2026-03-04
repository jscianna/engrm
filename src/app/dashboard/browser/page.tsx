"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MemoryTimeline, type TimelineMemory } from "@/components/memory-timeline";
import { MemoryStats, type MemoryStatsData } from "@/components/memory-stats";
import { TierFilter } from "@/components/tier-filter";
import type { MemoryImportanceTier } from "@/lib/types";

type BrowserMemory = TimelineMemory;

type BrowserResponse = {
  memories: BrowserMemory[];
  stats: MemoryStatsData;
};

export default function MemoryBrowserPage() {
  const [memories, setMemories] = useState<BrowserMemory[]>([]);
  const [stats, setStats] = useState<MemoryStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTiers, setSelectedTiers] = useState<MemoryImportanceTier[]>([]);

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/browser");
      if (!res.ok) {
        throw new Error("Failed to load memories");
      }
      const data: BrowserResponse = await res.json();
      setMemories(data.memories);
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const filteredMemories = useMemo(() => {
    let result = memories;

    // Filter by tier
    if (selectedTiers.length > 0) {
      result = result.filter((m) => selectedTiers.includes(m.importanceTier));
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.title.toLowerCase().includes(query) ||
          m.text.toLowerCase().includes(query)
      );
    }

    return result;
  }, [memories, selectedTiers, searchQuery]);

  const tierCounts = useMemo(() => {
    const counts: Record<MemoryImportanceTier, number> = {
      critical: 0,
      working: 0,
      high: 0,
      normal: 0,
    };
    for (const memory of memories) {
      counts[memory.importanceTier]++;
    }
    return counts;
  }, [memories]);

  const handleToggleTier = (tier: MemoryImportanceTier) => {
    setSelectedTiers((prev) =>
      prev.includes(tier)
        ? prev.filter((t) => t !== tier)
        : [...prev, tier]
    );
  };

  const handleClearFilters = () => {
    setSelectedTiers([]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="reveal-up flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Memory Browser</p>
          <h1 className="text-2xl font-semibold text-zinc-100">Explore Your Memories</h1>
          <p className="text-sm text-zinc-400">
            Timeline view with tier filtering and search.
          </p>
        </div>
        <Button
          onClick={fetchMemories}
          disabled={loading}
          className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300 disabled:opacity-50"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </section>

      {/* Stats */}
      {stats && <MemoryStats stats={stats} />}

      {/* Filters */}
      <section className="reveal-up rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              type="text"
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
        </div>

        {/* Tier Filter */}
        <TierFilter
          selectedTiers={selectedTiers}
          onToggle={handleToggleTier}
          onClear={handleClearFilters}
          counts={tierCounts}
        />
      </section>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && !memories.length && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/40"
            />
          ))}
        </div>
      )}

      {/* Timeline */}
      {!loading && <MemoryTimeline memories={filteredMemories} />}

      {/* Results count */}
      {!loading && memories.length > 0 && (
        <div className="text-center text-xs text-zinc-500">
          Showing {filteredMemories.length} of {memories.length} memories
          {selectedTiers.length > 0 && ` (filtered by ${selectedTiers.join(", ")})`}
          {searchQuery && ` matching "${searchQuery}"`}
        </div>
      )}
    </div>
  );
}
