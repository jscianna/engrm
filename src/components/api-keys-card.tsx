"use client";

import { useState, useEffect, useCallback } from "react";
import { Ban, Copy, Key, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ApiKey = {
  id: string;
  agentName: string;
  keyPrefix: string;
  keySuffix: string;
  createdAt: string;
  lastUsed: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
};

export function ApiKeysCard() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/api-keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      }
    } catch {
      // Ignore errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchKeys();
  }, [fetchKeys]);

  async function createKey() {
    if (!newKeyName.trim()) {
      toast.error("Please enter an agent name");
      return;
    }

    try {
      setCreating(true);
      const res = await fetch("/api/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName: newKeyName.trim() }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create key");
      }

      const data = await res.json();
      setNewKeyValue(data.key);
      setNewKeyName("");
      await fetchKeys();
      toast.success("API key created");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create key";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  async function deleteKey(id: string) {
    try {
      setDeletingId(id);
      const res = await fetch(`/api/settings/api-keys/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete key");
      }

      setKeys((prev) => prev.filter((k) => k.id !== id));
      toast.success("API key deleted");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete key";
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  }

  async function revokeKey(id: string) {
    try {
      setRevokingId(id);
      const res = await fetch(`/api/settings/api-keys/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to revoke key");
      }

      // Update key status locally
      setKeys((prev) =>
        prev.map((k) =>
          k.id === id ? { ...k, isActive: false, revokedAt: new Date().toISOString() } : k
        )
      );
      toast.success("API key revoked — it can no longer be used");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to revoke key";
      toast.error(message);
    } finally {
      setRevokingId(null);
    }
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    toast.success("Copied to clipboard");
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-zinc-100">
          <Key className="h-5 w-5" />
          Agent API Keys
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-zinc-400">
          Create API keys for AI agents to access your memories via the Engrm API.
        </p>

        {/* New key display (shown once after creation) */}
        {newKeyValue && (
          <div className="rounded-lg border border-cyan-800 bg-cyan-950/30 p-3">
            <p className="mb-2 text-xs font-medium text-cyan-300">
              ⚠️ Copy this key now — it won't be shown again
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-zinc-950 px-2 py-1 text-sm text-zinc-100">
                {newKeyValue}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-700"
                onClick={() => copyKey(newKeyValue)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="mt-2 text-zinc-400"
              onClick={() => setNewKeyValue(null)}
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Create new key */}
        <div className="flex gap-2">
          <Input
            placeholder="Agent name (e.g., openclaw, assistant)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="border-zinc-700 bg-zinc-950 text-zinc-100"
            onKeyDown={(e) => e.key === "Enter" && createKey()}
          />
          <Button
            onClick={() => void createKey()}
            disabled={creating || !newKeyName.trim()}
            className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create
          </Button>
        </div>

        {/* Existing keys */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading keys...
          </div>
        ) : keys.length === 0 ? (
          <p className="text-sm text-zinc-500">No API keys yet. Create one to get started.</p>
        ) : (
          <div className="space-y-2">
            {keys.map((key) => (
              <div
                key={key.id}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                  key.isActive 
                    ? "border-zinc-800 bg-zinc-950" 
                    : "border-rose-900/50 bg-rose-950/20"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-zinc-200">{key.agentName}</p>
                    {key.isActive ? (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">
                        Active
                      </span>
                    ) : key.revokedAt ? (
                      <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-400">
                        Revoked
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">
                        Expired
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">
                    {key.keyPrefix}•••{key.keySuffix} · Created {new Date(key.createdAt).toLocaleDateString()}
                    {key.lastUsed && (
                      <> · Last used {new Date(key.lastUsed).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {key.isActive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-zinc-400 hover:text-amber-400"
                      onClick={() => void revokeKey(key.id)}
                      disabled={revokingId === key.id}
                      title="Revoke key"
                    >
                      {revokingId === key.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Ban className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-zinc-400 hover:text-rose-400"
                    onClick={() => void deleteKey(key.id)}
                    disabled={deletingId === key.id}
                    title="Delete key permanently"
                  >
                    {deletingId === key.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Usage instructions */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="mb-2 text-xs font-medium text-zinc-400">Usage</p>
          <code className="block text-xs text-zinc-300">
            curl -H &quot;Authorization: Bearer mem_xxx&quot; \<br />
            &nbsp;&nbsp;{typeof window !== "undefined" ? window.location.origin : "https://engrm.xyz"}/api/v1/memories
          </code>
        </div>
      </CardContent>
    </Card>
  );
}
