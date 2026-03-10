"use client";

import { useEffect, useState, useCallback } from "react";
import { Activity, Database, HardDrive, RefreshCw, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type UsageData = {
  usage: {
    apiCallsToday: number;
    apiCallsThisMonth: number;
    memoriesTotal: number;
    storageBytes: number;
    estimatedStorageCost: number;
  };
  limits: {
    requestsPerMinute: number;
    requestsPerDay: number;
    memoriesTotal: number;
    storageBytes: number;
  };
  percentages: {
    apiCallsToday: number;
    memoriesTotal: number;
    storageBytes: number;
  };
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  const clampedPercent = Math.min(100, Math.max(0, percent));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
      <div
        className={`h-full transition-all duration-500 ${color}`}
        style={{ width: `${clampedPercent}%` }}
      />
    </div>
  );
}

function UsageStat({
  icon: Icon,
  label,
  value,
  limit,
  percent,
  color,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  limit: string;
  percent: number;
  color: string;
}) {
  const barColor = percent > 90 ? "bg-rose-500" : percent > 70 ? "bg-amber-500" : color;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${color.replace("bg-", "text-").replace("-500", "-400")}`} />
          <span className="text-sm text-zinc-400">{label}</span>
        </div>
        <span className="text-sm font-medium text-zinc-200">
          {value} <span className="text-zinc-500">/ {limit}</span>
        </span>
      </div>
      <ProgressBar percent={percent} color={barColor} />
    </div>
  );
}

export function UsageCard() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const response = await fetch("/api/settings/usage");
      if (!response.ok) throw new Error("Failed to load usage");
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load usage");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  if (loading) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-zinc-100">
            <Activity className="h-5 w-5 text-cyan-400" />
            Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-8 rounded bg-zinc-800" />
            <div className="h-8 rounded bg-zinc-800" />
            <div className="h-8 rounded bg-zinc-800" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-zinc-100">
            <Activity className="h-5 w-5 text-cyan-400" />
            Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500">{error || "No usage data"}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-lg text-zinc-100">
          <Activity className="h-5 w-5 text-cyan-400" />
          Usage
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fetchUsage(true)}
          disabled={refreshing}
          className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-200"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-5 pt-4">
        <UsageStat
          icon={Zap}
          label="API Calls Today"
          value={formatNumber(data.usage.apiCallsToday)}
          limit={formatNumber(data.limits.requestsPerDay)}
          percent={data.percentages.apiCallsToday}
          color="bg-cyan-500"
        />

        <UsageStat
          icon={Database}
          label="Memories Created Total"
          value={formatNumber(data.usage.memoriesTotal)}
          limit={formatNumber(data.limits.memoriesTotal)}
          percent={data.percentages.memoriesTotal}
          color="bg-violet-500"
        />

        <UsageStat
          icon={HardDrive}
          label="Storage Used"
          value={formatBytes(data.usage.storageBytes)}
          limit={formatBytes(data.limits.storageBytes)}
          percent={data.percentages.storageBytes}
          color="bg-emerald-500"
        />

        <p className="text-xs text-zinc-600">
          Daily API calls reset at midnight UTC. Memory quota is a total lifetime cap. Rate limit: {data.limits.requestsPerMinute} req/min.
        </p>
      </CardContent>
    </Card>
  );
}
