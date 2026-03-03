"use client";

import { useEffect, useState } from "react";
import { Calendar, ChevronDown, Filter, Loader2, Search, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { MemoryCard } from "@/components/memory-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { MemoryListItem, MemorySearchResult } from "@/lib/types";

const MEMORY_TYPES = [
  { value: "", label: "All Types" },
  { value: "identity", label: "Identity" },
  { value: "preference", label: "Preference" },
  { value: "fact", label: "Fact" },
  { value: "event", label: "Event" },
  { value: "how_to", label: "How-To" },
  { value: "constraint", label: "Constraint" },
  { value: "relationship", label: "Relationship" },
];

const DATE_RANGES = [
  { value: "", label: "Any Time" },
  { value: "1d", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "365d", label: "Last year" },
];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemorySearchResult[]>([]);
  const [recentMemories, setRecentMemories] = useState<MemoryListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  
  // Advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [dateRange, setDateRange] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [minImportance, setMinImportance] = useState(0);

  // Load recent memories on mount
  useEffect(() => {
    async function loadRecent() {
      try {
        const response = await fetch("/api/memories?limit=12");
        const data = await response.json();
        if (response.ok && data.memories) {
          setRecentMemories(data.memories);
        }
      } catch {
        // Silently fail - this is just for initial display
      } finally {
        setInitialLoading(false);
      }
    }
    void loadRecent();
  }, []);

  async function onSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) {
      return;
    }
    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      // Build query params with filters
      const params = new URLSearchParams({ q: query });
      if (typeFilter) params.set("type", typeFilter);
      if (dateRange) params.set("since", dateRange);
      if (tagFilter) params.set("tag", tagFilter);
      if (minImportance > 0) params.set("minImportance", String(minImportance));
      
      const response = await fetch(`/api/memories/search?${params}`);
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
  
  function clearFilters() {
    setTypeFilter("");
    setDateRange("");
    setTagFilter("");
    setMinImportance(0);
  }
  
  const hasFilters = typeFilter || dateRange || tagFilter || minImportance > 0;

  return (
    <div className="space-y-6">
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader>
          <CardTitle className="text-zinc-100">Semantic Search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={onSearch} className="flex flex-col gap-3 sm:flex-row">
            <Input
              required
              placeholder="Find memories by meaning..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="flex-1 border-zinc-700 bg-zinc-900 text-zinc-100"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className={`border-zinc-700 ${hasFilters ? "border-cyan-500 text-cyan-400" : ""}`}
              >
                <Filter className="mr-2 h-4 w-4" />
                Filters
                {hasFilters && <span className="ml-1 rounded-full bg-cyan-500 px-1.5 text-xs text-black">!</span>}
              </Button>
              <Button type="submit" disabled={loading} className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Search
              </Button>
            </div>
          </form>
          
          {/* Advanced Filters Panel */}
          {showFilters && (
            <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-300">Advanced Filters</span>
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-zinc-400 hover:text-zinc-200">
                    <X className="mr-1 h-3 w-3" /> Clear all
                  </Button>
                )}
              </div>
              
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Type Filter */}
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 flex items-center gap-1">
                    <ChevronDown className="h-3 w-3" /> Memory Type
                  </label>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  >
                    {MEMORY_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                
                {/* Date Range */}
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Date Range
                  </label>
                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  >
                    {DATE_RANGES.map((range) => (
                      <option key={range.value} value={range.value}>{range.label}</option>
                    ))}
                  </select>
                </div>
                
                {/* Tag Filter */}
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Tag
                  </label>
                  <Input
                    placeholder="Filter by tag..."
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    className="border-zinc-700 bg-zinc-900 text-zinc-100"
                  />
                </div>
                
                {/* Importance Filter */}
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">
                    Min Importance: {minImportance}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={minImportance}
                    onChange={(e) => setMinImportance(Number(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                </div>
              </div>
            </div>
          )}
          
          {error && <p className="text-sm text-rose-300">{error}</p>}
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
      ) : hasSearched ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-10 text-center text-sm text-zinc-400">
          {loading ? "Searching your memories..." : "No matching memories found. Try a different query."}
        </div>
      ) : initialLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : recentMemories.length > 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">Recent memories — search above to find by meaning</p>
          <section className="memory-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recentMemories.map((memory) => (
              <MemoryCard key={memory.id} memory={memory} />
            ))}
          </section>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-10 text-center text-sm text-zinc-400">
          No memories yet. Add some to get started!
        </div>
      )}
    </div>
  );
}
