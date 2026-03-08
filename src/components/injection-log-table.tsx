"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { MemoryAnalyticsDashboard } from "@/lib/memory-analytics";
import { Button } from "@/components/ui/button";

type InjectionEvent = MemoryAnalyticsDashboard["injectionLog"]["events"][number];
type SortField = "createdAt" | "resultCount" | "memoryCount" | "conversationId";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 10;

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function InjectionLogTable({
  events,
}: {
  events: InjectionEvent[];
}) {
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const sortedEvents = useMemo(() => {
    const copy = [...events];
    copy.sort((left, right) => {
      let comparison = 0;

      switch (sortField) {
        case "createdAt":
          comparison = left.createdAt.localeCompare(right.createdAt);
          break;
        case "resultCount":
          comparison = left.resultCount - right.resultCount;
          break;
        case "memoryCount":
          comparison = left.memoryIds.length - right.memoryIds.length;
          break;
        case "conversationId":
          comparison = (left.conversationId ?? "").localeCompare(right.conversationId ?? "");
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return copy;
  }, [events, sortDirection, sortField]);

  const totalPages = Math.max(1, Math.ceil(sortedEvents.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedEvents = sortedEvents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function toggleSort(field: SortField) {
    setPage(1);
    if (field === sortField) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortDirection(field === "conversationId" ? "asc" : "desc");
  }

  function renderSortIcon(field: SortField) {
    if (field !== sortField) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-zinc-500" />;
    }

    return sortDirection === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-cyan-300" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-cyan-300" />
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-6 text-sm text-zinc-400">
        No injection events recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-800 text-sm">
          <thead className="bg-zinc-900/90">
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3">
                <button className="flex items-center gap-1.5" onClick={() => toggleSort("createdAt")} type="button">
                  Timestamp
                  {renderSortIcon("createdAt")}
                </button>
              </th>
              <th className="px-4 py-3">
                <button className="flex items-center gap-1.5" onClick={() => toggleSort("resultCount")} type="button">
                  Results Returned
                  {renderSortIcon("resultCount")}
                </button>
              </th>
              <th className="px-4 py-3">
                <button className="flex items-center gap-1.5" onClick={() => toggleSort("memoryCount")} type="button">
                  Memories Returned
                  {renderSortIcon("memoryCount")}
                </button>
              </th>
              <th className="px-4 py-3">
                <button className="flex items-center gap-1.5" onClick={() => toggleSort("conversationId")} type="button">
                  Conversation ID
                  {renderSortIcon("conversationId")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950/60 text-zinc-200">
            {pagedEvents.map((event) => (
              <tr key={event.id} className="align-top">
                <td className="px-4 py-3 whitespace-nowrap text-zinc-400">{formatTimestamp(event.createdAt)}</td>
                <td className="px-4 py-3 text-zinc-300">{event.resultCount}</td>
                <td className="px-4 py-3 text-zinc-300">{event.memoryIds.length}</td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                  {event.conversationId ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-zinc-400">
        <span>
          Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, events.length)} of {events.length}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
            disabled={currentPage === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Previous
          </Button>
          <span className="text-xs uppercase tracking-wide text-zinc-500">
            Page {currentPage} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
            disabled={currentPage === totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
