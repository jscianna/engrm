import Link from "next/link";
import { ExternalLink, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MemoryListItem } from "@/lib/types";

export function MemoryCard({ memory }: { memory: MemoryListItem }) {
  return (
    <Link href={`/dashboard/memory/${memory.id}`}>
      <Card className="group relative h-full overflow-hidden border-zinc-800 bg-zinc-900/70 transition duration-300 hover:-translate-y-0.5 hover:border-cyan-400/40 hover:bg-zinc-900 hover:shadow-[0_18px_45px_rgba(34,211,238,0.12)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent opacity-0 transition group-hover:opacity-100" />
        <CardHeader className="pb-3">
          <CardTitle className="line-clamp-2 text-base text-zinc-100">{memory.title}</CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <Badge variant="outline" className="border-zinc-700 text-zinc-300">
              {memory.sourceType}
            </Badge>
            <Badge variant="outline" className="border-cyan-800/70 text-cyan-200">
              {memory.memoryType}
            </Badge>
            <Badge variant="outline" className="border-zinc-700 text-zinc-300">
              Importance {memory.importance}/10
            </Badge>
            {Number(memory.relationshipCount ?? 0) > 0 ? (
              <Badge variant="outline" className="border-cyan-800/70 text-cyan-200">
                <Link2 className="h-3 w-3" />
                {memory.relationshipCount} links
              </Badge>
            ) : null}
            {Number(memory.supersededByCount ?? 0) > 0 ? (
              <Badge variant="outline" className="border-amber-700/70 text-amber-200">
                Superseded
              </Badge>
            ) : null}
            <span>{new Date(memory.createdAt).toLocaleString()}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-zinc-400">
          {memory.arweaveTxId ? (
            <div className="flex items-center gap-2 text-cyan-300">
              <ExternalLink className="h-3.5 w-3.5" />
              TX: {memory.arweaveTxId.slice(0, 16)}...
            </div>
          ) : memory.syncStatus === "failed" ? (
            <div className="text-rose-300">Arweave sync failed: {memory.syncError ?? "Unknown error"}</div>
          ) : memory.syncStatus === "pending" ? (
            <div className="text-amber-300">Not committed to Arweave yet</div>
          ) : (
            <div className="text-zinc-400">Stored locally</div>
          )}
          {memory.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {memory.tags.slice(0, 4).map((tag) => (
                <Badge key={tag} variant="secondary" className="bg-zinc-800 text-zinc-200">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}
          <div>{memory.isEncrypted ? "Encrypted (vault-protected)" : "Unencrypted (legacy)"}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
