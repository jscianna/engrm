"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type VaultPasswordModalProps = {
  mode: "setup" | "unlock";
  loading: boolean;
  onSubmit: (password: string) => Promise<void>;
};

function strengthLabel(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return { score, label: "Weak" };
  if (score <= 3) return { score, label: "Medium" };
  return { score, label: "Strong" };
}

export function VaultPasswordModal({ mode, loading, onSubmit }: VaultPasswordModalProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const strength = useMemo(() => strengthLabel(password), [password]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!password) {
      setError("Password is required.");
      return;
    }

    if (mode === "setup" && password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }

    if (mode === "setup" && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    await onSubmit(password);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-zinc-100 shadow-2xl">
        <div className="mb-4 flex items-center gap-2 text-sm text-cyan-300">
          {mode === "setup" ? <ShieldCheck className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          {mode === "setup" ? "Set Vault Password" : "Unlock Vault"}
        </div>

        <p className="mb-4 text-sm text-zinc-300">
          {mode === "setup"
            ? "Create a vault password. MEMRY cannot recover this password or your derived key."
            : "Enter your vault password to derive your in-memory key for this session."}
        </p>

        <form className="space-y-3" onSubmit={submit}>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Vault password"
            autoFocus
            className="border-zinc-700 bg-zinc-900 text-zinc-100"
          />

          {mode === "setup" ? (
            <>
              <Input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="Confirm vault password"
                className="border-zinc-700 bg-zinc-900 text-zinc-100"
              />
              <div className="space-y-1">
                <div className="h-2 overflow-hidden rounded bg-zinc-800">
                  <div className="h-full bg-cyan-300 transition-all" style={{ width: `${Math.max(10, strength.score * 20)}%` }} />
                </div>
                <p className="text-xs text-zinc-400">Strength: {strength.label}</p>
              </div>
            </>
          ) : null}

          <p className="rounded-lg border border-amber-800/50 bg-amber-950/40 p-2 text-xs text-amber-200">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            Forgetting your vault password means permanent data loss for encrypted content.
          </p>

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}

          <Button type="submit" disabled={loading} className="w-full bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {mode === "setup" ? "Create Vault" : "Unlock Vault"}
          </Button>
        </form>
      </div>
    </div>
  );
}
