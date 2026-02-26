"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { Download, Loader2, ShieldAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type KeyStatusPayload = {
  hasKey: boolean;
};

type ExportPayload = {
  hasKey: boolean;
  key: string;
  filename: string;
  warning: string;
};

export function SecurityKeyCard() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function refreshStatus(showToast = false) {
    try {
      const response = await fetch("/api/settings/encryption-key?status=true", {
        cache: "no-store",
      });
      const payload = (await response.json()) as KeyStatusPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load encryption key status");
      }
      setHasKey(payload.hasKey);
      if (showToast) {
        toast.success("Encryption key status refreshed");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load encryption key status";
      toast.error(message);
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function onExportKey() {
    try {
      setBusy(true);
      const response = await fetch("/api/settings/encryption-key", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as (ExportPayload & { error?: string });
      if (!response.ok) {
        throw new Error(payload.error || "Failed to export recovery key");
      }

      const blob = new Blob([`${payload.key}\n`], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = payload.filename || "memry-recovery-key.txt";
      link.click();
      URL.revokeObjectURL(url);

      toast.warning(payload.warning);
      toast.success("Recovery key exported");
      await refreshStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to export recovery key";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function onImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setBusy(true);
      const key = (await file.text()).trim();
      const response = await fetch("/api/settings/encryption-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to import recovery key");
      }

      toast.success(payload.message || "Recovery key imported");
      await refreshStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import recovery key";
      toast.error(message);
    } finally {
      event.target.value = "";
      setBusy(false);
    }
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader>
        <CardTitle className="text-zinc-100">Security</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-zinc-300">
        <p>
          Key status:{" "}
          <span className="text-zinc-100">{hasKey === null ? "Loading..." : hasKey ? "Generated" : "Not generated"}</span>
        </p>
        <p className="rounded-xl border border-amber-800/60 bg-amber-950/40 p-3 text-amber-200">
          Keep your recovery key safe. If you lose it, encrypted Arweave memories cannot be decrypted.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void onExportKey()} disabled={busy} className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export Recovery Key
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            Import Recovery Key
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            className="text-zinc-400 hover:text-zinc-100"
            onClick={() => void refreshStatus(true)}
          >
            <ShieldAlert className="mr-2 h-4 w-4" />
            Refresh Status
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={(event) => void onImportFile(event)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
