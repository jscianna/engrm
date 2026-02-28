"use client";

import { useEffect, useState } from "react";
import { Activity, Database, HardDrive, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type UsageData = {
  usage: {
    apiCallsToday: number;
    apiCallsThisMonth: number;
    memoriesThisMonth: number;
    storageBytes: number;
    estimatedStorageCost: number;
  };
  limits: {
    requestsPerMinute: number;
    requestsPerDay: number;
    memoriesPerMonth: number;
    storageBytes: number;
  };
  percentages: {
    apiCallsToday: number;
    memoriesThisMonth: number;
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsage() {
      try {
        const response = await fetch("/api/settings/usage");
        if (!response.ok) throw new Error("Failed to load usage");
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load usage");
      } finally {
        setLoading(false);
      }
    }
    fetchUsage();
  }, []);

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
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-zinc-100">
          <Activity className="h-5 w-5 text-cyan-400" />
          Usage This Month
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
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
          label="Memories Created"
          value={formatNumber(data.usage.memoriesThisMonth)}
          limit={formatNumber(data.limits.memoriesPerMonth)}
          percent={data.percentages.memoriesThisMonth}
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

        {data.usage.estimatedStorageCost > 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-xs text-zinc-500">Estimated Storage Cost</p>
            <p className="text-lg font-semibold text-zinc-200">
              ${data.usage.estimatedStorageCost.toFixed(2)}
              <span className="ml-1 text-xs font-normal text-zinc-500">when committed to Arweave</span>
            </p>
          </div>
        )}

        <p className="text-xs text-zinc-600">
          Limits reset at the start of each month (UTC). Rate limit: {data.limits.requestsPerMinute} req/min.
        </p>
      </CardContent>
    </Card>
  );
}
