import dynamic from "next/dynamic";
import { auth, currentUser } from "@clerk/nextjs/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SecurityKeyCard } from "@/components/security-key-card";

const ArweaveWalletCard = dynamic(
  () => import("@/components/arweave-wallet-card").then((module) => module.ArweaveWalletCard),
  {
    loading: () => (
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="p-5 text-sm text-zinc-400">Loading wallet tools...</CardContent>
      </Card>
    ),
  },
);

export default async function SettingsPage() {
  const [{ userId }, user] = await Promise.all([auth(), currentUser()]);
  if (!userId) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader>
          <CardTitle className="text-zinc-100">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-300">
          <p>User ID: {userId}</p>
          <p>Email: {user?.emailAddresses[0]?.emailAddress ?? "No email"}</p>
          <p>Name: {user?.fullName ?? "No name set"}</p>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader>
          <CardTitle className="text-zinc-100">API Keys & Integrations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-300">
          <p>
            `ARWEAVE_JWK`: {process.env.ARWEAVE_JWK ? "Configured" : "Missing (required for permanent uploads)"}
          </p>
          <p>`TURBO_TOKEN`: {process.env.TURBO_TOKEN ?? "arweave (default)"}</p>
          <p>
            Embeddings run locally via `@xenova/transformers`; vector index persisted in `data/vectra`.
          </p>
        </CardContent>
      </Card>

      <ArweaveWalletCard />
      <SecurityKeyCard />
    </div>
  );
}
