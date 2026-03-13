"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Activity, Brain, KeyRound, Menu, Plus, Search, Settings, Shield, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FeedbackWidget } from "@/components/feedback-widget";

const baseLinks = [
  { href: "/dashboard/search", label: "Memories", icon: Search },
  { href: "/dashboard/cognitive", label: "Cognition", icon: Brain },
  { href: "/vault", label: "Vault", icon: KeyRound },
  { href: "/dashboard/analytics", label: "Analytics", icon: Activity },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function DashboardShell({
  children,
  isAdmin = false,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const links = isAdmin
    ? [...baseLinks, { href: "/dashboard/admin", label: "Admin", icon: Shield }]
    : baseLinks;

  function isActiveLink(href: string): boolean {
    if (href === "/dashboard") {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(6,182,212,0.14),transparent_58%)]" />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 pb-6 md:px-8 md:py-6">
        {/* Desktop Header */}
        <header className="relative hidden items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/85 px-4 py-3 backdrop-blur md:flex">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold tracking-wide">
            <Brain className="h-4 w-4 text-cyan-300" />
            FatHippo
          </Link>
          <div className="flex items-center gap-2">
            {links.map((link) => {
              const Icon = link.icon;
              const active = isActiveLink(link.href);
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
            <Button asChild size="sm" className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
              <Link
                href="/dashboard/add"
                onMouseEnter={() => router.prefetch("/dashboard/add")}
                onFocus={() => router.prefetch("/dashboard/add")}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Memory
              </Link>
            </Button>
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        {/* Mobile Header */}
        <header className="relative flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/85 px-4 py-3 backdrop-blur md:hidden">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold tracking-wide">
            <Brain className="h-4 w-4 text-cyan-300" />
            FatHippo
          </Link>
          <div className="flex items-center gap-2">
            <UserButton afterSignOutUrl="/" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
              onClick={() => setMobileMenuOpen((current) => !current)}
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        {mobileMenuOpen ? (
          <div className="relative rounded-xl border border-zinc-800 bg-zinc-900/95 p-3 backdrop-blur md:hidden">
            <Link
              href="/dashboard/add"
              onClick={() => setMobileMenuOpen(false)}
              className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-cyan-300"
            >
              <Plus className="h-4 w-4" />
              Add Memory
            </Link>
            <div className="grid grid-cols-2 gap-2">
              {links.map((link) => {
                const Icon = link.icon;
                const active = isActiveLink(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                      active ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}

        <main>{children}</main>
      </div>

      <FeedbackWidget />
    </div>
  );
}
