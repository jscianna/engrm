import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CommitMemoryButton } from "@/components/commit-memory-button";
import { ArweaveVerifyButton } from "@/components/arweave-verify-button";
import { EncryptedContentViewer } from "@/components/encrypted-content-viewer";
import { MemoryRelationships } from "@/components/memory-relationships";
import { getCachedMemory, getCachedRelatedMemories } from "@/lib/memories";

async function RelatedMemoriesSection({
  userId,
  memoryId,
  contentText,
}: {
  userId: string;
  memoryId: string;
  contentText: string;
}) {
  const related = await getCachedRelatedMemories(userId, memoryId, contentText, 5);

  return (
    <Card className="border-zinc-800 bg-zinc-900/70">
      <CardHeader>
        <CardTitle className="text-zinc-100">Related Memories</CardTitle>
      </CardHeader>
      <CardContent>
        {related.length === 0 ? (
          <p className="text-sm text-zinc-400">No related memories found yet.</p>
        ) : (
          <div className="space-y-3">
            {related.map((result) => (
              <Link
                key={result.memory.id}
                href={`/dashboard/memory/${result.memory.id}`}
                className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-3 transition hover:border-cyan-500/40"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-100">{result.memory.title}</p>
                  <p className="text-xs text-zinc-400">
                    {result.memory.memoryType} • Importance {result.memory.importance}/10
                  </p>
                </div>
                <p className="text-xs text-cyan-300">{(result.score * 100).toFixed(1)}%</p>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function MemoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ userId }, { id }] = await Promise.all([auth(), params]);
  if (!userId) {
    notFound();
  }

  const memory = await getCachedMemory(id);
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
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-2xl text-zinc-100">{memory.title}</CardTitle>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                  {memory.sourceType}
                </Badge>
                <Badge variant="outline" className="border-cyan-800/60 text-cyan-200">
                  {memory.memoryType}
                </Badge>
                <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                  Importance {memory.importance}/10
                </Badge>
              </div>
            </div>
            <CommitMemoryButton memoryId={memory.id} arweaveTxId={memory.arweaveTxId} syncStatus={memory.syncStatus} />
          </div>
          <p className="text-xs text-zinc-500">Saved {new Date(memory.createdAt).toLocaleString()}</p>
        </CardHeader>
        <CardContent className="space-y-5">
          {memory.tags.length > 0 ? (
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Tags</p>
              <div className="flex flex-wrap gap-2">
                {memory.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="bg-zinc-800 text-zinc-200">
                    #{tag}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {memory.sourceUrl ? (
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Source URL</p>
              <a href={memory.sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-cyan-300 hover:text-cyan-200">
                {memory.sourceUrl}
              </a>
            </div>
          ) : null}

          {memory.arweaveTxId ? (
            <div className="space-y-2">
              <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Arweave Proof</p>
              <ArweaveVerifyButton memoryId={memory.id} txId={memory.arweaveTxId} />
              <p className="text-xs text-zinc-500">{memory.arweaveTxId}</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm text-amber-300">
                Not committed yet. Use the commit button above after configuring your wallet in Settings.
              </p>
              {memory.syncStatus === "failed" ? (
                <p className="text-xs text-rose-300">Last sync error: {memory.syncError ?? "Unknown error"}</p>
              ) : null}
            </div>
          )}

          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Content Hash (SHA-256)</p>
            <code className="block rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
              {memory.contentHash}
            </code>
          </div>

          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Memory Content</p>
            {memory.isEncrypted || memory.contentText.startsWith('{"ciphertext"') ? (
              <EncryptedContentViewer ciphertext={memory.contentText} iv={memory.contentIv} />
            ) : (
              <>
                <p className="mb-2 text-xs text-amber-300">
                  Warning: this memory is stored unencrypted and is not zero-knowledge protected.
                </p>
                <pre className="max-h-[460px] overflow-auto whitespace-pre-wrap rounded-md border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-200">
                  {memory.contentText}
                </pre>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <MemoryRelationships memoryId={memory.id} />

      {!memory.isEncrypted ? (
        <Suspense fallback={<div className="h-36 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/40" />}>
          <RelatedMemoriesSection userId={userId} memoryId={memory.id} contentText={memory.contentText} />
        </Suspense>
      ) : null}
    </div>
  );
}
