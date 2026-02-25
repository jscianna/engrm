import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    title: "Permanent by design",
    body: "Every saved memory can be anchored to Arweave with a verifiable transaction ID.",
    icon: ShieldCheck,
  },
  {
    title: "Semantic memory search",
    body: "Use local embeddings + Vectra to search by meaning instead of exact keywords.",
    icon: Sparkles,
  },
  {
    title: "Your personal memory graph",
    body: "Capture text, links, and files from one dashboard and retrieve them instantly.",
    icon: ArrowRight,
  },
];

export default function Home() {
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,#164e63_0%,#09090b_38%,#020617_100%)] text-zinc-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col px-6 py-16 md:px-10">
        <section className="mb-12 grid gap-8 rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-8 backdrop-blur md:grid-cols-2 md:p-12">
          <div className="space-y-6">
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-300">Memories, Forever</p>
            <h1 className="text-4xl font-semibold leading-tight md:text-6xl">
              MEMRY keeps what matters alive on Arweave.
            </h1>
            <p className="max-w-xl text-zinc-400">
              Save notes, URLs, and files with permanent proofs. Retrieve them with semantic search anytime.
            </p>
            <div className="flex gap-3">
              {hasClerk ? (
                <>
                  <SignedOut>
                    <SignInButton mode="modal">
                      <Button className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">Start Building Memory</Button>
                    </SignInButton>
                  </SignedOut>
                  <SignedIn>
                    <Button asChild className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
                      <Link href="/dashboard">Open Dashboard</Link>
                    </Button>
                  </SignedIn>
                </>
              ) : (
                <Button asChild className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
                  <Link href="/dashboard">Open Dashboard</Link>
                </Button>
              )}
              <Button asChild variant="outline" className="border-zinc-700 bg-transparent text-zinc-100">
                <a href="https://arweave.org" target="_blank" rel="noreferrer">
                  Why Arweave
                </a>
              </Button>
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/90 p-6">
            <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Permanent Proof</p>
            <code className="block rounded-md bg-zinc-900 px-3 py-2 font-mono text-xs text-cyan-300">
              ar://x5wFv8j3Qm9R2KztjL7YwP1n9z...
            </code>
            <p className="mt-4 text-sm text-zinc-400">
              Each memory gets a transaction ID you can audit independently.
            </p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="border-zinc-800 bg-zinc-900/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-zinc-100">
                  <feature.icon className="h-4 w-4 text-cyan-300" />
                  {feature.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-zinc-400">{feature.body}</CardContent>
            </Card>
          ))}
        </section>
      </main>
    </div>
  );
}
