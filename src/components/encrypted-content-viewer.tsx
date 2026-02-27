"use client";

import { useEffect, useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { useVault } from "@/components/vault-provider";
import { decryptClientSide } from "@/lib/client-crypto";

type EncryptedContentViewerProps = {
  ciphertext: string;
  iv: string | null;
};

// Parse legacy format: {"ciphertext": "...", "iv": "..."} or {"ciphertext": "..."}
function parseLegacyFormat(content: string): { ciphertext: string; iv: string } | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (typeof parsed.ciphertext === "string") {
      return {
        ciphertext: parsed.ciphertext,
        iv: typeof parsed.iv === "string" ? parsed.iv : "",
      };
    }
  } catch {
    // Not JSON, use as-is
  }
  return null;
}

export function EncryptedContentViewer({ ciphertext, iv }: EncryptedContentViewerProps) {
  // Handle legacy format where ciphertext contains JSON
  const legacy = !iv ? parseLegacyFormat(ciphertext) : null;
  const actualCiphertext = legacy?.ciphertext ?? ciphertext;
  const actualIv = legacy?.iv ?? iv ?? "";
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
        const next = await decryptClientSide(actualCiphertext, actualIv, key);
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
  }, [actualCiphertext, actualIv, key]);

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
