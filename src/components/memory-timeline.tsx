"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Clock, Lock, Shield, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getMemoryTypeLabel, getMemoryTypeColor } from "@/lib/memory-labels";
import type { MemoryImportanceTier, MemoryKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export type TimelineMemory = {
  id: string;
  title: string;
  text: string;
  memoryType: MemoryKind;
  importanceTier: MemoryImportanceTier;
  accessCount: number;
  feedbackScore: number;
  lastAccessedAt: string | null;
  promotionLocked: boolean;
  decayImmune: boolean;
  lockedTier: MemoryImportanceTier | null;
  sensitive: boolean;
  createdAt: string;
};

type MemoryTimelineProps = {
  memories: TimelineMemory[];
};

const TIER_COLORS: Record<MemoryImportanceTier, string> = {
  critical: "border-l-red-500 bg-red-950/20",
  working: "border-l-orange-500 bg-orange-950/20",
  high: "border-l-yellow-500 bg-yellow-950/20",
  normal: "border-l-zinc-600 bg-zinc-900/40",
};

const TIER_BADGE_COLORS: Record<MemoryImportanceTier, string> = {
  critical: "bg-red-900/50 text-red-200 border-red-700",
  working: "bg-orange-900/50 text-orange-200 border-orange-700",
  high: "bg-yellow-900/50 text-yellow-200 border-yellow-700",
  normal: "bg-zinc-800/50 text-zinc-300 border-zinc-700",
};

function TimelineCard({ memory }: { memory: TimelineMemory }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card 
      className={cn(
        "border-zinc-800 border-l-4 transition-all duration-200 hover:border-zinc-700",
        TIER_COLORS[memory.importanceTier]
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Badge 
                variant="outline" 
                className={cn("text-xs", TIER_BADGE_COLORS[memory.importanceTier])}
              >
                {memory.importanceTier}
              </Badge>
              <Badge 
                variant="outline" 
                className="text-xs border-current"
                style={{ 
                  color: getMemoryTypeColor(memory.memoryType),
                  borderColor: `${getMemoryTypeColor(memory.memoryType)}70`
                }}
              >
                {getMemoryTypeLabel(memory.memoryType)}
              </Badge>
              {memory.lockedTier && (
                <Badge variant="outline" className="text-xs bg-purple-900/30 text-purple-200 border-purple-700">
                  <Lock className="h-3 w-3 mr-1" />
                  Locked
                </Badge>
              )}
              {memory.decayImmune && (
                <Badge variant="outline" className="text-xs bg-blue-900/30 text-blue-200 border-blue-700">
                  <Shield className="h-3 w-3 mr-1" />
                  Immune
                </Badge>
              )}
              {memory.sensitive && (
                <Badge variant="outline" className="text-xs bg-rose-900/30 text-rose-200 border-rose-700">
                  <Lock className="h-3 w-3 mr-1" />
                  Sensitive
                </Badge>
              )}
            </div>
            
            <h3 className="text-sm font-medium text-zinc-100 mb-1 line-clamp-1">
              {memory.title}
            </h3>
            
            <p className={cn(
              "text-xs text-zinc-400",
              expanded ? "" : "line-clamp-2"
            )}>
              {memory.text}
            </p>
            
            {memory.text.length > 150 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
                className="h-6 px-2 mt-1 text-xs text-cyan-400 hover:text-cyan-300"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-3 w-3 mr-1" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3 mr-1" />
                    Show more
                  </>
                )}
              </Button>
            )}
          </div>
          
          <div className="flex flex-col items-end gap-1 text-xs text-zinc-500 shrink-0">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(memory.createdAt).toLocaleDateString()}
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-0.5">
                <Sparkles className="h-3 w-3" />
                {memory.accessCount}
              </span>
              {memory.feedbackScore !== 0 && (
                <span className={cn(
                  "flex items-center gap-0.5",
                  memory.feedbackScore > 0 ? "text-green-400" : "text-red-400"
                )}>
                  {memory.feedbackScore > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {memory.feedbackScore > 0 ? `+${memory.feedbackScore}` : memory.feedbackScore}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function MemoryTimeline({ memories }: MemoryTimelineProps) {
  if (memories.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        No memories found matching your filters.
      </div>
    );
  }

  // Group memories by date
  const grouped = memories.reduce((acc, memory) => {
    const date = new Date(memory.createdAt).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(memory);
    return acc;
  }, {} as Record<string, TimelineMemory[]>);

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([date, dateMemories]) => (
        <div key={date} className="space-y-3">
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider sticky top-0 bg-zinc-950 py-2 z-10">
            {date}
          </h2>
          <div className="space-y-2">
            {dateMemories.map((memory) => (
              <TimelineCard key={memory.id} memory={memory} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
