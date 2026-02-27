import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Code2,
  DatabaseZap,
  Lock,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    title: "Private by design",
    body: "Encrypted on your device before upload. We can't read your memories — only you can.",
    icon: Lock,
  },
  {
    title: "Find by meaning",
    body: "Search by what things mean, not exact keywords. All processing happens locally.",
    icon: Sparkles,
  },
  {
    title: "Permanent storage",
    body: "Save important memories forever with cryptographic proof they existed.",
    icon: ShieldCheck,
  },
  {
    title: "Connected knowledge",
    body: "Link related memories. See how your knowledge evolves over time.",
    icon: DatabaseZap,
  },
  {
    title: "Built for AI agents",
    body: "Simple APIs to store and retrieve, organized by project and session.",
    icon: Brain,
  },
  {
    title: "Instant recall",
    body: "Sub-second search so your AI stays in context, always.",
    icon: Zap,
  },
];

const integrations = [
  {
    title: "MCP Server",
    description: "Claude Desktop, Cursor, and any MCP client.",
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
    title: "TypeScript SDK",
    description: "For backends, workers, and tool-calling agents.",
    code: `await memry.store({
  project: "support-agent",
  content: "User prefers concise responses"
});`,
    icon: DatabaseZap,
  },
  {
    title: "Python CLI",
    description: "For automations and agent pipelines.",
    code: `memry store --project my-agent \\
  --content "Customer compliance info"`,
    icon: Terminal,
  },
];

export default function Home() {
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Background glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 top-0 h-[500px] w-[500px] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute -right-40 top-20 h-[400px] w-[400px] rounded-full bg-violet-500/15 blur-[100px]" />
      </div>

      {/* Header */}
      <header className="relative z-50 px-6 py-4 md:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight">
            MEMRY
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/docs" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Docs
            </Link>
            <Link href="/brain" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Brain
            </Link>
            <a 
              href="https://github.com/jscianna/memry" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              GitHub
            </a>
            {hasClerk ? (
              <>
                <SignedOut>
                  <SignInButton mode="modal">
                    <Button size="sm" className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400">
                      Sign In
                    </Button>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <Button asChild size="sm" className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400">
                    <Link href="/dashboard">Dashboard</Link>
                  </Button>
                </SignedIn>
              </>
            ) : (
              <Button asChild size="sm" className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            )}
          </nav>
        </div>
      </header>

      {/* Hero - compact, fits viewport */}
      <section className="relative px-6 pt-8 pb-12 md:px-10 lg:pt-12 lg:pb-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
            {/* Left: Copy */}
            <div className="space-y-5">
              <Badge className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                Zero-Knowledge Memory
              </Badge>
              <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                Give your AI a memory it can trust.
              </h1>
              <p className="max-w-lg text-lg text-zinc-400">
                MEMRY adds encrypted, permanent recall to agents and copilots. 
                Store context safely. Retrieve it instantly. Ship smarter AI.
              </p>
              <div className="flex flex-wrap gap-3">
                {hasClerk ? (
                  <>
                    <SignedOut>
                      <SignInButton mode="modal">
                        <Button size="lg" className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400">
                          Start Free
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </SignInButton>
                    </SignedOut>
                    <SignedIn>
                      <Button asChild size="lg" className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400">
                        <Link href="/dashboard">
                          Open Dashboard
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </SignedIn>
                  </>
                ) : (
                  <Button asChild size="lg" className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400">
                    <Link href="/dashboard">
                      Open Dashboard
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                )}
                <Button asChild size="lg" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                  <a href="#features">Learn More</a>
                </Button>
              </div>
              {/* Stats */}
              <div className="flex gap-8 pt-2">
                <div>
                  <p className="text-2xl font-bold text-cyan-400">11M+</p>
                  <p className="text-sm text-zinc-500">Memories</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-cyan-400">&lt;90ms</p>
                  <p className="text-sm text-zinc-500">Search</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-cyan-400">99.9%</p>
                  <p className="text-sm text-zinc-500">Uptime</p>
                </div>
              </div>
            </div>

            {/* Right: Memory Flow */}
            <div className="relative">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 backdrop-blur-xl">
                <p className="mb-4 text-xs font-medium tracking-wide text-zinc-500 uppercase">How It Works</p>
                <div className="grid grid-cols-4 gap-2">
                  <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-center">
                    <div className="mb-1 text-xl">💾</div>
                    <p className="text-xs font-medium text-cyan-300">Store</p>
                    <p className="text-[10px] text-zinc-500">Encrypt</p>
                  </div>
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
                    <div className="mb-1 text-xl">🔍</div>
                    <p className="text-xs font-medium text-emerald-300">Recall</p>
                    <p className="text-[10px] text-zinc-500">Search</p>
                  </div>
                  <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 text-center">
                    <div className="mb-1 text-xl">🔗</div>
                    <p className="text-xs font-medium text-violet-300">Link</p>
                    <p className="text-[10px] text-zinc-500">Connect</p>
                  </div>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-center">
                    <div className="mb-1 text-xl">✓</div>
                    <p className="text-xs font-medium text-amber-300">Verify</p>
                    <p className="text-[10px] text-zinc-500">Prove</p>
                  </div>
                </div>
                
                {/* Console preview */}
                <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-zinc-500">What we see</p>
                    <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 text-[10px]">Encrypted</Badge>
                  </div>
                  <div className="font-mono text-xs text-zinc-500">
                    <p><span className="text-zinc-600">encrypted:</span> 8a2f7b11e6d0c4...</p>
                    <p><span className="text-zinc-600">searchable:</span> [0.118, -0.042, ...]</p>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    Your content <span className="text-cyan-400">never</span> touches our servers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative scroll-mt-8 px-6 py-16 md:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold">Memory that works the way you think</h2>
            <p className="mt-2 text-zinc-400">Everything you need for reliable, private AI memory.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="border-zinc-800 bg-zinc-900/50 backdrop-blur">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <feature.icon className="h-4 w-4 text-cyan-400" />
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-zinc-400">{feature.body}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative px-6 py-16 md:px-10">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-8 text-center text-3xl font-bold">Simple for you. Impossible for us to read.</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-center backdrop-blur">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 font-bold">1</div>
              <h3 className="mb-2 font-semibold">Encrypt on device</h3>
              <p className="text-sm text-zinc-400">Your password creates a key that never leaves your device.</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-center backdrop-blur">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 font-bold">2</div>
              <h3 className="mb-2 font-semibold">Search privately</h3>
              <p className="text-sm text-zinc-400">Queries process locally. We never see what you're looking for.</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-center backdrop-blur">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 font-bold">3</div>
              <h3 className="mb-2 font-semibold">We stay blind</h3>
              <p className="text-sm text-zinc-400">We store only encrypted data. Your memories are unreadable to us.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section id="integrations" className="relative scroll-mt-8 px-6 py-16 md:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold">Integrate anywhere</h2>
            <p className="mt-2 text-zinc-400">Works with Claude, Cursor, custom SDKs, and pipelines.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {integrations.map((item) => (
              <Card key={item.title} className="border-zinc-800 bg-zinc-900/50 backdrop-blur">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <item.icon className="h-4 w-4 text-cyan-400" />
                    {item.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-zinc-400">{item.description}</p>
                  <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-cyan-300">
                    {item.code}
                  </pre>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="relative px-6 py-16 md:px-10">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
            <Badge variant="outline" className="border-zinc-700 text-zinc-400">2,400+ builders</Badge>
            <Badge variant="outline" className="border-zinc-700 text-zinc-400">11M+ memories</Badge>
            <Badge variant="outline" className="border-zinc-700 text-zinc-400">99.99% uptime</Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur">
              <CardContent className="p-6">
                <p className="mb-4 text-zinc-300">"Finally, memory that doesn't leak data. We switched from our homegrown solution and cut onboarding time by 60%."</p>
                <p className="text-sm text-zinc-500"><span className="text-zinc-300">Sarah K.</span> · Head of AI, Convoy</p>
              </CardContent>
            </Card>
            <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur">
              <CardContent className="p-6">
                <p className="mb-4 text-zinc-300">"The MCP integration is clean and predictable. We shipped memory-backed copilots without reworking our stack."</p>
                <p className="text-sm text-zinc-500"><span className="text-zinc-300">Marcus V.</span> · Staff Engineer, Northline AI</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="relative px-6 py-16 md:px-10">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold">Start free. Scale when ready.</h2>
            <p className="mt-2 text-zinc-400">No credit card required.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur">
              <CardContent className="p-6">
                <p className="text-sm font-medium text-zinc-400">Builder</p>
                <p className="mt-1 text-3xl font-bold text-zinc-100">$0</p>
                <p className="mt-2 text-sm text-zinc-400">Perfect for personal agents and prototypes.</p>
                <ul className="mt-4 space-y-2 text-sm text-zinc-400">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-400" /> 10,000 memories</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-400" /> Full encryption</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-400" /> All integrations</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="border-cyan-500/30 bg-cyan-500/5 backdrop-blur">
              <CardContent className="p-6">
                <p className="text-sm font-medium text-cyan-400">Team</p>
                <p className="mt-1 text-3xl font-bold text-zinc-100">Early Access</p>
                <p className="mt-2 text-sm text-zinc-400">Higher limits, team features, priority support.</p>
                <ul className="mt-4 space-y-2 text-sm text-zinc-400">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-400" /> Unlimited memories</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-400" /> Team collaboration</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-400" /> Priority support</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative px-6 py-16 md:px-10">
        <div className="mx-auto max-w-4xl rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 to-violet-500/10 p-8 text-center backdrop-blur">
          <h2 className="text-3xl font-bold">Ready to give your AI a memory?</h2>
          <p className="mt-2 text-zinc-400">Deploy in minutes. Keep ownership of your data.</p>
          <div className="mt-6">
            {hasClerk ? (
              <>
                <SignedOut>
                  <SignInButton mode="modal">
                    <Button size="lg" className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400">
                      Get Started Free
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <Button asChild size="lg" className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400">
                    <Link href="/dashboard">Open Dashboard</Link>
                  </Button>
                </SignedIn>
              </>
            ) : (
              <Button asChild size="lg" className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400">
                <Link href="/dashboard">Open Dashboard</Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative px-6 py-8 text-center text-sm text-zinc-500">
        <p>© 2026 MEMRY. Zero-knowledge memory for AI.</p>
      </footer>
    </div>
  );
}
