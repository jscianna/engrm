import { ClerkProvider, auth } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

  // If no valid Clerk key, redirect to home
  if (!publishableKey) {
    redirect("/");
  }

  try {
    const { userId } = await auth();

    if (!userId) {
      redirect("/");
    }

    return (
      <ClerkProvider publishableKey={publishableKey}>
        <DashboardShell>{children}</DashboardShell>
      </ClerkProvider>
    );
  } catch {
    // If Clerk auth fails, redirect to home
    redirect("/");
  }
}
