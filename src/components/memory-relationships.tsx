"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Link2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AddRelationshipModal } from "@/components/add-relationship-modal";
import { RelationshipBadge } from "@/components/relationship-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MemoryEdgeRecord, MemoryListItem } from "@/lib/types";

type RelationshipsPayload = {
  incoming: MemoryEdgeRecord[];
  outgoing: MemoryEdgeRecord[];
  relatedMemories: MemoryListItem[];
};

export function MemoryRelationships({ memoryId }: { memoryId: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RelationshipsPayload | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/memories/${memoryId}/edges`);
      const payload = (await response.json()) as RelationshipsPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load relationships");
      }
      setData(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load relationships";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [memoryId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function removeEdge(edgeId: string) {
    try {
      const response = await fetch(`/api/memories/edges/${edgeId}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete relationship");
      }
      toast.success("Relationship removed");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete relationship";
      toast.error(message);
    }
  }

  const relatedById = new Map((data?.relatedMemories || []).map((memory) => [memory.id, memory]));

  return (
    <Card className="border-zinc-800 bg-zinc-900/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CardTitle className="text-zinc-100">Relationships</CardTitle>
        <AddRelationshipModal memoryId={memoryId} onAdded={() => void load()} />
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading relationships...
          </div>
        ) : (
          <>
            <section className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Incoming</p>
              {(data?.incoming.length || 0) === 0 ? (
                <p className="text-sm text-zinc-400">No incoming relationships.</p>
              ) : (
                <div className="space-y-2">
                  {data?.incoming.map((edge) => {
                    const memory = relatedById.get(edge.sourceId);
                    return (
                      <div key={edge.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Link2 className="h-3.5 w-3.5 text-cyan-300" />
                            {memory ? (
                              <Link href={`/dashboard/memory/${memory.id}`} className="text-sm text-zinc-100 hover:text-cyan-300">
                                {memory.title}
                              </Link>
                            ) : (
                              <p className="text-sm text-zinc-100">Unknown memory</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <RelationshipBadge type={edge.relationshipType} />
                            <span className="text-xs text-zinc-500">Weight {edge.weight.toFixed(2)}</span>
                          </div>
                        </div>
                        <Button size="icon-xs" variant="ghost" onClick={() => void removeEdge(edge.id)} className="text-zinc-400 hover:text-rose-300">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Outgoing</p>
              {(data?.outgoing.length || 0) === 0 ? (
                <p className="text-sm text-zinc-400">No outgoing relationships.</p>
              ) : (
                <div className="space-y-2">
                  {data?.outgoing.map((edge) => {
                    const memory = relatedById.get(edge.targetId);
                    return (
                      <div key={edge.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Link2 className="h-3.5 w-3.5 text-cyan-300" />
                            {memory ? (
                              <Link href={`/dashboard/memory/${memory.id}`} className="text-sm text-zinc-100 hover:text-cyan-300">
                                {memory.title}
                              </Link>
                            ) : (
                              <p className="text-sm text-zinc-100">Unknown memory</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <RelationshipBadge type={edge.relationshipType} />
                            <span className="text-xs text-zinc-500">Weight {edge.weight.toFixed(2)}</span>
                          </div>
                        </div>
                        <Button size="icon-xs" variant="ghost" onClick={() => void removeEdge(edge.id)} className="text-zinc-400 hover:text-rose-300">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
