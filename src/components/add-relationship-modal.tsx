"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MemoryListItem, MemoryRelationshipType } from "@/lib/types";

const RELATIONSHIP_TYPES: MemoryRelationshipType[] = [
  "similar",
  "updates",
  "contradicts",
  "extends",
  "derives_from",
  "references",
];

type DirectionMode = "outgoing" | "incoming";

export function AddRelationshipModal({
  memoryId,
  onAdded,
}: {
  memoryId: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [memories, setMemories] = useState<MemoryListItem[]>([]);
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState("");
  const [relationshipType, setRelationshipType] = useState<MemoryRelationshipType>("references");
  const [direction, setDirection] = useState<DirectionMode>("outgoing");

  useEffect(() => {
    if (!open || memories.length > 0) {
      return;
    }

    async function loadMemories() {
      try {
        setLoadingMemories(true);
        const response = await fetch("/api/memories");
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load memories");
        }
        const items = ((payload.memories as MemoryListItem[]) || []).filter((memory) => memory.id !== memoryId);
        setMemories(items);
        if (items.length > 0) {
          setTargetId(items[0].id);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load memories";
        toast.error(message);
      } finally {
        setLoadingMemories(false);
      }
    }

    void loadMemories();
  }, [open, memories.length, memoryId]);

  const filtered = memories.filter((memory) => memory.title.toLowerCase().includes(query.trim().toLowerCase()));

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!targetId) {
      return;
    }

    const sourceId = direction === "outgoing" ? memoryId : targetId;
    const resolvedTargetId = direction === "outgoing" ? targetId : memoryId;

    try {
      setSubmitting(true);
      const response = await fetch("/api/memories/edges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceId,
          targetId: resolvedTargetId,
          relationshipType,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to add relationship");
      }
      toast.success("Relationship added");
      onAdded();
      setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add relationship";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((current) => !current)}
        className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
      >
        <Plus className="h-4 w-4" />
        Add Relationship
      </Button>

      {open ? (
        <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter memories by title"
            className="border-zinc-700 bg-zinc-900 text-zinc-100"
          />

          <label className="block text-xs text-zinc-400">
            Direction
            <select
              value={direction}
              onChange={(event) => setDirection(event.target.value as DirectionMode)}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="outgoing">This memory points to selected memory</option>
              <option value="incoming">Selected memory points to this memory</option>
            </select>
          </label>

          <label className="block text-xs text-zinc-400">
            Relationship type
            <select
              value={relationshipType}
              onChange={(event) => setRelationshipType(event.target.value as MemoryRelationshipType)}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              {RELATIONSHIP_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-zinc-400">
            Memory
            <select
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              disabled={loadingMemories || filtered.length === 0}
            >
              {filtered.map((memory) => (
                <option key={memory.id} value={memory.id}>
                  {memory.title}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={submitting || loadingMemories || !targetId} className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Relationship
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-100">
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
