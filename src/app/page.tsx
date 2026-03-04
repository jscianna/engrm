"use client";

import { useState } from "react";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import {
  ArrowRight,
  Brain,
  BarChart3,
  Lock,
  Zap,
  Plug,
  Target,
  MessageSquare,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";

export default function Home() {
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  // Token calculator state
  const [memoriesStored, setMemoriesStored] = useState(100);
  const [avgMemorySize, setAvgMemorySize] = useState(150);
  const [sessionsPerDay, setSessionsPerDay] = useState(20);

  // Calculate token savings
  const tokensWithoutEngrm = memoriesStored * avgMemorySize * sessionsPerDay;
  const avgRelevantMemories = Math.min(10, memoriesStored * 0.1);
  const criticalMemories = Math.min(5, memoriesStored * 0.05);
  const tokensWithEngrm = (avgRelevantMemories + criticalMemories) * avgMemorySize * sessionsPerDay;
  const savingsPercent = Math.round((1 - tokensWithEngrm / tokensWithoutEngrm) * 100);

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

      {/* Hero */}
      <section className="relative px-6 pt-16 pb-20 md:px-10 lg:pt-24 lg:pb-28">
        <div className="mx-auto max-w-6xl">
          <div className="text-center space-y-6 max-w-3xl mx-auto">
            <Badge className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
              Memory Infrastructure for AI
            </Badge>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              The cognitive<br />
              <span className="text-cyan-400">layer.</span>
            </h1>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              Memory infrastructure for AI agents. Every conversation builds on the last.
            </p>
            <div className="flex flex-wrap gap-4 justify-center pt-4">
              {hasClerk ? (
                <>
                  <SignedOut>
                    <SignInButton mode="modal">
                      <Button size="lg" className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400 text-lg px-8">
                        Get Started
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
                    Get Started
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              )}
              <Button asChild size="lg" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-lg px-8">
                <Link href="/docs">View Docs</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Problem / Solution */}
      <section className="relative px-6 py-16 md:px-10 bg-zinc-900/30">
        <div className="mx-auto max-w-5xl">
          <div className="grid md:grid-cols-2 gap-12">
            {/* The Problem */}
            <div>
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                  <span className="text-red-400 text-lg">✗</span>
                </span>
                The Problem
              </h2>
              <div className="space-y-4 text-zinc-400">
                <p className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  <span><strong className="text-zinc-300">Agents forget.</strong> Every session starts from zero. Users repeat themselves endlessly.</span>
                </p>
                <p className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  <span><strong className="text-zinc-300">Context windows overflow.</strong> Loading all history wastes tokens and money.</span>
                </p>
                <p className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  <span><strong className="text-zinc-300">No learning.</strong> Conversations don't compound into better experiences.</span>
                </p>
              </div>
            </div>

            {/* The Solution */}
            <div>
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                  <span className="text-cyan-400 text-lg">✓</span>
                </span>
                The Solution
              </h2>
              <div className="space-y-4 text-zinc-400">
                <p className="flex items-start gap-3">
                  <span className="text-cyan-400 mt-1">•</span>
                  <span><strong className="text-zinc-300">Persistent memory.</strong> Important things stick across sessions. Forever.</span>
                </p>
                <p className="flex items-start gap-3">
                  <span className="text-cyan-400 mt-1">•</span>
                  <span><strong className="text-zinc-300">Smart retrieval.</strong> Only inject relevant context. Save 70%+ on tokens.</span>
                </p>
                <p className="flex items-start gap-3">
                  <span className="text-cyan-400 mt-1">•</span>
                  <span><strong className="text-zinc-300">Continuous learning.</strong> Every conversation makes your agent smarter.</span>
                </p>
              </div>
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
              Three simple steps. Memory that grows with every conversation.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto mb-6">
                <MessageSquare className="w-8 h-8 text-cyan-400" />
              </div>
              <div className="text-4xl font-bold text-cyan-400 mb-2">1</div>
              <h3 className="text-xl font-semibold mb-2">Start Session</h3>
              <p className="text-zinc-400">
                Call <code className="text-cyan-400 bg-zinc-900 px-1.5 py-0.5 rounded text-sm">/sessions/start</code> with 
                the first message. Get relevant context injected automatically.
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto mb-6">
                <Search className="w-8 h-8 text-cyan-400" />
              </div>
              <div className="text-4xl font-bold text-cyan-400 mb-2">2</div>
              <h3 className="text-xl font-semibold mb-2">Conversation Flows</h3>
              <p className="text-zinc-400">
                Your agent responds with full context. Memories are tracked automatically as the conversation unfolds.
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto mb-6">
                <Sparkles className="w-8 h-8 text-cyan-400" />
              </div>
              <div className="text-4xl font-bold text-cyan-400 mb-2">3</div>
              <h3 className="text-xl font-semibold mb-2">End & Learn</h3>
              <p className="text-zinc-400">
                End the session. New learnings are stored, strengthened, and ready for next time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="relative px-6 py-20 md:px-10 bg-zinc-900/30" id="features">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold sm:text-4xl mb-4">Built for Production</h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              Everything you need to give your agents real memory.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mb-4">
                  <Brain className="w-6 h-6 text-purple-400" />
                </div>
                <CardTitle className="text-lg">🧠 Tiered Intelligence</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-400 text-sm">
                  Critical memories always available. High-importance on demand. 
                  Normal retrieved when relevant.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-4">
                  <Lock className="w-6 h-6 text-cyan-400" />
                </div>
                <CardTitle className="text-lg">🔒 Encrypted by Default</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-400 text-sm">
                  AES-256-GCM encryption at rest. Only you and your agent can read 
                  the memories. Protected against breaches.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4">
                  <BarChart3 className="w-6 h-6 text-emerald-400" />
                </div>
                <CardTitle className="text-lg">📊 Prove Your Value</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-400 text-sm">
                  Built-in analytics show token savings, session success rates, 
                  and memory utilization.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4">
                  <Zap className="w-6 h-6 text-amber-400" />
                </div>
                <CardTitle className="text-lg">⚡ Simple or Powerful</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-400 text-sm">
                  Use <code className="text-cyan-400 text-xs">remember()</code> and <code className="text-cyan-400 text-xs">recall()</code> for 
                  quick integration, or the full API for complete control.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-4">
                  <Plug className="w-6 h-6 text-blue-400" />
                </div>
                <CardTitle className="text-lg">🔌 Model Agnostic</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-400 text-sm">
                  Works with OpenAI, Anthropic, local models, or any LLM. 
                  REST API means no lock-in.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-4">
                  <Target className="w-6 h-6 text-rose-400" />
                </div>
                <CardTitle className="text-lg">🎯 Smart Consolidation</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-400 text-sm">
                  Similar memories merge automatically. No duplicates. 
                  Repeated mentions strengthen existing memories.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Token Savings Calculator */}
      <section className="relative px-6 py-20 md:px-10" id="calculator">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold sm:text-4xl mb-4">Token Savings Calculator</h2>
            <p className="text-zinc-400 text-lg">
              See how much you'll save by loading only relevant context.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
            <div className="grid md:grid-cols-3 gap-8 mb-8">
              {/* Memories Stored */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-3">
                  Memories Stored: <span className="text-cyan-400">{memoriesStored}</span>
                </label>
                <Slider
                  value={[memoriesStored]}
                  onValueChange={([value]) => setMemoriesStored(value)}
                  min={10}
                  max={1000}
                  step={10}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-zinc-500 mt-1">
                  <span>10</span>
                  <span>1000</span>
                </div>
              </div>

              {/* Avg Memory Size */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-3">
                  Avg Memory Size: <span className="text-cyan-400">{avgMemorySize} tokens</span>
                </label>
                <Slider
                  value={[avgMemorySize]}
                  onValueChange={([value]) => setAvgMemorySize(value)}
                  min={50}
                  max={500}
                  step={10}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-zinc-500 mt-1">
                  <span>50</span>
                  <span>500</span>
                </div>
              </div>

              {/* Sessions Per Day */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-3">
                  Sessions/Day: <span className="text-cyan-400">{sessionsPerDay}</span>
                </label>
                <Slider
                  value={[sessionsPerDay]}
                  onValueChange={([value]) => setSessionsPerDay(value)}
                  min={1}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-zinc-500 mt-1">
                  <span>1</span>
                  <span>100</span>
                </div>
              </div>
            </div>

            {/* Results */}
            <div className="grid md:grid-cols-3 gap-6 pt-6 border-t border-zinc-800">
              <div className="text-center">
                <p className="text-sm text-zinc-500 mb-1">Without Engrm</p>
                <p className="text-2xl font-bold text-red-400">
                  {(tokensWithoutEngrm / 1000).toFixed(0)}k
                  <span className="text-sm text-zinc-500 font-normal"> tokens/day</span>
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-zinc-500 mb-1">With Engrm</p>
                <p className="text-2xl font-bold text-emerald-400">
                  {(tokensWithEngrm / 1000).toFixed(0)}k
                  <span className="text-sm text-zinc-500 font-normal"> tokens/day</span>
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-zinc-500 mb-1">Savings</p>
                <p className="text-2xl font-bold text-cyan-400">
                  {savingsPercent}%
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Code Example */}
      <section className="relative px-6 py-20 md:px-10 bg-zinc-900/30">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold sm:text-4xl mb-4">Simple Integration</h2>
            <p className="text-zinc-400 text-lg">
              Get started in minutes with our Python SDK.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-sm text-zinc-500 ml-2">agent.py</span>
            </div>
            <pre className="p-6 overflow-x-auto text-sm">
              <code className="text-zinc-300 font-mono">{`import requests

API_KEY = "mem_your_api_key"
BASE = "https://engrm.xyz/api/v1"

def headers():
    return {"Authorization": f"Bearer {API_KEY}"}

# Start session → get relevant context
session = requests.post(f"{BASE}/sessions/start", 
    headers=headers(),
    json={"firstMessage": "Help me with my project"}
).json()

print(f"Context loaded: {session['stats']['tokensInjected']} tokens")
# "Context loaded: 156 tokens"

# Your agent responds with full context awareness...
# After the conversation:

# Store what you learned
requests.post(f"{BASE}/simple/remember",
    headers=headers(), 
    json={"text": "User prefers REST over GraphQL"}
)

# End session
requests.post(f"{BASE}/sessions/{session['sessionId']}/end",
    headers=headers(),
    json={"outcome": "success"}
)`}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="relative px-6 py-20 md:px-10" id="pricing">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold sm:text-4xl mb-4">Simple Pricing</h2>
            <p className="text-zinc-400 text-lg">
              Start free, scale when you need to.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto">
            {/* Free */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
              <h3 className="text-xl font-bold mb-2">Free</h3>
              <p className="text-zinc-400 text-sm mb-6">Perfect for getting started</p>
              <p className="text-4xl font-bold mb-6">$0</p>
              <ul className="space-y-3 text-sm text-zinc-400 mb-8">
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span>
                  1,000 memories
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span>
                  10,000 searches/month
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span>
                  Full API access
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span>
                  Encryption included
                </li>
              </ul>
              {hasClerk ? (
                <SignedOut>
                  <SignInButton mode="modal">
                    <Button className="w-full" variant="outline">
                      Get Started Free
                    </Button>
                  </SignInButton>
                </SignedOut>
              ) : (
                <Button asChild className="w-full" variant="outline">
                  <Link href="/dashboard">Get Started Free</Link>
                </Button>
              )}
            </div>

            {/* Pro */}
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-8 relative">
              <Badge className="absolute -top-3 left-8 bg-cyan-500 text-zinc-950">Coming Soon</Badge>
              <h3 className="text-xl font-bold mb-2">Pro</h3>
              <p className="text-zinc-400 text-sm mb-6">For production agents</p>
              <p className="text-4xl font-bold mb-6">$29<span className="text-lg font-normal text-zinc-500">/mo</span></p>
              <ul className="space-y-3 text-sm text-zinc-400 mb-8">
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span>
                  Unlimited memories
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span>
                  Unlimited searches
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span>
                  Advanced analytics
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span>
                  Priority support
                </li>
              </ul>
              <Button className="w-full bg-cyan-500 text-zinc-950 hover:bg-cyan-400" disabled>
                Coming Soon
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative px-6 py-24 md:px-10 bg-gradient-to-b from-zinc-950 to-zinc-900">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold sm:text-4xl mb-6">
            Ready to give your agents memory?
          </h2>
          <p className="text-zinc-400 text-lg mb-8">
            Start building intelligent agents that learn from every conversation.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            {hasClerk ? (
              <SignedOut>
                <SignInButton mode="modal">
                  <Button size="lg" className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400 text-lg px-8">
                    Get Started
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </SignInButton>
              </SignedOut>
            ) : (
              <Button asChild size="lg" className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400 text-lg px-8">
                <Link href="/dashboard">
                  Get Started
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            )}
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-lg px-8">
              <Link href="/docs">Read the Docs</Link>
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
            Built by <a href="https://x.com/scianna" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">John Scianna</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
