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
  currentPluginVersion: string;
  publishedPluginVersion: string | null;
  lastSeenPluginVersion: string | null;
  lastSeenPluginMode: string | null;
  lastSeenPluginAt: string | null;
  updateAvailable: boolean;
  hasConnectedPlugin: boolean;
};

export function OpenClawConnectCard(props: OpenClawConnectCardProps) {
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const hostedCommand = "npx @fathippo/connect openclaw";
  const localCommand = "npx @fathippo/connect openclaw --local";

  const manualHostedInstallBlock = useMemo(() => {
    const keyValue = createdKey ?? "mem_your_openclaw_key";
    return [
      "openclaw plugins install @fathippo/fathippo-context-engine",
      "openclaw config set plugins.slots.contextEngine fathippo-context-engine",
      "openclaw config set plugins.entries.fathippo-context-engine.config.mode hosted",
      `openclaw config set plugins.entries.fathippo-context-engine.config.apiKey ${keyValue}`,
      "openclaw config set plugins.entries.fathippo-context-engine.config.baseUrl https://fathippo.ai/api",
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
      toast.success("OpenClaw key created for the manual fallback path.");
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
    props.lastSeenPluginVersion
      ? `OpenClaw last checked in with v${props.lastSeenPluginVersion}${props.lastSeenPluginMode ? ` in ${props.lastSeenPluginMode} mode` : ""}${props.lastSeenPluginAt ? ` on ${new Date(props.lastSeenPluginAt).toLocaleDateString()}` : ""}.`
      : props.lastUsed
        ? `OpenClaw has used this connection recently (${new Date(props.lastUsed).toLocaleDateString()}).`
        : props.hasExistingOpenClawKey && props.isActive
          ? "You already have an active OpenClaw key, but the recommended path is the one-command installer."
          : "Use the one-command installer to connect the OpenClaw you already run.";

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-zinc-100">
          <PlugZap className="h-5 w-5 text-cyan-300" />
          Connect Your Existing OpenClaw
        </CardTitle>
        <CardDescription>
          Install FatHippo in one command, approve the copied login link in your browser, and let OpenClaw recall before every reply and learn after each exchange.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-100">Connection status</p>
              <p className="mt-1 text-xs text-zinc-400">{statusLabel}</p>
            </div>
            {props.hasConnectedPlugin ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ready
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-zinc-300">
              Dashboard package: v{props.currentPluginVersion}
            </span>
            {props.publishedPluginVersion ? (
              <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-zinc-300">
                Published plugin: v{props.publishedPluginVersion}
              </span>
            ) : null}
            {props.lastSeenPluginVersion ? (
              <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-zinc-300">
                Last seen: v{props.lastSeenPluginVersion}
              </span>
            ) : null}
            {props.updateAvailable ? (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-300">
                Update available
              </span>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-cyan-800 bg-cyan-950/25 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-cyan-100">One-command hosted install</p>
              <p className="mt-1 text-xs text-cyan-200/80">
                Runs the plugin install, copies a login link, waits for browser approval, writes config, and restarts OpenClaw for you.
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => void copyBlock(hostedCommand, "Hosted install command")}>
              <Copy className="h-4 w-4" />
              Copy
            </Button>
          </div>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-950 px-3 py-3 text-xs text-zinc-100">
            <code>{hostedCommand}</code>
          </pre>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-100">One-command local install</p>
              <p className="mt-1 text-xs text-zinc-500">
                Keeps memory on the machine running OpenClaw. No FatHippo account or API key is required.
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => void copyBlock(localCommand, "Local install command")}>
              <Copy className="h-4 w-4" />
              Copy
            </Button>
          </div>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-950 px-3 py-3 text-xs text-zinc-200">
            <code>{localCommand}</code>
          </pre>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/docs/guides/openclaw">
              Open Full Guide
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            type="button"
            onClick={() => void createOpenClawKey()}
            disabled={creating}
            variant="outline"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            {createdKey ? "Create Fresh Manual Key" : "Manual API Key"}
          </Button>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
          <p className="text-sm font-medium text-zinc-100">Advanced fallback: manual hosted setup</p>
          <p className="mt-1 text-xs text-zinc-500">
            Keep this for unusual environments. New installs should use the one-command flow instead of pasting keys.
          </p>
          {createdKey ? (
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-zinc-900 px-3 py-2 text-xs text-zinc-100">
                {createdKey}
              </code>
              <Button type="button" size="sm" variant="outline" onClick={() => void copyBlock(createdKey, "API key")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
          <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-950 px-3 py-3 text-xs text-zinc-200">
            <code>{manualHostedInstallBlock}</code>
          </pre>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-300">
          <p className="font-medium text-zinc-100">What the plugin does now</p>
          <ul className="mt-2 space-y-1 text-xs text-zinc-400">
            <li>Hosted mode builds context before every non-trivial reply and records the completed exchange after the reply lands.</li>
            <li>Local mode follows the same turn rhythm on-device and keeps data in the configured local storage file.</li>
            <li>captureUserOnly still exists as an advanced compatibility flag, but full-turn capture is the default.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
