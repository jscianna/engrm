"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, BarChart3, TrendingUp, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MemoryImportanceTier } from "@/lib/types";

type AnalyticsSummary = {
  totalMemories: number;
  memoriesThisWeek: number;
  totalSearches: number;
  avgAccessCount: number;
  tierDistribution: Record<MemoryImportanceTier, number>;
  topMemory: { id: string; title: string; accessCount: number } | null;
};

const TIER_COLORS: Record<MemoryImportanceTier, string> = {
  critical: "bg-red-500",
  working: "bg-orange-500",
  high: "bg-yellow-500",
  normal: "bg-zinc-500",
};

export function AnalyticsWidget() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSummary() {
      try {
        const res = await fetch("/api/dashboard/analytics");
        if (res.ok) {
          const data = await res.json();
          setSummary(data);
        }
      } catch {
        // Silently fail - widget is non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchSummary();
  }, []);

  if (loading) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="p-5">
          <div className="h-24 animate-pulse rounded bg-zinc-800/50" />
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return null;
  }

  const totalByTier = Object.values(summary.tierDistribution).reduce((a, b) => a + b, 0);

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-300">
          <BarChart3 className="h-4 w-4 text-cyan-400" />
          Memory Analytics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Stats Row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-semibold text-zinc-100">{summary.memoriesThisWeek}</p>
            <p className="text-xs text-zinc-500">This Week</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-zinc-100">{summary.totalSearches}</p>
            <p className="text-xs text-zinc-500">Searches</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-zinc-100">{summary.avgAccessCount}</p>
            <p className="text-xs text-zinc-500">Avg Access</p>
          </div>
        </div>

        {/* Tier Distribution Bar */}
        <div>
          <p className="text-xs text-zinc-500 mb-2 flex items-center gap-1">
            <Zap className="h-3 w-3" />
            Tier Distribution
          </p>
          <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800">
            {(["critical", "working", "high", "normal"] as MemoryImportanceTier[]).map((tier) => {
              const count = summary.tierDistribution[tier];
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
          <div className="flex justify-between mt-1 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {summary.tierDistribution.critical} critical
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              {summary.tierDistribution.high} high
            </span>
          </div>
        </div>

        {/* Top Memory */}
        {summary.topMemory && (
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
            <div className="flex items-center gap-2 min-w-0">
              <TrendingUp className="h-4 w-4 text-green-400 shrink-0" />
              <span className="text-xs text-zinc-400 truncate">
                Top: {summary.topMemory.title}
              </span>
            </div>
            <Badge variant="outline" className="border-zinc-700 text-zinc-300 shrink-0">
              <Activity className="h-3 w-3 mr-1" />
              {summary.topMemory.accessCount}
            </Badge>
          </div>
        )}

        {/* Link to Memories */}
        <Link 
          href="/dashboard/search" 
          className="block text-center text-xs text-cyan-400 hover:text-cyan-300 pt-2"
        >
          Explore memories →
        </Link>
      </CardContent>
    </Card>
  );
}
