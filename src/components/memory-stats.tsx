"use client";

import { Activity, Brain, Database, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { MemoryImportanceTier } from "@/lib/types";

export type MemoryStatsData = {
  totalMemories: number;
  tierDistribution: Record<MemoryImportanceTier, number>;
  totalTokens: number;
  avgAccessCount: number;
};

type MemoryStatsProps = {
  stats: MemoryStatsData;
};

const TIER_COLORS: Record<MemoryImportanceTier, string> = {
  critical: "bg-red-500",
  working: "bg-orange-500",
  high: "bg-yellow-500",
  normal: "bg-zinc-500",
};

function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(2)}M`;
}

export function MemoryStats({ stats }: MemoryStatsProps) {
  const totalByTier = Object.values(stats.tierDistribution).reduce((a, b) => a + b, 0);

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-cyan-400" />
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Total Memories</span>
          </div>
          <p className="text-2xl font-semibold text-zinc-100">{stats.totalMemories}</p>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="h-4 w-4 text-purple-400" />
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Est. Tokens</span>
          </div>
          <p className="text-2xl font-semibold text-zinc-100">{formatTokens(stats.totalTokens)}</p>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-green-400" />
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Avg Accesses</span>
          </div>
          <p className="text-2xl font-semibold text-zinc-100">{stats.avgAccessCount.toFixed(1)}</p>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-yellow-400" />
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Tier Distribution</span>
          </div>
          
          {/* Tier bar */}
          <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800">
            {(["critical", "working", "high", "normal"] as MemoryImportanceTier[]).map((tier) => {
              const count = stats.tierDistribution[tier];
              const percent = totalByTier > 0 ? (count / totalByTier) * 100 : 0;
              if (percent === 0) return null;
              return (
                <div
                  key={tier}
                  className={TIER_COLORS[tier]}
                  style={{ width: `${percent}%` }}
                  title={`${tier}: ${count}`}
                />
              );
            })}
          </div>
          
          {/* Legend */}
          <div className="flex flex-wrap gap-2 mt-2">
            {(["critical", "working", "high", "normal"] as MemoryImportanceTier[]).map((tier) => (
              <div key={tier} className="flex items-center gap-1 text-xs text-zinc-400">
                <div className={`w-2 h-2 rounded-full ${TIER_COLORS[tier]}`} />
                <span className="capitalize">{tier}</span>
                <span className="text-zinc-600">({stats.tierDistribution[tier]})</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
