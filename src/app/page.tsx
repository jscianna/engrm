import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { ArrowRight, Brain, Code2, DatabaseZap, Lock, ShieldCheck, Sparkles, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    title: "Zero-knowledge encryption",
    body: "Your data is encrypted on your device before upload. We can't read your memories — only you can.",
    icon: Lock,
  },
  {
    title: "Semantic search & retrieval",
    body: "Find memories by meaning, not keywords. Embeddings are generated locally for complete privacy.",
    icon: Sparkles,
  },
  {
    title: "Permanent storage",
    body: "Commit memories to Arweave for immutable, verifiable permanence with public TX proofs.",
    icon: ShieldCheck,
  },
  {
    title: "Memory graph",
    body: "Connect memories with typed relationships. See how your knowledge evolves over time.",
    icon: DatabaseZap,
  },
];

const integrations = [
  {
    title: "MCP Server",
    description: "Works with Claude Desktop, Cursor, and any MCP-compatible client.",
    code: `{
  "mcpServers": {
    "memry": {
      "command": "memry-mcp"
    }
  }
}`,
    icon: Code2,
  },
  {
    title: "Python CLI",
    description: "For AI agents, scripts, and automation. Full zero-knowledge support.",
    code: `python memry.py store "User prefers concise responses"
python memry.py search "communication style"`,
    icon: Terminal,
  },
];

export default function Home() {
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-16 md:px-10 md:py-20">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-[0_20px_80px_rgba(8,145,178,0.12)] md:p-12">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -left-24 bottom-0 h-60 w-60 rounded-full bg-blue-500/10 blur-3xl" />

          <div className="relative grid gap-10 md:grid-cols-2 md:items-end">
            <div className="space-y-6">
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Zero-Knowledge Memory for AI</p>
              <h1 className="text-4xl font-semibold leading-tight md:text-5xl lg:text-6xl">
                Memory that&apos;s truly yours.
              </h1>
              <p className="max-w-xl text-lg text-zinc-300">
                Give your AI agents persistent memory without sacrificing privacy. 
                Encrypted on your device, stored forever on Arweave.
              </p>
              <div className="flex flex-wrap gap-3">
                {hasClerk ? (
                  <>
                    <SignedOut>
                      <SignInButton mode="modal">
                        <Button className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
                          Get Started
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
                  <a href="#integrations">
                    View Integrations
                  </a>
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
              <p className="mb-3 text-xs uppercase tracking-wide text-zinc-500">What we see</p>
              <div className="space-y-2 font-mono text-xs">
                <div className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2">
                  <span className="text-zinc-500">vector:</span>{" "}
                  <span className="text-cyan-300">[0.12, -0.34, 0.87, ...]</span>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2">
                  <span className="text-zinc-500">content:</span>{" "}
                  <span className="text-cyan-300">aGVsbG8gd29ybGQ...</span>
                </div>
              </div>
              <p className="mt-4 text-sm text-zinc-400">
                Meaningless vectors. Encrypted blobs. <span className="text-cyan-300">We can&apos;t read your data.</span>
              </p>
            </div>
          </div>
        </section>

        {/* Features */}
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

        {/* How it works */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 md:p-8">
          <h2 className="mb-6 text-center text-2xl font-semibold">How zero-knowledge works</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400/10 text-cyan-300">
                1
              </div>
              <h3 className="mb-2 font-medium">Encrypt locally</h3>
              <p className="text-sm text-zinc-400">
                Your vault password derives a key on your device. Content is encrypted with AES-256-GCM before upload.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400/10 text-cyan-300">
                2
              </div>
              <h3 className="mb-2 font-medium">Embed locally</h3>
              <p className="text-sm text-zinc-400">
                Search queries are converted to vectors on your device. We never see what you&apos;re looking for.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400/10 text-cyan-300">
                3
              </div>
              <h3 className="mb-2 font-medium">Store blindly</h3>
              <p className="text-sm text-zinc-400">
                Our servers store vectors and ciphertext. Even with full database access, your data is unreadable.
              </p>
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section id="integrations" className="scroll-mt-8">
          <h2 className="mb-6 text-center text-2xl font-semibold">Integrate anywhere</h2>
          <p className="mx-auto mb-8 max-w-2xl text-center text-zinc-400">
            Use MEMRY with Claude Desktop, Cursor, AI agents, or your own applications. 
            Every integration uses zero-knowledge encryption.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {integrations.map((integration) => (
              <Card key={integration.title} className="border-zinc-800 bg-zinc-900/80">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-zinc-100">
                    <integration.icon className="h-4 w-4 text-cyan-300" />
                    {integration.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-zinc-400">{integration.description}</p>
                  <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-cyan-300">
                    {integration.code}
                  </pre>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-zinc-500">
            Self-host or use our hosted service. Same privacy guarantees either way.
          </p>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-cyan-800/40 bg-gradient-to-r from-zinc-900 to-zinc-900/70 p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Ready to give your AI a memory?</p>
              <h2 className="mt-1 text-2xl font-semibold text-zinc-100">Start free. Upgrade when you need more.</h2>
            </div>
            {hasClerk ? (
              <SignedOut>
                <SignInButton mode="modal">
                  <Button className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
                    Create Account
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </SignInButton>
              </SignedOut>
            ) : null}
            <SignedIn>
              <Button asChild className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
                <Link href="/dashboard">Open Dashboard</Link>
              </Button>
            </SignedIn>
          </div>
        </section>
      </main>
    </div>
  );
}
