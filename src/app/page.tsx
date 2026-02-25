import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { ArrowRight, Brain, DatabaseZap, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    title: "Structured memory layers",
    body: "Capture episodic moments, semantic facts, procedural steps, and self-model reflections in one vault.",
    icon: Brain,
  },
  {
    title: "Similarity-first retrieval",
    body: "Run semantic search and related-memory discovery to reconnect context you forgot you had.",
    icon: Sparkles,
  },
  {
    title: "Verifiable permanence",
    body: "Commit selected memories to Arweave and keep a public TX proof linked to every record.",
    icon: ShieldCheck,
  },
  {
    title: "Consolidation workflow",
    body: "Run Dream Cycle to propose memory bonds, upgrades, and decay-aware maintenance actions.",
    icon: DatabaseZap,
  },
];

export default function Home() {
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-16 md:px-10 md:py-20">
        <section className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-[0_20px_80px_rgba(8,145,178,0.12)] md:p-12">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -left-24 bottom-0 h-60 w-60 rounded-full bg-blue-500/10 blur-3xl" />

          <div className="relative grid gap-10 md:grid-cols-2 md:items-end">
            <div className="space-y-6">
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">AI Memory Infrastructure</p>
              <h1 className="text-4xl font-semibold leading-tight md:text-6xl">
                MEMRY turns your thoughts into a durable second brain.
              </h1>
              <p className="max-w-xl text-zinc-300">
                Capture, connect, and preserve memories with semantic retrieval and optional Arweave permanence.
                Build cognition that compounds.
              </p>
              <div className="flex flex-wrap gap-3">
                {hasClerk ? (
                  <>
                    <SignedOut>
                      <SignInButton mode="modal">
                        <Button className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
                          Start Building
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </SignInButton>
                    </SignedOut>
                    <SignedIn>
                      <Button asChild className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
                        <Link href="/dashboard">
                          Open Dashboard
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </SignedIn>
                  </>
                ) : (
                  <Button asChild className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
                    <Link href="/dashboard">
                      Open Dashboard
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                )}
                <Button asChild variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800">
                  <a href="https://arweave.org" target="_blank" rel="noreferrer">
                    Explore Arweave
                  </a>
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
              <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Proof Snapshot</p>
              <code className="block rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-cyan-300">
                ar://x5wFv8j3Qm9R2KztjL7YwP1n9zJbQ7YqT2...
              </code>
              <p className="mt-3 text-sm text-zinc-300">Immutable proof links every committed memory to a public transaction.</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <p className="text-zinc-500">Search mode</p>
                  <p className="mt-1 text-zinc-100">Vector + semantic</p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <p className="text-zinc-500">Storage mode</p>
                  <p className="mt-1 text-zinc-100">Local + Arweave</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {features.map((feature) => (
            <Card key={feature.title} className="border-zinc-800 bg-zinc-900/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-zinc-100">
                  <feature.icon className="h-4 w-4 text-cyan-300" />
                  {feature.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-zinc-300">{feature.body}</CardContent>
            </Card>
          ))}
        </section>

        <section className="rounded-2xl border border-cyan-800/40 bg-gradient-to-r from-zinc-900 to-zinc-900/70 p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Ready to persist your cognition?</p>
              <h2 className="mt-1 text-2xl font-semibold text-zinc-100">Start with one memory and let the graph grow.</h2>
            </div>
            <Button asChild className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
              <Link href="/dashboard">Enter MEMRY</Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
