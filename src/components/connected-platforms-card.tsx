"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, PlugZap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Platform = {
  name: string;
  icon: string;
  connected: boolean;
  lastActive?: string | null;
  source: "mcp" | "plugin" | "unknown";
};

type ConnectedPlatformsCardProps = {
  platforms: Platform[];
  totalConnections: number;
  setupCommand: string;
};

export function ConnectedPlatformsCard({ platforms, totalConnections, setupCommand }: ConnectedPlatformsCardProps) {
  const [copied, setCopied] = useState(false);

  const connected = platforms.filter(p => p.connected);
  const notConnected = platforms.filter(p => !p.connected);

  function copyCommand() {
    navigator.clipboard.writeText(setupCommand);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader>
        <div className="flex items-center gap-2">
          <PlugZap className="h-5 w-5 text-cyan-400" />
          <CardTitle className="text-zinc-100">Connected Platforms</CardTitle>
        </div>
        <CardDescription>
          {totalConnections > 0
            ? `FatHippo is active across ${connected.length} platform${connected.length !== 1 ? "s" : ""}.`
            : "Connect your coding tools to start learning."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connected platforms */}
        {connected.length > 0 && (
          <div className="space-y-2">
            {connected.map((platform) => (
              <div key={platform.name} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{platform.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{platform.name}</p>
                    {platform.lastActive && (
                      <p className="text-xs text-zinc-500">Last active: {platform.lastActive}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-cyan-800 bg-cyan-950/30 text-cyan-300 text-xs">
                    {platform.source === "plugin" ? "Plugin" : "MCP"}
                  </Badge>
                  <div className="h-2 w-2 rounded-full bg-emerald-400" title="Connected" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Not connected */}
        {notConnected.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Not yet connected</p>
            <div className="flex flex-wrap gap-2">
              {notConnected.map((platform) => (
                <span key={platform.name} className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1">
                  {platform.icon} {platform.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Setup command */}
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-zinc-400">
              {connected.length > 0 ? "Add more platforms" : "Connect all platforms"}
            </p>
            <button
              onClick={copyCommand}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <code className="text-sm text-cyan-300 font-mono">{setupCommand}</code>
          <p className="text-xs text-zinc-500 mt-2">
            For local-only mode (no FatHippo account):{" "}
            <code className="text-zinc-400">npx @fathippo/connect openclaw --local</code>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
