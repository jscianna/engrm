"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Brain, Home, Plus, Search, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/add", label: "Add", icon: Plus },
  { href: "/dashboard/search", label: "Search", icon: Search },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(6,182,212,0.14),transparent_58%)]" />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 md:px-8">
        <header className="relative flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/85 px-4 py-3 backdrop-blur">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold tracking-wide">
            <Brain className="h-4 w-4 text-cyan-300" />
            MEMRY
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
                    active && "bg-zinc-800 text-zinc-50",
                  )}
                >
                  <Link href={link.href}>
                    <Icon className="mr-1 h-4 w-4" />
                    {link.label}
                  </Link>
                </Button>
              );
            })}
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
