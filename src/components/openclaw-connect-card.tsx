"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, ExternalLink, Loader2, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type OpenClawConnectCardProps = {
  hasExistingOpenClawKey: boolean;
  isActive: boolean;
  lastUsed: string | null;
};

export function OpenClawConnectCard(props: OpenClawConnectCardProps) {
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const installBlock = useMemo(() => {
    const keyValue = createdKey ?? "mem_your_openclaw_key";
    return [
      "openclaw plugins install @fathippo/context-engine",
      "openclaw config set plugins.slots.contextEngine=fathippo-context-engine",
      `openclaw config set plugins.entries.fathippo-context-engine.config.apiKey=${keyValue}`,
      "openclaw gateway restart",
    ].join("\n");
  }, [createdKey]);

  async function createOpenClawKey() {
    try {
      setCreating(true);
      const response = await fetch("/api/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName: "openclaw" }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload.error === "string" ? payload.error : "Failed to create OpenClaw key");
      }

      const payload = await response.json();
      setCreatedKey(typeof payload.key === "string" ? payload.key : null);
      toast.success("OpenClaw key created. Copy the commands below into your terminal.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create OpenClaw key";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  async function copyBlock(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  }

  const statusLabel =
    props.lastUsed
      ? `OpenClaw has used this connection recently (${new Date(props.lastUsed).toLocaleDateString()}).`
      : props.hasExistingOpenClawKey && props.isActive
        ? "You already have an active OpenClaw key. If you have not connected it yet, create a fresh one below."
        : "Connect Fathippo to the OpenClaw you already use in four commands.";

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-zinc-100">
          <PlugZap className="h-5 w-5 text-cyan-300" />
          Connect Your Existing OpenClaw
        </CardTitle>
        <CardDescription>
          Install Fathippo once, then let it quietly improve retrieval, workflows, and repeated fixes over time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-100">Connection status</p>
              <p className="mt-1 text-xs text-zinc-400">{statusLabel}</p>
            </div>
            {props.hasExistingOpenClawKey && props.isActive ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ready
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void createOpenClawKey()}
            disabled={creating}
            className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            {createdKey ? "Create Fresh OpenClaw Key" : "Create OpenClaw Key"}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/docs/guides/openclaw">
              Open Full Guide
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {createdKey ? (
          <div className="rounded-xl border border-cyan-800 bg-cyan-950/25 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">New OpenClaw key</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-zinc-950 px-3 py-2 text-xs text-zinc-100">
                {createdKey}
              </code>
              <Button type="button" size="sm" variant="outline" onClick={() => void copyBlock(createdKey, "API key")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-100">Paste this into your terminal</p>
              <p className="mt-1 text-xs text-zinc-500">
                If you already have OpenClaw installed, this is the full Fathippo connection flow.
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => void copyBlock(installBlock, "OpenClaw setup commands")}>
              <Copy className="h-4 w-4" />
              Copy Commands
            </Button>
          </div>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-950 px-3 py-3 text-xs text-zinc-200">
            <code>{installBlock}</code>
          </pre>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-300">
          <p className="font-medium text-zinc-100">What happens after you connect it</p>
          <ul className="mt-2 space-y-1 text-xs text-zinc-400">
            <li>FatHippo quietly learns repeated fixes, better retrieval mixes, and better debugging workflows.</li>
            <li>You will see lightweight receipts in the dashboard when Fathippo reused a pattern, suggested a workflow, or likely saved retries.</li>
            <li>No hardware training setup is required.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
