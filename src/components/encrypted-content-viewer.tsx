"use client";

import { useEffect, useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { useVault } from "@/components/vault-provider";
import { decryptClientSide } from "@/lib/client-crypto";

type EncryptedContentViewerProps = {
  ciphertext: string;
  iv: string;
};

export function EncryptedContentViewer({ ciphertext, iv }: EncryptedContentViewerProps) {
  const { key, unlocked } = useVault();
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!key) {
        setPlaintext(null);
        return;
      }

      try {
        const next = await decryptClientSide(ciphertext, iv, key);
        if (!active) {
          return;
        }
        setPlaintext(next);
        setError(null);
      } catch {
        if (!active) {
          return;
        }
        setPlaintext(null);
        setError("Unable to decrypt with the current vault key.");
      }
    })();

    return () => {
      active = false;
    };
  }, [ciphertext, iv, key]);

  if (!unlocked) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">
        <Lock className="mr-2 inline h-4 w-4" />
        Locked. Unlock your vault to view this content.
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-rose-300">{error}</p>;
  }

  if (!plaintext) {
    return <p className="text-sm text-zinc-400">Decrypting...</p>;
  }

  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">
        <Unlock className="mr-1 inline h-3 w-3" />
        Decrypted In Browser
      </p>
      <pre className="max-h-[460px] overflow-auto whitespace-pre-wrap rounded-md border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-200">
        {plaintext}
      </pre>
    </div>
  );
}
