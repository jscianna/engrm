import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMemory } from "@/lib/memories";

export default async function MemoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) {
    notFound();
  }

  const { id } = await params;
  const memory = getMemory(id);

  if (!memory || memory.userId !== userId) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <Button asChild variant="ghost" className="text-zinc-400 hover:text-zinc-100">
        <Link href="/dashboard">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Link>
      </Button>

      <Card className="border-zinc-800 bg-zinc-900/70">
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-2xl text-zinc-100">{memory.title}</CardTitle>
            <Badge variant="outline" className="border-zinc-700 text-zinc-300">
              {memory.sourceType}
            </Badge>
          </div>
          <p className="text-xs text-zinc-500">Saved {new Date(memory.createdAt).toLocaleString()}</p>
        </CardHeader>
        <CardContent className="space-y-5">
          {memory.sourceUrl && (
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Source URL</p>
              <a href={memory.sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-cyan-300 hover:text-cyan-200">
                {memory.sourceUrl}
              </a>
            </div>
          )}

          {memory.arweaveTxId ? (
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Arweave Proof</p>
              <a
                href={`https://arweave.net/${memory.arweaveTxId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-cyan-300 hover:text-cyan-200"
              >
                <ExternalLink className="h-4 w-4" />
                {memory.arweaveTxId}
              </a>
            </div>
          ) : (
            <p className="text-sm text-amber-300">
              No Arweave TX ID found. Configure `ARWEAVE_JWK` and save new memories to anchor permanently.
            </p>
          )}

          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Content Hash (SHA-256)</p>
            <code className="block rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
              {memory.contentHash}
            </code>
          </div>

          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Memory Content</p>
            <pre className="max-h-[460px] overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-200 whitespace-pre-wrap">
              {memory.contentText}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
