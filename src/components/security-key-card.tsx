"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { Download, Loader2, Lock, ShieldAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { useVault } from "@/components/vault-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SecurityKeyCard() {
  const { unlocked, hasVault, exportRecoveryKey, importRecoveryKey, lockVault } = useVault();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function onExportKey() {
    try {
      setBusy(true);
      const exported = await exportRecoveryKey();
      const blob = new Blob([`${exported}\n`], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "memry-recovery-key.txt";
      link.click();
      URL.revokeObjectURL(url);

      toast.warning("Store this recovery key securely. Losing it means encrypted memories may be unrecoverable.");
      toast.success("Recovery key exported");
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
      await importRecoveryKey(key);
      toast.success("Recovery key imported for this session");
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
          Vault status: <span className="text-zinc-100">{hasVault ? (unlocked ? "Unlocked" : "Locked") : "Not setup"}</span>
        </p>
        <p className="rounded-xl border border-amber-800/60 bg-amber-950/40 p-3 text-amber-200">
          Keep your recovery key safe. The server cannot recover your password or key.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void onExportKey()}
            disabled={busy || !unlocked}
            className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300"
          >
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
            disabled={busy || !unlocked}
            className="text-zinc-400 hover:text-zinc-100"
            onClick={lockVault}
          >
            <ShieldAlert className="mr-2 h-4 w-4" />
            Lock Vault
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={(event) => void onImportFile(event)}
          />
        </div>
        {!unlocked ? (
          <p className="text-xs text-zinc-400">
            <Lock className="mr-1 inline h-3 w-3" />
            Unlock your vault to decrypt and export the current session key.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
