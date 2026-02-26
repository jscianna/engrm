"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return toHex(new Uint8Array(digest));
}

export function ArweaveVerifyButton({
  memoryId,
  txId,
}: {
  memoryId: string;
  txId: string;
}) {
  const [verifying, setVerifying] = useState(false);

  async function verify() {
    try {
      setVerifying(true);
      const response = await fetch(`/api/memories/${memoryId}/arweave`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        error?: string;
        local?: { contentHash: string };
        arweave?: { content: string; verified: boolean };
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to verify Arweave memory");
      }

      const remoteContent = payload.arweave?.content ?? "";
      const localHash = payload.local?.contentHash ?? "";
      const remoteHash = await sha256Hex(remoteContent);
      const hashMatches = Boolean(localHash && remoteHash && localHash === remoteHash);

      if (hashMatches && payload.arweave?.verified) {
        toast.success("Verified: hashes match and Wayfinder hash verification passed.");
        return;
      }

      if (hashMatches) {
        toast.warning("Hash matches local memory, but Wayfinder could not confirm verification.");
        return;
      }

      toast.error("Verification failed: Arweave content hash does not match local memory.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Verification failed";
      toast.error(message);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild className="bg-emerald-400 text-zinc-950 hover:bg-emerald-300">
        <Link href={`https://arweave.net/${txId}`} target="_blank" rel="noreferrer">
          <CheckCircle2 className="mr-2 h-4 w-4" />
          View on Arweave
          <ExternalLink className="ml-2 h-4 w-4" />
        </Link>
      </Button>
      <Button
        variant="outline"
        size="xs"
        onClick={() => void verify()}
        disabled={verifying}
        className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
      >
        {verifying ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ShieldCheck className="mr-1 h-3 w-3" />}
        Verify
      </Button>
    </div>
  );
}
