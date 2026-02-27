import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import {
  Activity,
  ArrowRight,
  Brain,
  CheckCircle2,
  Code2,
  DatabaseZap,
  Lock,
  Quote,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const features = [
  {
    title: "Private by design",
    body: "Your data is encrypted on your device before upload. We can't read your memories — only you can.",
    icon: Lock,
  },
  {
    title: "Find by meaning",
    body: "Search memories by what they mean, not exact keywords. All search happens on your device for complete privacy.",
    icon: Sparkles,
  },
  {
    title: "Permanent storage",
    body: "Save important memories forever with cryptographic proof they existed. Immutable, verifiable, yours.",
    icon: ShieldCheck,
  },
  {
    title: "Connected knowledge",
    body: "Link related memories together. See how your knowledge evolves and connects over time.",
    icon: DatabaseZap,
  },
  {
    title: "Built for AI agents",
    body: "Simple APIs to store and retrieve memories, organized by project and session. Drop into any workflow.",
    icon: Brain,
  },
  {
    title: "Instant recall",
    body: "Sub-second search so your AI stays in context, even across long-running conversations.",
    icon: Activity,
  },
];

const integrations = [
  {
    title: "MCP Server",
    description: "Works with Claude Desktop, Cursor, and any MCP-compatible client.",
    code: `// claude_desktop_config.json
{
  "mcpServers": {
    "memry": {
      "command": "memry-mcp",
      "env": {
        "MEMRY_API_KEY": "mk_live_xxx",
        "MEMRY_PROJECT": "my-assistant"
      }
    }
  }
}`,
    icon: Code2,
  },
  {
    title: "TypeScript SDK",
    description: "Embed memory in app backends, workers, and tool-calling agents.",
    code: `import { MemryClient } from "@memry/sdk";

const memry = new MemryClient({ apiKey: process.env.MEMRY_API_KEY! });

await memry.store({
  project: "support-agent",
  content: "User prefers concise responses",
  tags: ["prefs", "tone"]
});

const context = await memry.search({
  project: "support-agent",
  query: "How should I respond to this user?"
});`,
    icon: DatabaseZap,
  },
  {
    title: "Python CLI",
    description: "For local automations, cron jobs, and agent memory pipelines.",
    code: `memry auth login --api-key "$MEMRY_API_KEY"
memry store --project prod-agent \\
  --content "Customer uses SOC2-compliant infrastructure"

memry search --project prod-agent \\
  --query "compliance requirements" --limit 5`,
    icon: Terminal,
  },
];

const proof = ["2,400+ active builders", "99.99% API uptime", "11M+ encrypted memories", "SOC 2 roadmap in progress"];

const testimonials = [
  {
    quote:
      "MEMRY made our support agent feel persistent in two days. The privacy story closed deals we would have otherwise lost.",
    name: "Danika R.",
    role: "CTO, HelixOps",
  },
  {
    quote:
      "The MCP integration is clean, fast, and predictable. We shipped memory-backed copilots without reworking our stack.",
    name: "Marcus V.",
    role: "Staff Engineer, Northline AI",
  },
];

export default function Home() {
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#09090b] text-zinc-100">
      <div className="pointer-events-none absolute -left-40 top-8 h-[26rem] w-[26rem] rounded-full bg-cyan-400/20 blur-[140px] animate-pulse" />
      <div className="pointer-events-none absolute -right-32 top-24 h-[22rem] w-[22rem] rounded-full bg-sky-500/20 blur-[120px] animate-pulse" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-[28rem] w-[28rem] rounded-full bg-cyan-500/10 blur-[160px]" />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-24 px-6 py-14 md:px-10 md:py-20">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/45 p-8 backdrop-blur-xl shadow-[0_35px_120px_rgba(34,211,238,0.16)] md:p-12 lg:p-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,rgba(34,211,238,0.18),transparent_48%),radial-gradient(circle_at_88%_12%,rgba(56,189,248,0.16),transparent_38%),linear-gradient(120deg,rgba(9,9,11,0.65),rgba(9,9,11,0.4))]" />
          <div className="pointer-events-none absolute right-16 top-10 h-28 w-28 rounded-full border border-cyan-200/20 bg-cyan-300/10 blur-sm animate-bounce" />
          <div className="pointer-events-none absolute left-12 top-20 h-16 w-16 rounded-full border border-cyan-300/20 bg-cyan-400/10 animate-pulse" />

          <div className="relative grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-8">
              <Badge className="border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-medium tracking-[0.2em] text-cyan-200 uppercase">
                Zero-Knowledge Memory Infrastructure
              </Badge>
              <h1 className="text-balance text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
                Give every AI workflow a private, permanent memory layer.
              </h1>
              <p className="max-w-2xl text-lg text-zinc-300 sm:text-xl">
                MEMRY adds encrypted long-term recall to agents, copilots, and automations. Store context safely, retrieve it instantly, and ship smarter behavior without trading privacy.
              </p>

              <div className="flex flex-wrap gap-3">
                {hasClerk ? (
                  <>
                    <SignedOut>
                      <SignInButton mode="modal">
                        <Button size="lg" className="bg-cyan-400 text-zinc-950 shadow-[0_0_40px_rgba(34,211,238,0.35)] hover:bg-cyan-300">
                          Start Free
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </SignInButton>
                    </SignedOut>
                    <SignedIn>
                      <Button asChild size="lg" className="bg-cyan-400 text-zinc-950 shadow-[0_0_40px_rgba(34,211,238,0.35)] hover:bg-cyan-300">
                        <Link href="/dashboard">
                          Open Dashboard
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </SignedIn>
                  </>
                ) : (
                  <Button asChild size="lg" className="bg-cyan-400 text-zinc-950 shadow-[0_0_40px_rgba(34,211,238,0.35)] hover:bg-cyan-300">
                    <Link href="/dashboard">
                      Open Dashboard
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                )}
                <Button asChild size="lg" variant="outline" className="border-zinc-600/80 bg-zinc-900/60 text-zinc-100 backdrop-blur hover:bg-zinc-800/80">
                  <a href="#integrations">
                    Explore Integrations
                  </a>
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
                <div className="rounded-xl border border-zinc-700/70 bg-zinc-900/55 p-4 backdrop-blur">
                  <p className="text-2xl font-semibold text-cyan-200">11M+</p>
                  <p className="text-sm text-zinc-400">Encrypted memories stored</p>
                </div>
                <div className="rounded-xl border border-zinc-700/70 bg-zinc-900/55 p-4 backdrop-blur">
                  <p className="text-2xl font-semibold text-cyan-200">&lt;90ms</p>
                  <p className="text-sm text-zinc-400">Median search time</p>
                </div>
                <div className="rounded-xl border border-zinc-700/70 bg-zinc-900/55 p-4 backdrop-blur">
                  <p className="text-2xl font-semibold text-cyan-200">24/7</p>
                  <p className="text-sm text-zinc-400">Production memory uptime</p>
                </div>
              </div>
            </div>

            <div className="relative rounded-2xl border border-zinc-700/70 bg-zinc-950/70 p-5 backdrop-blur-2xl">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-medium tracking-[0.18em] text-zinc-400 uppercase">Live Memory Console</p>
                <Badge className="border-zinc-700 bg-zinc-900/80 text-cyan-200">Encrypted</Badge>
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-cyan-300/20 bg-cyan-400/10 p-3">
                  <p className="text-xs text-zinc-400">Incoming context</p>
                  <p className="text-sm text-zinc-100">User asked for concise update style and weekly recaps.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-zinc-700/70 bg-zinc-900/90 p-3">
                    <p className="text-xs text-zinc-500">Fingerprint</p>
                    <p className="mt-1 font-mono text-xs text-cyan-300">0x7ca4...8d1f</p>
                  </div>
                  <div className="rounded-xl border border-zinc-700/70 bg-zinc-900/90 p-3">
                    <p className="text-xs text-zinc-500">Project</p>
                    <p className="mt-1 font-mono text-xs text-cyan-300">prod-assistant</p>
                  </div>
                </div>
                <div className="rounded-xl border border-zinc-700/70 bg-zinc-900/90 p-3 font-mono text-xs text-zinc-300">
                  <p><span className="text-zinc-500">encrypted:</span> 8a2f7b11e6d0c4...</p>
                  <p><span className="text-zinc-500">searchable:</span> [0.118, -0.042, 0.911, ...]</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-zinc-400">
                We only store scrambled data. <span className="text-cyan-200">Your actual content never touches our servers.</span>
              </p>
            </div>
          </div>
        </section>

        {/* Demo preview */}
        <section className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="space-y-5">
            <Badge className="border border-cyan-300/30 bg-cyan-300/10 text-cyan-200">Product Preview</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">See memory state evolve in real time.</h2>
            <p className="text-zinc-300">
              Built for teams shipping serious AI products. Track memory health and search quality from a single dashboard.
            </p>
            <div className="space-y-3 text-sm text-zinc-300">
              <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-300" /> See memories for each conversation or agent run</p>
              <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-300" /> One-click permanent storage with proof</p>
              <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-300" /> Project-level insights to improve search quality</p>
            </div>
          </div>
          <Card className="overflow-hidden border-zinc-700/70 bg-zinc-900/45 backdrop-blur-xl shadow-[0_25px_80px_rgba(8,145,178,0.2)]">
            <CardContent className="space-y-5 p-5">
              <div className="flex items-center justify-between rounded-xl border border-zinc-700/70 bg-zinc-950/80 p-4">
                <div>
                  <p className="text-xs tracking-[0.16em] text-zinc-500 uppercase">Memory Throughput</p>
                  <p className="mt-1 text-2xl font-semibold text-cyan-200">428 / min</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-cyan-400/20 animate-pulse" />
              </div>
              <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/80 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium">Session Timeline</p>
                  <p className="text-xs text-zinc-500">Last 30 minutes</p>
                </div>
                <div className="space-y-2">
                  <div className="h-2 rounded-full bg-gradient-to-r from-cyan-300/80 to-cyan-600/50" />
                  <div className="h-2 w-4/5 rounded-full bg-gradient-to-r from-sky-300/70 to-cyan-800/50" />
                  <div className="h-2 w-2/3 rounded-full bg-gradient-to-r from-cyan-300/70 to-zinc-700" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/80 p-3">
                  <p className="text-xs text-zinc-500">Hit Rate</p>
                  <p className="mt-1 text-lg font-semibold text-cyan-200">96.4%</p>
                </div>
                <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/80 p-3">
                  <p className="text-xs text-zinc-500">Recall Depth</p>
                  <p className="mt-1 text-lg font-semibold text-cyan-200">4.2 hops</p>
                </div>
                <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/80 p-3">
                  <p className="text-xs text-zinc-500">Latency P95</p>
                  <p className="mt-1 text-lg font-semibold text-cyan-200">121ms</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Features */}
        <section className="space-y-6">
          <div className="space-y-2">
            <Badge className="border border-zinc-700 bg-zinc-900/70 text-zinc-200">Core Capabilities</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">Built for secure agent memory at scale</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="border-zinc-700/70 bg-zinc-900/50 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-zinc-100">
                  <feature.icon className="h-4 w-4 text-cyan-300" />
                  {feature.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-zinc-300">{feature.body}</CardContent>
            </Card>
          ))}
          </div>
        </section>

        {/* How it works */}
        <section className="rounded-3xl border border-zinc-700/70 bg-zinc-900/40 p-6 backdrop-blur-xl md:p-8">
          <h2 className="mb-8 text-center text-3xl font-semibold">How zero-knowledge works</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-zinc-700/70 bg-zinc-950/85 p-5 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400/10 text-cyan-300 animate-pulse">
                1
              </div>
              <h3 className="mb-2 font-medium">Encrypt on your device</h3>
              <p className="text-sm text-zinc-400">
                Your password creates a secret key that never leaves your device. Your content is scrambled before upload.
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-700/70 bg-zinc-950/85 p-5 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400/10 text-cyan-300 animate-pulse">
                2
              </div>
              <h3 className="mb-2 font-medium">Search privately</h3>
              <p className="text-sm text-zinc-400">
                Your search queries are processed on your device. We never see what you&apos;re looking for.
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-700/70 bg-zinc-950/85 p-5 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400/10 text-cyan-300 animate-pulse">
                3
              </div>
              <h3 className="mb-2 font-medium">We stay blind</h3>
              <p className="text-sm text-zinc-400">
                Our servers store only encrypted data. Even with full database access, your memories are unreadable.
              </p>
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section id="integrations" className="scroll-mt-8">
          <h2 className="mb-4 text-center text-3xl font-semibold">Integrate anywhere</h2>
          <p className="mx-auto mb-8 max-w-2xl text-center text-zinc-400">
            Use MEMRY with Claude Desktop, Cursor, custom SDKs, and automation pipelines.
            Every path is encryption-first.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {integrations.map((integration) => (
              <Card key={integration.title} className="border-zinc-700/70 bg-zinc-900/50 backdrop-blur">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-zinc-100">
                    <integration.icon className="h-4 w-4 text-cyan-300" />
                    {integration.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-zinc-400">{integration.description}</p>
                  <pre className="overflow-x-auto rounded-lg border border-zinc-700/70 bg-zinc-950/90 p-3 font-mono text-xs leading-relaxed text-cyan-200">
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

        {/* Social proof */}
        <section className="space-y-8">
          <div className="flex flex-wrap items-center justify-center gap-3">
            {proof.map((item) => (
              <Badge key={item} className="border border-zinc-700 bg-zinc-900/65 px-3 py-1 text-zinc-200">
                {item}
              </Badge>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {testimonials.map((item) => (
              <Card key={item.name} className="border-zinc-700/70 bg-zinc-900/45 backdrop-blur">
                <CardContent className="space-y-4 p-6">
                  <Quote className="h-5 w-5 text-cyan-300" />
                  <p className="text-zinc-200">{item.quote}</p>
                  <p className="text-sm text-zinc-400">
                    <span className="text-zinc-100">{item.name}</span> · {item.role}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Pricing teaser + early access */}
        <section className="rounded-3xl border border-cyan-800/40 bg-gradient-to-r from-zinc-900/90 to-zinc-900/60 p-6 backdrop-blur md:p-8">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-5">
              <Badge className="border border-cyan-300/35 bg-cyan-400/10 text-cyan-200">Pricing Preview</Badge>
              <h2 className="text-3xl font-semibold tracking-tight">Start free, scale when your memory graph grows.</h2>
              <p className="text-zinc-300">Early access teams get premium limits, migration support, and direct engineering onboarding.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/75 p-4">
                  <p className="text-sm text-zinc-400">Builder</p>
                  <p className="mt-1 text-2xl font-semibold text-cyan-200">$0</p>
                  <p className="text-sm text-zinc-400">Perfect for personal agents and prototypes.</p>
                </div>
                <div className="rounded-xl border border-cyan-300/35 bg-cyan-400/10 p-4">
                  <p className="text-sm text-zinc-100">Team Early Access</p>
                  <p className="mt-1 text-2xl font-semibold text-cyan-100">Invite-only</p>
                  <p className="text-sm text-zinc-200/80">Higher limits, team collaboration, priority support.</p>
                </div>
              </div>
            </div>
            <Card className="border-zinc-700/70 bg-zinc-950/80">
              <CardContent className="space-y-4 p-5">
                <p className="text-sm font-medium text-zinc-100">Join the early access list</p>
                <p className="text-sm text-zinc-400">Get pricing details and rollout updates.</p>
                <form className="space-y-3">
                  <Input type="email" placeholder="you@company.com" className="border-zinc-700 bg-zinc-900/70 text-zinc-100 placeholder:text-zinc-500" />
                  {hasClerk ? (
                    <SignedOut>
                      <SignInButton mode="modal">
                        <Button type="button" className="w-full bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
                          Request Access
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </SignInButton>
                    </SignedOut>
                  ) : (
                    <Button asChild className="w-full bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
                      <Link href="/dashboard">
                        Request Access
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                  <SignedIn>
                    <Button asChild className="w-full bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
                      <Link href="/dashboard">
                        Open Dashboard
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </SignedIn>
                </form>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-zinc-700/70 bg-zinc-900/50 p-6 backdrop-blur md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Ready to give your AI a memory?</p>
              <h2 className="mt-1 text-2xl font-semibold text-zinc-100">Deploy MEMRY in minutes and keep ownership of your data.</h2>
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
