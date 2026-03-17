import { auth, currentUser } from "@clerk/nextjs/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiKeysCard } from "@/components/api-keys-card";
import { BillingCard } from "@/components/billing-card";
import { ConnectedPlatformsCard } from "@/components/connected-platforms-card";
import { UsageCard } from "@/components/usage-card";
import { hasClerkAdminAccess } from "@/lib/admin-auth";
import { isOpenClawAgentName } from "@/lib/cognitive-receipts";
import { getUserEntitlementPlan, listApiKeys } from "@/lib/db";
import { getOpenClawPluginStatus, pickPreferredOpenClawKey } from "@/lib/openclaw-plugin";
import { RescoreButton } from "@/components/rescore-button";

const ALL_PLATFORMS = [
  { name: "OpenClaw", icon: "🦞", source: "plugin" as const },
  { name: "Claude Code", icon: "🤖", source: "mcp" as const },
  { name: "Cursor", icon: "⌨️", source: "mcp" as const },
  { name: "Codex", icon: "📦", source: "mcp" as const },
  { name: "Windsurf", icon: "🏄", source: "mcp" as const },
  { name: "Zed", icon: "⚡", source: "mcp" as const },
  { name: "VS Code", icon: "💻", source: "mcp" as const },
  { name: "OpenCode", icon: "🔓", source: "mcp" as const },
  { name: "Antigravity", icon: "🚀", source: "mcp" as const },
  { name: "Trae", icon: "🌊", source: "mcp" as const },
  { name: "Qoder", icon: "🔮", source: "mcp" as const },
  { name: "Hermes Agent", icon: "🪽", source: "mcp" as const },
];

function formatRelativeDate(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString();
}

// Map runtime header values to platform display names
const RUNTIME_TO_PLATFORM: Record<string, string> = {
  codex: "Codex",
  claude: "Claude Code",
  cursor: "Cursor",
  windsurf: "Windsurf",
  zed: "Zed",
  vscode: "VS Code",
  opencode: "OpenCode",
  antigravity: "Antigravity",
  trae: "Trae",
  qoder: "Qoder",
  hermes: "Hermes Agent",
};

function buildPlatformData(
  apiKeys: Array<{ agentName: string | null; lastUsed: string | null; isActive: boolean; lastSeenRuntimes: Record<string, string> }>,
  pluginStatus: { hasConnectedPlugin: boolean; lastSeenAt: string | null },
) {
  // Collect all seen runtimes across all active API keys
  const all_seen_runtimes: Record<string, string> = {};
  for (const key of apiKeys) {
    if (!key.isActive) continue;
    for (const [runtime, seen_at] of Object.entries(key.lastSeenRuntimes)) {
      const existing = all_seen_runtimes[runtime];
      if (!existing || seen_at > existing) {
        all_seen_runtimes[runtime] = seen_at;
      }
    }
  }

  return ALL_PLATFORMS.map(p => {
    if (p.name === "OpenClaw") {
      return {
        ...p,
        connected: pluginStatus.hasConnectedPlugin,
        lastActive: formatRelativeDate(pluginStatus.lastSeenAt),
      };
    }

    // Check runtime tracking first (most reliable)
    for (const [runtime_key, seen_at] of Object.entries(all_seen_runtimes)) {
      const platform_name = RUNTIME_TO_PLATFORM[runtime_key];
      if (platform_name === p.name) {
        return { ...p, connected: true, lastActive: formatRelativeDate(seen_at) };
      }
    }

    // Fallback: check agentName matching
    const matching_key = apiKeys.find(k => {
      const name = (k.agentName ?? "").toLowerCase();
      return (
        name.includes(p.name.toLowerCase()) ||
        name.includes(p.name.toLowerCase().replaceAll(" ", ""))
      );
    });

    if (matching_key?.isActive && matching_key.lastUsed) {
      return { ...p, connected: true, lastActive: formatRelativeDate(matching_key.lastUsed) };
    }

    return { ...p, connected: false, lastActive: null };
  });
}

export default async function SettingsPage() {
  const [{ userId }, user] = await Promise.all([auth(), currentUser()]);
  if (!userId) {
    return null;
  }

  const [apiKeys, currentPlan] = await Promise.all([
    listApiKeys(userId),
    getUserEntitlementPlan(userId),
  ]);
  const openClawKey = pickPreferredOpenClawKey(
    apiKeys.filter((key) => isOpenClawAgentName(key.agentName)),
  );
  const pluginStatus = await getOpenClawPluginStatus(openClawKey ?? null);

  const platformData = buildPlatformData(
    apiKeys.map(k => ({ agentName: k.agentName, lastUsed: k.lastUsed, isActive: k.isActive, lastSeenRuntimes: k.lastSeenRuntimes ?? {} })),
    { hasConnectedPlugin: pluginStatus.hasConnectedPlugin, lastSeenAt: pluginStatus.lastSeenAt },
  );

  const primaryEmail = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? null;
  const isAdmin = hasClerkAdminAccess({
    userId,
    email: primaryEmail,
    publicMetadata: user?.publicMetadata,
    privateMetadata: user?.privateMetadata,
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      {/* Usage Stats */}
      <UsageCard />

      {/* Billing */}
      <BillingCard
        plan={currentPlan}
        priceMonthly={process.env.STRIPE_PRICE_MONTHLY ?? ""}
        priceAnnual={process.env.STRIPE_PRICE_ANNUAL ?? ""}
      />

      {/* Connected Platforms */}
      <ConnectedPlatformsCard
        platforms={platformData}
        totalConnections={platformData.filter(p => p.connected).length}
        setupCommand="npx fathippo setup"
      />

      {/* Profile */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader>
          <CardTitle className="text-zinc-100">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-300">
          <p>
            <span className="text-zinc-500">Email:</span>{" "}
            {user?.emailAddresses[0]?.emailAddress ?? "No email"}
          </p>
          <p>
            <span className="text-zinc-500">Name:</span>{" "}
            {user?.fullName ?? "Not set"}
          </p>
          <p>
            <span className="text-zinc-500">Admin access:</span>{" "}
            {isAdmin ? "Enabled" : "Not enabled"}
          </p>
        </CardContent>
      </Card>

      {/* Memory Admin */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader>
          <CardTitle className="text-zinc-100">Memory Admin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-zinc-400">
            Re-score all memory importance values based on current classification rules.
          </p>
          <RescoreButton />
        </CardContent>
      </Card>

      {/* Agent API Keys */}
      <ApiKeysCard />
    </div>
  );
}
