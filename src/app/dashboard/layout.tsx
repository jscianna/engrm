import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { VaultProvider } from "@/components/vault-provider";
import { hasUserVaultSalt } from "@/lib/db";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  const hasVault = await hasUserVaultSalt(userId);

  return (
    <VaultProvider initialHasVault={hasVault} userId={userId}>
      <DashboardShell>{children}</DashboardShell>
    </VaultProvider>
  );
}
