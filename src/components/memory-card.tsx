import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MemoryListItem } from "@/lib/types";

export function MemoryCard({ memory }: { memory: MemoryListItem }) {
  return (
    <Link href={`/dashboard/memory/${memory.id}`}>
      <Card className="h-full border-zinc-800 bg-zinc-900/70 transition hover:border-cyan-400/40 hover:bg-zinc-900">
        <CardHeader className="pb-3">
          <CardTitle className="line-clamp-2 text-base text-zinc-100">{memory.title}</CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <Badge variant="outline" className="border-zinc-700 text-zinc-300">
              {memory.sourceType}
            </Badge>
            <span>{new Date(memory.createdAt).toLocaleString()}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-zinc-400">
          {memory.arweaveTxId ? (
            <div className="flex items-center gap-2 text-cyan-300">
              <ExternalLink className="h-3.5 w-3.5" />
              TX: {memory.arweaveTxId.slice(0, 16)}...
            </div>
          ) : (
            <div className="text-amber-300">Arweave upload pending (set `ARWEAVE_JWK`)</div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
