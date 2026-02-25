"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { ArweaveWalletStatus } from "@/lib/types";

type StatusPayload = {
  wallet: ArweaveWalletStatus;
  uploads: {
    committed: number;
    pending: number;
  };
};

export function ArweaveWalletCard() {
  const [jwk, setJwk] = useState("");
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function fetchStatus(showToast = false) {
    try {
      setLoading(true);
      const response = await fetch("/api/arweave/status");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to fetch Arweave status");
      }
      setStatus(payload);
      if (showToast) {
        toast.success("Arweave status refreshed");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch Arweave status";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchStatus();
  }, []);

  async function onSaveWallet(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!jwk.trim()) {
      toast.error("Paste a valid JWK JSON first");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch("/api/settings/arweave-wallet", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jwk }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save wallet");
      }

      setJwk("");
      toast.success("Arweave wallet configured");
      await fetchStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save wallet";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function onClearWallet() {
    try {
      setSaving(true);
      const response = await fetch("/api/settings/arweave-wallet", { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to clear wallet");
      }
      toast.success("Custom wallet removed");
      await fetchStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clear wallet";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-zinc-100">Arweave Wallet</CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
          onClick={() => void fetchStatus(true)}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {status ? (
          <div className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">
            <p>
              Source: <span className="text-zinc-100">{status.wallet.source}</span>
            </p>
            <p>
              Address: <span className="font-mono text-zinc-100">{status.wallet.address ?? "Not configured"}</span>
            </p>
            <p>
              Balance: <span className="text-zinc-100">{status.wallet.balanceAr ?? "-"} AR</span>
            </p>
            <p>
              Upload status: <span className="text-zinc-100">{status.uploads.committed} committed</span>,{" "}
              {status.uploads.pending} pending
            </p>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Unable to load wallet status.</p>
        )}

        <form className="space-y-3" onSubmit={onSaveWallet}>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Set custom JWK (per user)</p>
          <Textarea
            rows={8}
            placeholder='{"kty":"RSA", ...}'
            value={jwk}
            onChange={(event) => setJwk(event.target.value)}
            className="border-zinc-700 bg-zinc-900 font-mono text-xs text-zinc-100"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving} className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
              Save Wallet
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
              onClick={() => void onClearWallet()}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear Custom Wallet
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
