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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      {/* Hero - fits in viewport */}
      <section className="relative px-6 pt-12 pb-16 md:px-10 lg:pt-16 lg:pb-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
            {/* Left: Copy */}
            <div className="space-y-6">
              <Badge className="border-cyan-200 bg-cyan-50 text-cyan-700">
                Zero-Knowledge Memory
              </Badge>
              <h1 className="text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Give your AI a memory it can trust.
              </h1>
              <p className="max-w-lg text-lg text-slate-600">
                MEMRY adds encrypted, permanent recall to agents and copilots. 
                Store context safely. Retrieve it instantly. Ship smarter AI.
              </p>
              <div className="flex flex-wrap gap-3">
                {hasClerk ? (
                  <>
                    <SignedOut>
                      <SignInButton mode="modal">
                        <Button size="lg" className="bg-cyan-600 text-white shadow-lg shadow-cyan-200 hover:bg-cyan-700">
                          Start Free
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </SignInButton>
                    </SignedOut>
                    <SignedIn>
                      <Button asChild size="lg" className="bg-cyan-600 text-white shadow-lg shadow-cyan-200 hover:bg-cyan-700">
                        <Link href="/dashboard">
                          Open Dashboard
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </SignedIn>
                  </>
                ) : (
                  <Button asChild size="lg" className="bg-cyan-600 text-white shadow-lg shadow-cyan-200 hover:bg-cyan-700">
                    <Link href="/dashboard">
                      Open Dashboard
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                )}
                <Button asChild size="lg" variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-50">
                  <a href="#features">Learn More</a>
                </Button>
              </div>
              {/* Stats row */}
              <div className="flex gap-8 pt-4">
                <div>
                  <p className="text-2xl font-bold text-cyan-600">11M+</p>
                  <p className="text-sm text-slate-500">Memories stored</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-cyan-600">&lt;90ms</p>
                  <p className="text-sm text-slate-500">Search time</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-cyan-600">99.9%</p>
                  <p className="text-sm text-slate-500">Uptime</p>
                </div>
              </div>
            </div>

            {/* Right: Memory Flow Visual */}
            <div className="relative">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50">
                <p className="mb-4 text-xs font-medium tracking-wide text-slate-400 uppercase">How It Works</p>
                <div className="grid grid-cols-4 gap-3">
                  <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-3 text-center">
                    <div className="mb-2 text-2xl">💾</div>
                    <p className="text-xs font-semibold text-cyan-700">Store</p>
                    <p className="text-[10px] text-slate-500">Encrypt & save</p>
                  </div>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-center">
                    <div className="mb-2 text-2xl">🔍</div>
                    <p className="text-xs font-semibold text-emerald-700">Recall</p>
                    <p className="text-[10px] text-slate-500">Find by meaning</p>
                  </div>
                  <div className="rounded-xl border border-violet-100 bg-violet-50 p-3 text-center">
                    <div className="mb-2 text-2xl">🔗</div>
                    <p className="text-xs font-semibold text-violet-700">Share</p>
                    <p className="text-[10px] text-slate-500">Link related</p>
                  </div>
                  <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-center">
                    <div className="mb-2 text-2xl">✓</div>
                    <p className="text-xs font-semibold text-amber-700">Verify</p>
                    <p className="text-[10px] text-slate-500">Prove it existed</p>
                  </div>
                </div>
                
                {/* Mini console preview */}
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-500">What we see</p>
                    <Badge variant="outline" className="border-cyan-200 text-cyan-600 text-[10px]">Encrypted</Badge>
                  </div>
                  <div className="font-mono text-xs text-slate-400">
                    <p>encrypted: 8a2f7b11e6d0c4...</p>
                    <p>searchable: [0.118, -0.042, ...]</p>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Your content never touches our servers.
                  </p>
                </div>
              </div>
              
              {/* Decorative elements */}
              <div className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full bg-cyan-100 opacity-60 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-violet-100 opacity-60 blur-2xl" />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-8 bg-white px-6 py-16 md:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-slate-900">Memory that works the way you think</h2>
            <p className="mt-2 text-slate-600">Everything you need to give AI agents reliable, private memory.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="border-slate-200 bg-slate-50/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-900">
                    <feature.icon className="h-4 w-4 text-cyan-600" />
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-slate-600">{feature.body}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How Zero-Knowledge Works */}
      <section className="bg-slate-50 px-6 py-16 md:px-10">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-8 text-center text-3xl font-bold text-slate-900">Simple for you. Impossible for us to read.</h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100 text-cyan-600 font-bold">1</div>
              <h3 className="mb-2 font-semibold text-slate-900">Encrypt on your device</h3>
              <p className="text-sm text-slate-600">Your password creates a key that never leaves your device. Content is scrambled before upload.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100 text-cyan-600 font-bold">2</div>
              <h3 className="mb-2 font-semibold text-slate-900">Search privately</h3>
              <p className="text-sm text-slate-600">Search queries are processed on your device. We never see what you're looking for.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100 text-cyan-600 font-bold">3</div>
              <h3 className="mb-2 font-semibold text-slate-900">We stay blind</h3>
              <p className="text-sm text-slate-600">Our servers store only encrypted data. Even with full access, your memories are unreadable.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section id="integrations" className="scroll-mt-8 bg-white px-6 py-16 md:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-slate-900">Integrate anywhere</h2>
            <p className="mt-2 text-slate-600">Works with Claude, Cursor, custom SDKs, and automation pipelines.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {integrations.map((item) => (
              <Card key={item.title} className="border-slate-200">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-900">
                    <item.icon className="h-4 w-4 text-cyan-600" />
                    {item.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-slate-600">{item.description}</p>
                  <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-900 p-3 font-mono text-xs text-cyan-300">
                    {item.code}
                  </pre>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="bg-slate-50 px-6 py-16 md:px-10">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
            <Badge variant="outline" className="border-slate-300 text-slate-600">2,400+ builders</Badge>
            <Badge variant="outline" className="border-slate-300 text-slate-600">11M+ memories</Badge>
            <Badge variant="outline" className="border-slate-300 text-slate-600">99.99% uptime</Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-6">
                <p className="mb-4 text-slate-700">"Finally, memory that doesn't leak data. We switched from our homegrown solution and cut onboarding time by 60%."</p>
                <p className="text-sm text-slate-500"><span className="font-medium text-slate-700">Sarah K.</span> · Head of AI, Convoy</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-6">
                <p className="mb-4 text-slate-700">"The MCP integration is clean and predictable. We shipped memory-backed copilots without reworking our stack."</p>
                <p className="text-sm text-slate-500"><span className="font-medium text-slate-700">Marcus V.</span> · Staff Engineer, Northline AI</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-white px-6 py-16 md:px-10">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-slate-900">Start free. Scale when ready.</h2>
            <p className="mt-2 text-slate-600">No credit card required. Upgrade as your memory grows.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-slate-200">
              <CardContent className="p-6">
                <p className="text-sm font-medium text-slate-500">Builder</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">$0</p>
                <p className="mt-2 text-sm text-slate-600">Perfect for personal agents and prototypes.</p>
                <ul className="mt-4 space-y-2 text-sm text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-600" /> 10,000 memories</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-600" /> Full encryption</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-600" /> All integrations</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="border-cyan-200 bg-cyan-50/50">
              <CardContent className="p-6">
                <p className="text-sm font-medium text-cyan-700">Team</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">Early Access</p>
                <p className="mt-2 text-sm text-slate-600">Higher limits, team features, priority support.</p>
                <ul className="mt-4 space-y-2 text-sm text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-600" /> Unlimited memories</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-600" /> Team collaboration</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan-600" /> Priority support</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-cyan-600 to-cyan-700 px-6 py-16 md:px-10">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold text-white">Ready to give your AI a memory?</h2>
          <p className="mt-2 text-cyan-100">Deploy in minutes. Keep ownership of your data.</p>
          <div className="mt-6">
            {hasClerk ? (
              <>
                <SignedOut>
                  <SignInButton mode="modal">
                    <Button size="lg" className="bg-white text-cyan-700 hover:bg-cyan-50">
                      Get Started Free
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <Button asChild size="lg" className="bg-white text-cyan-700 hover:bg-cyan-50">
                    <Link href="/dashboard">Open Dashboard</Link>
                  </Button>
                </SignedIn>
              </>
            ) : (
              <Button asChild size="lg" className="bg-white text-cyan-700 hover:bg-cyan-50">
                <Link href="/dashboard">Open Dashboard</Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 px-6 py-8 text-center text-sm text-slate-400">
        <p>© 2026 MEMRY. Zero-knowledge memory for AI.</p>
      </footer>
    </div>
  );
}
