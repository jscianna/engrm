import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { VaultPageClient } from "@/components/vault-page-client";

export default async function VaultPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/");
  }

  return (
    <DashboardShell>
      <VaultPageClient />
    </DashboardShell>
  );
}
