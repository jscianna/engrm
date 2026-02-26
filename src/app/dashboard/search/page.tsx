"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { MemoryCard } from "@/components/memory-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { MemorySearchResult } from "@/lib/types";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemorySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) {
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/memories/search?q=${encodeURIComponent(query)}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Search failed");
      }
      const nextResults = payload.results || [];
      setResults(nextResults);
      toast.success(`Found ${nextResults.length} related memory${nextResults.length === 1 ? "" : "ies"}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search failed";
      setError(message);
      setResults([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader>
          <CardTitle className="text-zinc-100">Semantic Search</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSearch} className="flex flex-col gap-3 md:flex-row">
            <Input
              required
              placeholder="Find memories by meaning..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="border-zinc-700 bg-zinc-900 text-zinc-100"
            />
            <Button type="submit" disabled={loading} className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Search
            </Button>
          </form>
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
        </CardContent>
      </Card>

      {results.length > 0 ? (
        <section className="memory-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results.map((result) => (
            <div key={result.memory.id} className="space-y-2">
              <p className="text-xs text-cyan-300">Similarity: {(result.score * 100).toFixed(2)}%</p>
              <MemoryCard memory={result.memory} />
            </div>
          ))}
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-10 text-center text-sm text-zinc-400">
          {loading ? "Searching your memory vault..." : "No results yet. Try a natural-language query."}
        </div>
      )}
    </div>
  );
}
