import { auth, currentUser } from "@clerk/nextjs/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiKeysCard } from "@/components/api-keys-card";
import { UsageCard } from "@/components/usage-card";

export default async function SettingsPage() {
  const [{ userId }, user] = await Promise.all([auth(), currentUser()]);
  if (!userId) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      {/* Usage Stats */}
      <UsageCard />

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
        </CardContent>
      </Card>

      {/* Agent API Keys */}
      <ApiKeysCard />
    </div>
  );
}
