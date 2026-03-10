import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { isAdminViewer } from "@/lib/admin-auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ userId }, isAdmin] = await Promise.all([auth(), isAdminViewer()]);

  if (!userId) {
    redirect("/");
  }

  return <DashboardShell isAdmin={isAdmin}>{children}</DashboardShell>;
}
