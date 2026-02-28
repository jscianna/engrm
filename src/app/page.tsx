import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Code2,
  DatabaseZap,
  Lock,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
            Engrm
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/docs" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Docs
            </Link>
            <Link href="/brain" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Brain
            </Link>
            <a 
              href="https://github.com/jscianna/engrm" 
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

      {/* Hero - The Problem & Solution */}
      <section className="relative px-6 pt-12 pb-16 md:px-10 lg:pt-16 lg:pb-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center space-y-6 max-w-3xl mx-auto">
            <Badge className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
              Memory for AI Agents
            </Badge>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Your AI finally<br />
              <span className="text-cyan-400">remembers you.</span>
            </h1>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              Every conversation starts fresh. Your AI forgets your name, your preferences, 
              everything you've ever told it. Engrm fixes that.
            </p>
            <div className="flex flex-wrap gap-4 justify-center pt-4">
              {hasClerk ? (
                <>
                  <SignedOut>
                    <SignInButton mode="modal">
                      <Button size="lg" className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400 text-lg px-8">
                        Get Started Free
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    </SignInButton>
                  </SignedOut>
                  <SignedIn>
                    <Button asChild size="lg" className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400 text-lg px-8">
                      <Link href="/dashboard">
                        Open Dashboard
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Link>
                    </Button>
                  </SignedIn>
                </>
              ) : (
                <Button asChild size="lg" className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400 text-lg px-8">
                  <Link href="/dashboard">
                    Get Started Free
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              )}
              <Button asChild size="lg" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-lg px-8">
                <Link href="/docs">Read Docs</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Before/After Comparison */}
      <section className="relative px-6 py-16 md:px-10">
        <div className="mx-auto max-w-5xl">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Without Engrm */}
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-red-400 font-medium">Without Engrm</span>
              </div>
              <div className="space-y-4">
                <div className="rounded-lg bg-zinc-900/80 p-4">
                  <p className="text-sm text-zinc-500 mb-1">Session 1</p>
                  <p className="text-zinc-300">"I'm John, based in Singapore. I prefer morning meetings."</p>
                </div>
                <div className="rounded-lg bg-zinc-900/80 p-4">
                  <p className="text-sm text-zinc-500 mb-1">Session 2</p>
                  <p className="text-zinc-300">"Schedule a call with my team."</p>
                  <p className="text-red-400 mt-2 text-sm italic">"What timezone are you in? Do you have any scheduling preferences?"</p>
                </div>
                <div className="rounded-lg bg-zinc-900/80 p-4">
                  <p className="text-sm text-zinc-500 mb-1">Session 3</p>
                  <p className="text-zinc-300">"Remember that project we discussed?"</p>
                  <p className="text-red-400 mt-2 text-sm italic">"I don't have access to previous conversations."</p>
                </div>
              </div>
              <p className="text-zinc-500 text-sm mt-6 text-center">Every session starts from zero.</p>
            </div>

            {/* With Engrm */}
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-3 h-3 rounded-full bg-cyan-400" />
                <span className="text-cyan-400 font-medium">With Engrm</span>
              </div>
              <div className="space-y-4">
                <div className="rounded-lg bg-zinc-900/80 p-4">
                  <p className="text-sm text-zinc-500 mb-1">Session 1</p>
                  <p className="text-zinc-300">"I'm John, based in Singapore. I prefer morning meetings."</p>
                  <p className="text-cyan-400 mt-2 text-sm">✓ Stored: identity, preference, timezone</p>
                </div>
                <div className="rounded-lg bg-zinc-900/80 p-4">
                  <p className="text-sm text-zinc-500 mb-1">Session 2</p>
                  <p className="text-zinc-300">"Schedule a call with my team."</p>
                  <p className="text-cyan-400 mt-2 text-sm italic">"I'll suggest 9am SGT — that works with your morning preference and gives US teammates a reasonable evening slot."</p>
                </div>
                <div className="rounded-lg bg-zinc-900/80 p-4">
                  <p className="text-sm text-zinc-500 mb-1">Session 47</p>
                  <p className="text-zinc-300">"What did we decide about the API?"</p>
                  <p className="text-cyan-400 mt-2 text-sm italic">"You chose REST over GraphQL on Feb 15th because of team familiarity."</p>
                </div>
              </div>
              <p className="text-cyan-400 text-sm mt-6 text-center">Context builds over time. Nothing is forgotten.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="relative px-6 py-20 md:px-10" id="how-it-works">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold sm:text-4xl mb-4">How It Works</h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              Every conversation, Engrm retrieves relevant context and injects it into your AI's prompt. 
              Your agent responds like it actually knows you.
            </p>
          </div>

          {/* Flow Steps */}
          <div className="grid md:grid-cols-5 gap-4 mb-16">
            {[
              { icon: MessageSquare, title: "User Message", desc: "User asks a question" },
              { icon: Search, title: "Search Memory", desc: "Find relevant context" },
              { icon: Lock, title: "Decrypt Local", desc: "Only you can read it" },
              { icon: Brain, title: "Inject Context", desc: "Add to AI prompt" },
              { icon: Sparkles, title: "Smart Response", desc: "Personalized answer" },
            ].map((step, i) => (
              <div key={i} className="relative">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto mb-4">
                    <step.icon className="w-8 h-8 text-cyan-400" />
                  </div>
                  <p className="font-semibold mb-1">{step.title}</p>
                  <p className="text-sm text-zinc-500">{step.desc}</p>
                </div>
                {i < 4 && (
                  <div className="hidden md:block absolute top-8 -right-2 text-cyan-500">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Example Prompt */}
          <div className="max-w-3xl mx-auto">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-sm text-zinc-500 ml-2">Augmented Prompt</span>
              </div>
              <div className="p-6 font-mono text-sm">
                <p className="text-zinc-500">System:</p>
                <p className="text-zinc-300 mb-4">You are a helpful assistant.</p>
                
                <p className="text-cyan-400 mb-2">## Memories (auto-injected by Engrm):</p>
                <ul className="text-zinc-400 space-y-1 mb-4">
                  <li>• User timezone: SGT (GMT+8) <span className="text-zinc-600">— fact, strength: 1.4</span></li>
                  <li>• Prefers morning meetings <span className="text-zinc-600">— preference, strength: 1.2</span></li>
                  <li>• Team distributed US/Asia <span className="text-zinc-600">— fact, strength: 0.9</span></li>
                  <li>• Busy on Fridays <span className="text-zinc-600">— constraint, strength: 1.8</span></li>
                </ul>
                
                <p className="text-zinc-500">User:</p>
                <p className="text-zinc-300">"Schedule a call with the team"</p>
              </div>
            </div>
            <p className="text-center text-zinc-500 text-sm mt-4">
              The AI now has full context to give a personalized, relevant response.
            </p>
          </div>
        </div>
      </section>

      {/* Key Benefits */}
      <section className="relative px-6 py-20 md:px-10 bg-zinc-900/30" id="features">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold sm:text-4xl mb-4">Not Just Storage. Intelligence.</h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              Engrm doesn't just store memories — it learns what matters, forgets what doesn't, 
              and builds connections between related ideas.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Reinforcement */}
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mb-4">
                  <RefreshCw className="w-6 h-6 text-purple-400" />
                </div>
                <CardTitle className="text-xl">Reinforcement</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-400 mb-4">
                  Mention something multiple times? It becomes a stronger memory. 
                  Important things naturally rise to the top.
                </p>
                <div className="text-sm font-mono text-zinc-500">
                  1st mention → 1.0×<br />
                  2nd mention → 1.4×<br />
                  5th mention → 2.0×<br />
                  <span className="text-purple-400">Frequently accessed = always relevant</span>
                </div>
              </CardContent>
            </Card>

            {/* Decay */}
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4">
                  <Zap className="w-6 h-6 text-amber-400" />
                </div>
                <CardTitle className="text-xl">Natural Forgetting</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-400 mb-4">
                  Not everything is worth keeping forever. Old, unused memories naturally fade — 
                  just like human memory.
                </p>
                <div className="text-sm font-mono text-zinc-500">
                  Constraints → 180 day halflife<br />
                  Facts → 90 days<br />
                  Events → 14 days<br />
                  <span className="text-amber-400">Access resets the clock</span>
                </div>
              </CardContent>
            </Card>

            {/* Zero Knowledge */}
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-4">
                  <Lock className="w-6 h-6 text-cyan-400" />
                </div>
                <CardTitle className="text-xl">True Privacy</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-400 mb-4">
                  Encrypted on your device. We literally cannot read your memories — 
                  even with full database access.
                </p>
                <div className="text-sm font-mono text-zinc-500">
                  Embeddings → generated locally<br />
                  Encryption → AES-256-GCM<br />
                  Server sees → vectors + ciphertext<br />
                  <span className="text-cyan-400">Zero-knowledge by design</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Integration */}
      <section className="relative px-6 py-20 md:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold sm:text-4xl mb-4">Add Memory in Minutes</h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              Works with Claude, GPT, or any LLM. MCP server, Python SDK, or REST API.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* MCP */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Code2 className="w-6 h-6 text-cyan-400" />
                <h3 className="font-semibold text-lg">MCP Server</h3>
              </div>
              <p className="text-zinc-400 text-sm mb-4">For Claude Desktop & Cursor</p>
              <pre className="bg-zinc-950 rounded-lg p-4 text-sm font-mono text-zinc-300 overflow-x-auto">
{`npm install -g @engrm/mcp

// claude_desktop_config.json
"engrm": {
  "command": "engrm-mcp"
}`}
              </pre>
            </div>

            {/* Python */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Terminal className="w-6 h-6 text-cyan-400" />
                <h3 className="font-semibold text-lg">Python SDK</h3>
              </div>
              <p className="text-zinc-400 text-sm mb-4">Full ZK with local embeddings</p>
              <pre className="bg-zinc-950 rounded-lg p-4 text-sm font-mono text-zinc-300 overflow-x-auto">
{`pip install engrm-sdk

client = MemryClient(
  api_key="mem_xxx",
  vault_password="***"
)

client.store("User prefers dark mode")`}
              </pre>
            </div>

            {/* REST */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <DatabaseZap className="w-6 h-6 text-cyan-400" />
                <h3 className="font-semibold text-lg">REST API</h3>
              </div>
              <p className="text-zinc-400 text-sm mb-4">Any platform, any language</p>
              <pre className="bg-zinc-950 rounded-lg p-4 text-sm font-mono text-zinc-300 overflow-x-auto">
{`POST /api/v1/memories
{
  "content": "encrypted...",
  "embedding": [0.1, ...],
  "type": "preference"
}

POST /api/v1/context
{ "query_embedding": [...] }`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative px-6 py-20 md:px-10">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold sm:text-4xl mb-6">
            Give your AI the memory it deserves.
          </h2>
          <p className="text-zinc-400 text-lg mb-8">
            Free to start. No credit card required. Your data stays encrypted.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            {hasClerk ? (
              <SignedOut>
                <SignInButton mode="modal">
                  <Button size="lg" className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400 text-lg px-8">
                    Start Building
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </SignInButton>
              </SignedOut>
            ) : (
              <Button asChild size="lg" className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400 text-lg px-8">
                <Link href="/dashboard">
                  Start Building
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            )}
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-lg px-8">
              <Link href="/brain">See the Brain</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative px-6 py-12 md:px-10 border-t border-zinc-800">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold">Engrm</Link>
            <span className="text-zinc-600">•</span>
            <Link href="/docs" className="text-sm text-zinc-400 hover:text-white">Docs</Link>
            <Link href="/brain" className="text-sm text-zinc-400 hover:text-white">Brain</Link>
            <a href="https://github.com/jscianna/engrm" className="text-sm text-zinc-400 hover:text-white">GitHub</a>
          </div>
          <p className="text-sm text-zinc-500">
            Built by <a href="https://web3.com" className="text-cyan-400 hover:underline">Web3.com Ventures</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
