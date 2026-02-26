"use client";

import Link from "next/link";
import { useState } from "react";
import { GitBranch, Loader2, MoonStar, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DreamResult = {
  generatedAt: string;
  bonds: Array<{
    leftId: string;
    rightId: string;
    leftTitle: string;
    rightTitle: string;
    score: number;
    persisted: boolean;
  }>;
  promotions: Array<{
    memoryId: string;
    title: string;
    from: "episodic";
    to: "semantic";
    reason: string;
  }>;
  decay: Array<{
    day: number;
    retained: number;
    count: number;
  }>;
};

export function DreamCycleCard() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DreamResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingKeys, setSavingKeys] = useState<string[]>([]);
  const [dismissedKeys, setDismissedKeys] = useState<string[]>([]);

  function bondKey(bond: DreamResult["bonds"][number]): string {
    return `${bond.leftId}:${bond.rightId}`;
  }

  async function saveBond(bond: DreamResult["bonds"][number]) {
    const key = bondKey(bond);
    if (bond.persisted || savingKeys.includes(key)) {
      return;
    }

    try {
      setSavingKeys((current) => [...current, key]);
      const response = await fetch("/api/memories/edges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceId: bond.leftId,
          targetId: bond.rightId,
          relationshipType: "similar",
          weight: bond.score,
          metadata: { source: "dream_cycle_user_action" },
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save bond");
      }
      setResult((current) =>
        current
          ? {
              ...current,
              bonds: current.bonds.map((entry) => (bondKey(entry) === key ? { ...entry, persisted: true } : entry)),
            }
          : current,
      );
      toast.success("Bond saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save bond";
      toast.error(message);
    } finally {
      setSavingKeys((current) => current.filter((entry) => entry !== key));
    }
  }

  async function saveAllBonds() {
    if (!result) {
      return;
    }
    const pending = result.bonds.filter((bond) => !bond.persisted && bond.score >= 0.85 && !dismissedKeys.includes(bondKey(bond)));
    await Promise.all(pending.map(async (bond) => saveBond(bond)));
  }

  async function onConsolidate() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/dream-cycle/consolidate", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Consolidation failed");
      }
      setResult(payload.result);
      setDismissedKeys([]);
      toast.success("Dream cycle complete");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Consolidation failed";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const visibleBonds = result?.bonds.filter((bond) => !dismissedKeys.includes(bondKey(bond))) ?? [];

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-zinc-100">
            <MoonStar className="h-4 w-4 text-cyan-300" />
            Dream Cycle
          </CardTitle>
          <p className="mt-1 text-xs text-zinc-400">Find bonds, promote durable knowledge, inspect decay.</p>
        </div>
        <div className="flex items-center gap-2">
          {result ? (
            <Button
              onClick={() => void saveAllBonds()}
              disabled={savingKeys.length > 0 || visibleBonds.every((bond) => bond.persisted || bond.score < 0.85)}
              variant="outline"
              className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
            >
              Save All Bonds
            </Button>
          ) : null}
          <Button onClick={() => void onConsolidate()} disabled={loading} className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Consolidate
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-rose-300">{error}</p>}

        {!result ? (
          <p className="text-sm text-zinc-400">Run consolidation to generate suggestions from your memory graph.</p>
        ) : (
          <>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Bond Suggestions</p>
              {visibleBonds.length === 0 ? (
                <p className="text-sm text-zinc-400">No strong similarity bonds found.</p>
              ) : (
                <div className="space-y-2">
                  {visibleBonds.map((bond) => {
                    const key = bondKey(bond);
                    const isSaving = savingKeys.includes(key);
                    return (
                    <div key={key} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm">
                      <p className="text-zinc-100">
                        <GitBranch className="mr-2 inline h-3.5 w-3.5 text-cyan-300" />
                        <Link className="hover:text-cyan-300" href={`/dashboard/memory/${bond.leftId}`}>
                          {bond.leftTitle}
                        </Link>{" "}
                        ↔{" "}
                        <Link className="hover:text-cyan-300" href={`/dashboard/memory/${bond.rightId}`}>
                          {bond.rightTitle}
                        </Link>
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">Similarity {(bond.score * 100).toFixed(1)}%</p>
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          size="xs"
                          onClick={() => void saveBond(bond)}
                          disabled={bond.persisted || isSaving}
                          className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300"
                        >
                          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          {bond.persisted ? "Saved Bond" : "Save Bond"}
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => setDismissedKeys((current) => [...current, key])}
                          className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                        >
                          <X className="h-3 w-3" />
                          Dismiss
                        </Button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Promotion Suggestions</p>
              {result.promotions.length === 0 ? (
                <p className="text-sm text-zinc-400">No episodic memories currently meet promotion criteria.</p>
              ) : (
                <div className="space-y-2">
                  {result.promotions.map((promotion) => (
                    <div key={promotion.memoryId} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm">
                      <Link className="font-medium text-zinc-100 hover:text-cyan-300" href={`/dashboard/memory/${promotion.memoryId}`}>
                        {promotion.title}
                      </Link>
                      <p className="mt-1 text-xs text-zinc-400">
                        {promotion.from} → {promotion.to}: {promotion.reason}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Decay Visualization</p>
              <div className="space-y-2">
                {result.decay.map((point) => (
                  <div key={point.day} className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                    <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
                      <span>Day {point.day}-{point.day + 2}</span>
                      <span>{point.retained}% retention • {point.count} memories</span>
                    </div>
                    <div className="h-2 rounded bg-zinc-800">
                      <div className="h-2 rounded bg-cyan-400" style={{ width: `${Math.min(100, Math.max(0, point.retained))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
