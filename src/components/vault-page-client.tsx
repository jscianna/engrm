"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Eye, EyeOff, KeyRound, Loader2, Plus, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const CATEGORIES = [
  { value: "", label: "All categories" },
  { value: "api_key", label: "API Key" },
  { value: "password", label: "Password" },
  { value: "token", label: "Token" },
  { value: "connection_string", label: "Connection String" },
  { value: "private_key", label: "Private Key" },
] as const;

type VaultListItem = {
  id: string;
  name: string;
  category: string;
  createdAt: string;
  updatedAt: string;
};

type VaultEntry = VaultListItem & {
  value: string;
};

export function VaultPageClient() {
  const [entries, setEntries] = useState<VaultListItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [revealedEntries, setRevealedEntries] = useState<Record<string, VaultEntry>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("api_key");
  const [value, setValue] = useState("");

  const filteredEntries = useMemo(() => {
    if (!selectedCategory) {
      return entries;
    }
    return entries.filter((entry) => entry.category === selectedCategory);
  }, [entries, selectedCategory]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/vault", { cache: "no-store" });
      const payload = (await response.json()) as { entries?: VaultListItem[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load vault entries");
      }
      setEntries(payload.entries ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load vault entries";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedValue = value.trim();
    if (!trimmedName || !trimmedValue) {
      toast.error("Name and value are required.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          category,
          value: trimmedValue,
        }),
      });

      const payload = (await response.json()) as { entry?: VaultListItem; error?: string };
      if (!response.ok || !payload.entry) {
        throw new Error(payload.error || "Failed to create vault entry");
      }

      setEntries((current) => [payload.entry!, ...current]);
      setName("");
      setValue("");
      toast.success("Vault entry added.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create vault entry";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReveal(entryId: string) {
    const alreadyRevealed = Boolean(revealedEntries[entryId]);
    if (alreadyRevealed) {
      setRevealedEntries((current) => {
        const next = { ...current };
        delete next[entryId];
        return next;
      });
      return;
    }

    const confirmed = window.confirm(
      "Reveal this secret value now? Make sure no one is looking at your screen.",
    );
    if (!confirmed) {
      return;
    }

    setRevealingId(entryId);
    try {
      const response = await fetch(`/api/vault/${entryId}`, { cache: "no-store" });
      const payload = (await response.json()) as { entry?: VaultEntry; error?: string };
      if (!response.ok || !payload.entry) {
        throw new Error(payload.error || "Failed to reveal vault entry");
      }

      setRevealedEntries((current) => ({ ...current, [entryId]: payload.entry! }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reveal vault entry";
      toast.error(message);
    } finally {
      setRevealingId(null);
    }
  }

  async function handleCopy(entryId: string) {
    const entry = revealedEntries[entryId];
    if (!entry) {
      toast.error("Reveal the value first.");
      return;
    }

    try {
      await navigator.clipboard.writeText(entry.value);
      setCopiedId(entryId);
      toast.success("Copied. Clipboard will be cleared in 30 seconds.");

      setTimeout(() => {
        void navigator.clipboard.writeText("").catch(() => {});
        setCopiedId((current) => (current === entryId ? null : current));
      }, 30_000);
    } catch {
      toast.error("Failed to copy to clipboard.");
    }
  }

  async function handleDelete(entryId: string) {
    const confirmed = window.confirm("Delete this vault entry permanently?");
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/vault/${entryId}`, { method: "DELETE" });
      const payload = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to delete vault entry");
      }

      setEntries((current) => current.filter((entry) => entry.id !== entryId));
      setRevealedEntries((current) => {
        const next = { ...current };
        delete next[entryId];
        return next;
      });
      if (copiedId === entryId) {
        setCopiedId(null);
      }
      toast.success("Vault entry deleted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete vault entry";
      toast.error(message);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-zinc-100">
            <Shield className="h-5 w-5 text-cyan-300" />
            Secure Vault
          </CardTitle>
          <p className="text-sm text-zinc-400">
            Vault secrets are session-protected and never injected into agent context.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-[1fr,180px,1fr,auto]">
            <Input
              placeholder="Entry name (e.g. OpenAI API Key)"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="border-zinc-700 bg-zinc-900 text-zinc-100"
            />
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              {CATEGORIES.filter((item) => item.value).map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <Input
              placeholder="Secret value"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="border-zinc-700 bg-zinc-900 text-zinc-100"
              type="password"
            />
            <Button
              type="submit"
              disabled={submitting}
              className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300"
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-zinc-100">Vault Entries</CardTitle>
          <select
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 md:w-60"
          >
            {CATEGORIES.map((item) => (
              <option key={item.value || "all"} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 p-6 text-sm text-zinc-400">
              No vault entries yet.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredEntries.map((entry) => {
                const revealed = revealedEntries[entry.id];
                const isRevealing = revealingId === entry.id;
                return (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-zinc-100">
                          <KeyRound className="h-4 w-4 text-cyan-300" />
                          <span className="font-medium">{entry.name}</span>
                        </div>
                        <p className="text-xs uppercase tracking-wide text-zinc-500">{entry.category}</p>
                        <p className="text-xs text-zinc-500">
                          Created {new Date(entry.createdAt).toLocaleString()}
                        </p>
                        {revealed ? (
                          <pre className="mt-2 overflow-x-auto rounded-md border border-zinc-800 bg-zinc-900/70 p-2 text-xs text-zinc-200">
                            {revealed.value}
                          </pre>
                        ) : null}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="border-zinc-700"
                          onClick={() => void handleReveal(entry.id)}
                          disabled={isRevealing}
                        >
                          {isRevealing ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : revealed ? (
                            <EyeOff className="mr-2 h-4 w-4" />
                          ) : (
                            <Eye className="mr-2 h-4 w-4" />
                          )}
                          {revealed ? "Hide" : "Reveal"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-zinc-700"
                          onClick={() => void handleCopy(entry.id)}
                          disabled={!revealed}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          {copiedId === entry.id ? "Copied" : "Copy"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-rose-700 text-rose-300 hover:bg-rose-950/30"
                          onClick={() => void handleDelete(entry.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
