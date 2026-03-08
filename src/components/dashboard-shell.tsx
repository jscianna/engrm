"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Activity, Brain, Home, Layers, Network, Plus, Search, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FeedbackWidget } from "@/components/feedback-widget";

const links = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/add", label: "Add", icon: Plus },
  { href: "/dashboard/search", label: "Search", icon: Search },
  { href: "/dashboard/browser", label: "Browser", icon: Layers },
  { href: "/dashboard/graph", label: "Graph", icon: Network },
  { href: "/dashboard/analytics", label: "Analytics", icon: Activity },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(6,182,212,0.14),transparent_58%)]" />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 pb-24 md:px-8 md:py-6 md:pb-6">
        {/* Desktop Header */}
        <header className="relative hidden items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/85 px-4 py-3 backdrop-blur md:flex">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold tracking-wide">
            <Brain className="h-4 w-4 text-cyan-300" />
            FatHippo
          </Link>
          <div className="flex items-center gap-2">
            {links.map((link) => {
              const Icon = link.icon;
              const active = pathname === link.href;
              return (
                <Button
                  key={link.href}
                  asChild
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
                    active ? "bg-zinc-800 text-zinc-50" : "",
                  )}
                >
                  <Link
                    href={link.href}
                    onMouseEnter={() => router.prefetch(link.href)}
                    onFocus={() => router.prefetch(link.href)}
                  >
                    <Icon className="mr-1 h-4 w-4" />
                    {link.label}
                  </Link>
                </Button>
              );
            })}
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        {/* Mobile Header */}
        <header className="relative flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/85 px-4 py-3 backdrop-blur md:hidden">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold tracking-wide">
            <Brain className="h-4 w-4 text-cyan-300" />
            FatHippo
          </Link>
          <UserButton afterSignOutUrl="/" />
        </header>

        <main>{children}</main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-900/95 backdrop-blur md:hidden">
        <div className="flex items-center justify-around py-2">
          {links.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors",
                  active ? "text-cyan-400" : "text-zinc-400"
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <FeedbackWidget />
    </div>
  );
}
