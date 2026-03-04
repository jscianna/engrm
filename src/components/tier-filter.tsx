"use client";

import { Button } from "@/components/ui/button";
import type { MemoryImportanceTier } from "@/lib/types";
import { cn } from "@/lib/utils";

type TierFilterProps = {
  selectedTiers: MemoryImportanceTier[];
  onToggle: (tier: MemoryImportanceTier) => void;
  onClear: () => void;
  counts?: Record<MemoryImportanceTier, number>;
};

const TIERS: MemoryImportanceTier[] = ["critical", "working", "high", "normal"];

const TIER_STYLES: Record<MemoryImportanceTier, { active: string; inactive: string }> = {
  critical: {
    active: "bg-red-900/50 text-red-200 border-red-600 hover:bg-red-900/70",
    inactive: "bg-zinc-900/50 text-zinc-400 border-zinc-700 hover:bg-zinc-800 hover:text-red-200 hover:border-red-800",
  },
  working: {
    active: "bg-orange-900/50 text-orange-200 border-orange-600 hover:bg-orange-900/70",
    inactive: "bg-zinc-900/50 text-zinc-400 border-zinc-700 hover:bg-zinc-800 hover:text-orange-200 hover:border-orange-800",
  },
  high: {
    active: "bg-yellow-900/50 text-yellow-200 border-yellow-600 hover:bg-yellow-900/70",
    inactive: "bg-zinc-900/50 text-zinc-400 border-zinc-700 hover:bg-zinc-800 hover:text-yellow-200 hover:border-yellow-800",
  },
  normal: {
    active: "bg-zinc-700/50 text-zinc-200 border-zinc-500 hover:bg-zinc-700/70",
    inactive: "bg-zinc-900/50 text-zinc-400 border-zinc-700 hover:bg-zinc-800 hover:text-zinc-200 hover:border-zinc-600",
  },
};

export function TierFilter({ selectedTiers, onToggle, onClear, counts }: TierFilterProps) {
  const allSelected = selectedTiers.length === 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-500 uppercase tracking-wide mr-1">Filter by tier:</span>
      
      <Button
        variant="outline"
        size="sm"
        onClick={onClear}
        className={cn(
          "h-7 px-3 text-xs border transition-colors",
          allSelected
            ? "bg-cyan-900/50 text-cyan-200 border-cyan-600 hover:bg-cyan-900/70"
            : "bg-zinc-900/50 text-zinc-400 border-zinc-700 hover:bg-zinc-800 hover:text-cyan-200"
        )}
      >
        All
      </Button>

      {TIERS.map((tier) => {
        const isSelected = selectedTiers.includes(tier);
        const count = counts?.[tier] ?? 0;
        const styles = TIER_STYLES[tier];
        
        return (
          <Button
            key={tier}
            variant="outline"
            size="sm"
            onClick={() => onToggle(tier)}
            className={cn(
              "h-7 px-3 text-xs border capitalize transition-colors",
              isSelected ? styles.active : styles.inactive
            )}
          >
            {tier}
            {counts && (
              <span className="ml-1.5 text-[10px] opacity-70">({count})</span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
