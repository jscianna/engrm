"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { 
    title: "Getting Started",
    items: [
      { href: "/docs", label: "Quick Start" },
      { href: "/docs/concepts", label: "Core Concepts" },
    ]
  },
  {
    title: "API Reference",
    items: [
      { href: "/docs/api", label: "Overview" },
      { href: "/docs/api/memories", label: "Memories" },
      { href: "/docs/api/search", label: "Search" },
      { href: "/docs/api/sessions", label: "Sessions" },
      { href: "/docs/api/context", label: "Context" },
      { href: "/docs/api/simple", label: "Simple API" },
      { href: "/docs/api/intelligence", label: "Intelligence" },
      { href: "/docs/api/analytics", label: "Analytics" },
    ]
  },
  {
    title: "Integration Guides",
    items: [
      { href: "/docs/guides/openai", label: "OpenAI" },
      { href: "/docs/guides/anthropic", label: "Anthropic" },
      { href: "/docs/guides/langchain", label: "LangChain" },
      { href: "/docs/guides/openclaw", label: "OpenClaw" },
    ]
  },
];

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold">Engrm</span>
            <span className="text-zinc-500 text-sm">docs</span>
          </Link>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/jscianna/engrm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-white transition-colors text-sm"
            >
              GitHub
            </a>
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-medium rounded-lg transition-colors text-sm"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="flex pt-16">
        {/* Sidebar */}
        <aside className="fixed left-0 top-16 w-64 h-[calc(100vh-4rem)] overflow-y-auto border-r border-zinc-800 bg-zinc-950 p-6">
          <nav className="space-y-6">
            {NAV_ITEMS.map((section) => (
              <div key={section.title}>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  {section.title}
                </h3>
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                          pathname === item.href
                            ? "bg-cyan-500/10 text-cyan-400 font-medium"
                            : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 ml-64 px-12 py-12 max-w-4xl">
          {children}
        </main>
      </div>
    </div>
  );
}
