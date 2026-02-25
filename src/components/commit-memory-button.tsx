"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CommitMemoryButton({ memoryId, arweaveTxId }: { memoryId: string; arweaveTxId: string | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onCommit() {
    try {
      setLoading(true);
      const response = await fetch(`/api/memories/${memoryId}/commit`, { method: "POST" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to commit memory");
      }

      toast.success("Memory committed to Arweave");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to commit memory";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  if (arweaveTxId) {
    return (
      <Button asChild className="bg-emerald-400 text-zinc-950 hover:bg-emerald-300">
        <Link href={`https://arweave.net/${arweaveTxId}`} target="_blank" rel="noreferrer">
          <CheckCircle2 className="mr-2 h-4 w-4" />
          View Arweave TX
          <ExternalLink className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    );
  }

  return (
    <Button onClick={() => void onCommit()} disabled={loading} className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
      Commit to Arweave
    </Button>
  );
}
