"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Save, Trash2, Network, Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

interface SynthesisData {
  id: string;
  title: string;
  synthesis: string;
  sourceMemoryIds: string[];
  sourceCount: number;
  clusterId: string;
  clusterTopic: string;
  compressionRatio: number | null;
  confidence: number | null;
  abstractionLevel: number;
  accessCount: number;
  stale: boolean;
  synthesizedAt: string;
  createdAt: string;
}

interface SourceMemory {
  id: string;
  title: string;
}

export default function SynthesisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [synthesis, setSynthesis] = useState<SynthesisData | null>(null);
  const [sourceMemories, setSourceMemories] = useState<SourceMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/v1/syntheses/${id}`);
        if (!res.ok) throw new Error("Failed to load synthesis");

        const data = await res.json();
        setSynthesis(data.synthesis);
        setTitle(data.synthesis.title);
        setContent(data.synthesis.synthesis);
        setSourceMemories(data.sourceMemories || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [id]);

  async function handleSave() {
    if (!synthesis) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/v1/syntheses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, synthesis: content }),
      });

      if (!res.ok) throw new Error("Failed to save");

      // Reload
      const data = await res.json();
      setSynthesis(data.synthesis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this synthesis? This cannot be undone.")) return;

    try {
      const res = await fetch(`/api/v1/syntheses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (error || !synthesis) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard" className="inline-flex items-center text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Link>
        <div className="rounded-lg border border-rose-800 bg-rose-950/50 p-4 text-rose-200">
          {error || "Synthesis not found"}
        </div>
      </div>
    );
  }

  const hasChanges = title !== synthesis.title || content !== synthesis.synthesis;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard/brain" className="inline-flex items-center text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Brain
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            className="border-rose-800 text-rose-400 hover:bg-rose-950"
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="bg-cyan-500 text-black hover:bg-cyan-400 disabled:opacity-50"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>

      {/* Badge */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-900/50 px-3 py-1 text-sm text-pink-300 border border-pink-700">
          <Sparkles className="h-3.5 w-3.5" />
          Synthesis
        </span>
        {synthesis.stale && (
          <span className="rounded-full bg-amber-900/50 px-3 py-1 text-sm text-amber-300 border border-amber-700">
            Stale
          </span>
        )}
        <span className="text-sm text-zinc-500">Level {synthesis.abstractionLevel}</span>
      </div>

      {/* Title */}
      <div>
        <label className="block text-xs text-zinc-500 mb-1">Title</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-xl font-semibold bg-zinc-900 border-zinc-700 text-zinc-100"
        />
      </div>

      {/* Content */}
      <div>
        <label className="block text-xs text-zinc-500 mb-1">Synthesized Content</label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[200px] bg-zinc-900 border-zinc-700 text-zinc-100 font-mono text-sm"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-xs text-zinc-500 mb-1">Sources</div>
          <div className="text-2xl font-mono text-cyan-400">{synthesis.sourceCount}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-xs text-zinc-500 mb-1">Compression</div>
          <div className="text-2xl font-mono text-green-400">
            {synthesis.compressionRatio ? `${Math.round(synthesis.compressionRatio * 100)}%` : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-xs text-zinc-500 mb-1">Confidence</div>
          <div className="text-2xl font-mono text-amber-400">
            {synthesis.confidence ? `${Math.round(synthesis.confidence * 100)}%` : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-xs text-zinc-500 mb-1">Accesses</div>
          <div className="text-2xl font-mono text-zinc-300">{synthesis.accessCount}</div>
        </div>
      </div>

      {/* Source Memories */}
      {sourceMemories.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Network className="h-4 w-4 text-zinc-500" />
            <span className="text-sm text-zinc-400">Source Memories</span>
          </div>
          <div className="space-y-2">
            {sourceMemories.map((mem) => (
              <Link
                key={mem.id}
                href={`/dashboard/memory/${mem.id}`}
                className="block rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 hover:border-zinc-600 transition-colors"
              >
                <span className="text-sm text-zinc-200">{mem.title}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Synthesized {new Date(synthesis.synthesizedAt).toLocaleDateString()}
        </span>
        <span>Cluster: {synthesis.clusterTopic}</span>
      </div>
    </div>
  );
}
