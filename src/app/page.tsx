"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  Brain,
  BarChart3,
  Lock,
  Zap,
  Plug,
  Target,
  Search,
  Sparkles,
  Command,
  GitBranch,
  Layers,
  Shield,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";

// ============================================================================
// Neural Network Background Visualization
// ============================================================================
function NeuralBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const nodesRef = useRef<Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    pulsePhase: number;
    connections: number[];
  }>>([]);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initNodes();
    };

    const initNodes = () => {
      const nodeCount = Math.floor((canvas.width * canvas.height) / 25000);
      nodesRef.current = Array.from({ length: Math.min(nodeCount, 80) }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 2 + 1,
        pulsePhase: Math.random() * Math.PI * 2,
        connections: [],
      }));
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const animate = () => {
      if (!ctx || !canvas) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const nodes = nodesRef.current;
      const time = Date.now() * 0.001;
      const mouse = mouseRef.current;

      // Update node positions
      nodes.forEach((node) => {
        node.x += node.vx;
        node.y += node.vy;

        // Mouse repulsion
        const dx = node.x - mouse.x;
        const dy = node.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          const force = (150 - dist) / 150;
          node.vx += (dx / dist) * force * 0.02;
          node.vy += (dy / dist) * force * 0.02;
        }

        // Dampen velocity
        node.vx *= 0.99;
        node.vy *= 0.99;

        // Bounce off edges
        if (node.x < 0 || node.x > canvas.width) node.vx *= -1;
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1;

        node.x = Math.max(0, Math.min(canvas.width, node.x));
        node.y = Math.max(0, Math.min(canvas.height, node.y));
      });

      // Draw connections
      nodes.forEach((node, i) => {
        nodes.slice(i + 1).forEach((other) => {
          const dx = other.x - node.x;
          const dy = other.y - node.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 200) {
            const opacity = (1 - dist / 200) * 0.15;
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(other.x, other.y);
            ctx.strokeStyle = `rgba(148, 163, 184, ${opacity})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });

      // Draw nodes
      nodes.forEach((node) => {
        const pulse = Math.sin(time * 2 + node.pulsePhase) * 0.3 + 0.7;
        const gradient = ctx.createRadialGradient(
          node.x,
          node.y,
          0,
          node.x,
          node.y,
          node.radius * 3
        );
        gradient.addColorStop(0, `rgba(226, 232, 240, ${pulse * 0.8})`);
        gradient.addColorStop(0.5, `rgba(148, 163, 184, ${pulse * 0.3})`);
        gradient.addColorStop(1, "rgba(148, 163, 184, 0)");

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * 3, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(241, 245, 249, ${pulse})`;
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouseMove);
    animate();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 opacity-60"
    />
  );
}

// ============================================================================
// Shimmer Button
// ============================================================================
function ShimmerButton({
  children,
  className = "",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      className={`relative overflow-hidden bg-slate-50 text-slate-900 hover:bg-white ${className}`}
      {...props}
    >
      <span className="relative z-10 flex items-center gap-2">{children}</span>
      <span className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </Button>
  );
}

// ============================================================================
// Glow Card (Border Beam Effect)
// ============================================================================
function GlowCard({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
      className={`group relative rounded-xl ${className}`}
    >
      {/* Animated border beam */}
      <div className="pointer-events-none absolute -inset-px rounded-xl overflow-hidden">
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-slate-400/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div
          className="absolute h-px w-1/3 bg-gradient-to-r from-transparent via-slate-300/80 to-transparent animate-[border-beam_4s_linear_infinite]"
          style={{ animationDelay: `${delay}s` }}
        />
      </div>
      {/* Card content */}
      <div className="relative rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-6">
        {children}
      </div>
    </motion.div>
  );
}

// ============================================================================
// Command Palette UI Component
// ============================================================================
function CommandPalettePreview() {
  const [focused, setFocused] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="relative mx-auto max-w-xl"
    >
      {/* Glow effect */}
      <div className="absolute -inset-4 rounded-2xl bg-gradient-to-r from-slate-500/10 via-slate-400/5 to-slate-500/10 blur-xl" />

      <div
        className={`relative rounded-xl border ${
          focused ? "border-slate-600" : "border-slate-800"
        } bg-slate-900/80 backdrop-blur-md shadow-2xl transition-colors duration-200`}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search memories, agents, or commands..."
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-500 outline-none"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          <div className="flex items-center gap-1">
            <Kbd className="text-xs">
              <Command className="h-3 w-3" />
            </Kbd>
            <Kbd className="text-xs">K</Kbd>
          </div>
        </div>
        <div className="p-2">
          {[
            { icon: Brain, label: "Recent Memories", hint: "3 items" },
            { icon: Sparkles, label: "Active Sessions", hint: "2 running" },
            { icon: GitBranch, label: "Memory Graph", hint: "View" },
          ].map((item, i) => (
            <div
              key={item.label}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                i === 0
                  ? "bg-slate-800/50 text-slate-200"
                  : "text-slate-400 hover:bg-slate-800/30 hover:text-slate-200"
              } cursor-pointer transition-colors`}
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              <span className="text-xs text-slate-600">{item.hint}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// Code Preview with Syntax Highlighting
// ============================================================================
function CodePreview() {
  const codeLines = [
    { line: 1, content: "import", type: "keyword" },
    { line: 1, content: " { Engrm } ", type: "plain" },
    { line: 1, content: "from", type: "keyword" },
    { line: 1, content: " ", type: "plain" },
    { line: 1, content: "'@engrm/sdk'", type: "string" },
    { line: 2, content: "", type: "plain" },
    { line: 3, content: "const", type: "keyword" },
    { line: 3, content: " engrm = ", type: "plain" },
    { line: 3, content: "new", type: "keyword" },
    { line: 3, content: " ", type: "plain" },
    { line: 3, content: "Engrm", type: "function" },
    { line: 3, content: "()", type: "plain" },
    { line: 4, content: "", type: "plain" },
    { line: 5, content: "// Store a memory", type: "comment" },
    { line: 6, content: "await", type: "keyword" },
    { line: 6, content: " engrm.", type: "plain" },
    { line: 6, content: "remember", type: "function" },
    { line: 6, content: "(", type: "plain" },
    { line: 6, content: "'User prefers dark mode'", type: "string" },
    { line: 6, content: ")", type: "plain" },
    { line: 7, content: "", type: "plain" },
    { line: 8, content: "// Recall relevant context", type: "comment" },
    { line: 9, content: "const", type: "keyword" },
    { line: 9, content: " context = ", type: "plain" },
    { line: 9, content: "await", type: "keyword" },
    { line: 9, content: " engrm.", type: "plain" },
    { line: 9, content: "recall", type: "function" },
    { line: 9, content: "(", type: "plain" },
    { line: 9, content: "'theme settings'", type: "string" },
    { line: 9, content: ")", type: "plain" },
    { line: 10, content: "", type: "plain" },
    { line: 11, content: "// Returns: ['User prefers dark mode']", type: "comment" },
  ];

  const colorMap: Record<string, string> = {
    keyword: "text-rose-400",
    string: "text-emerald-400",
    function: "text-amber-300",
    comment: "text-slate-500",
    plain: "text-slate-300",
  };

  // Group by line
  const lines: Array<{ num: number; tokens: typeof codeLines }> = [];
  codeLines.forEach((token) => {
    const existing = lines.find((l) => l.num === token.line);
    if (existing) {
      existing.tokens.push(token);
    } else {
      lines.push({ num: token.line, tokens: [token] });
    }
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="relative mx-auto max-w-2xl"
    >
      {/* Radial glow */}
      <div className="absolute -inset-8 rounded-3xl bg-gradient-radial from-slate-500/10 via-transparent to-transparent blur-2xl" />

      <div className="relative rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl">
        {/* Window chrome */}
        <div className="flex items-center gap-2 px-4 py-3 bg-slate-900/50 border-b border-slate-800">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500/80" />
            <div className="h-3 w-3 rounded-full bg-amber-500/80" />
            <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
          </div>
          <div className="flex-1 flex justify-center">
            <span className="text-xs text-slate-500 font-mono">memory.ts</span>
          </div>
          <Terminal className="h-4 w-4 text-slate-600" />
        </div>

        {/* Code content */}
        <div className="p-4 font-mono text-sm leading-6">
          {lines.map((line, lineIdx) => (
            <motion.div
              key={lineIdx}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 + lineIdx * 0.05 }}
              className="flex"
            >
              <span className="w-8 text-slate-600 text-right pr-4 select-none">
                {line.num}
              </span>
              <span>
                {line.tokens.map((token, tokenIdx) => (
                  <span key={tokenIdx} className={colorMap[token.type]}>
                    {token.content}
                  </span>
                ))}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// Bento Grid Feature Section
// ============================================================================
function BentoGrid() {
  const features = [
    {
      icon: Brain,
      title: "Tiered Intelligence",
      description:
        "Critical memories always available. High-importance on demand. Normal retrieved when relevant.",
      className: "md:col-span-2",
      gradient: "from-rose-500/20 via-transparent to-transparent",
    },
    {
      icon: Lock,
      title: "Encrypted by Default",
      description:
        "AES-256-GCM encryption at rest. Only you and your agent can read memories.",
      className: "",
      gradient: "from-emerald-500/20 via-transparent to-transparent",
    },
    {
      icon: Zap,
      title: "Simple or Powerful",
      description:
        "Use remember() and recall() for quick integration, or the full API for complete control.",
      className: "",
      gradient: "from-amber-500/20 via-transparent to-transparent",
    },
    {
      icon: BarChart3,
      title: "Analytics Dashboard",
      description:
        "Built-in analytics show token savings, session success rates, and memory utilization.",
      className: "",
      gradient: "from-blue-500/20 via-transparent to-transparent",
    },
    {
      icon: Plug,
      title: "Model Agnostic",
      description:
        "Works with OpenAI, Anthropic, local models, or any LLM. REST API means no lock-in.",
      className: "",
      gradient: "from-violet-500/20 via-transparent to-transparent",
    },
    {
      icon: Target,
      title: "Smart Consolidation",
      description:
        "Similar memories merge automatically. No duplicates. Repeated mentions strengthen memories.",
      className: "md:col-span-2",
      gradient: "from-cyan-500/20 via-transparent to-transparent",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {features.map((feature, i) => (
        <GlowCard key={feature.title} className={feature.className} delay={i * 0.1}>
          {/* Radial gradient glow */}
          <div
            className={`absolute -inset-4 rounded-xl bg-gradient-radial ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl`}
          />
          <div className="relative">
            <div className="mb-4 inline-flex items-center justify-center rounded-lg bg-slate-800/50 p-2.5">
              <feature.icon className="h-5 w-5 text-slate-300" />
            </div>
            <h3 className="text-lg font-semibold text-slate-100 mb-2">
              {feature.title}
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              {feature.description}
            </p>
          </div>
        </GlowCard>
      ))}
    </div>
  );
}

// ============================================================================
// Stats Section
// ============================================================================
function Stats() {
  const stats = [
    { value: "70%", label: "Token Savings" },
    { value: "<50ms", label: "Retrieval Time" },
    { value: "256-bit", label: "Encryption" },
    { value: "99.9%", label: "Uptime" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.1 }}
          className="text-center"
        >
          <div className="text-3xl md:text-4xl font-bold bg-gradient-to-b from-slate-100 to-slate-400 bg-clip-text text-transparent">
            {stat.value}
          </div>
          <div className="text-sm text-slate-500 mt-1">{stat.label}</div>
        </motion.div>
      ))}
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================
export default function Home() {
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const { scrollYProgress } = useScroll();
  const headerOpacity = useTransform(scrollYProgress, [0, 0.1], [0, 1]);

  const fadeInUp = {
    initial: { opacity: 0, y: 30 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6 },
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden">
      {/* Neural network background */}
      <NeuralBackground />

      {/* Gradient orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute -left-1/4 -top-1/4 h-[800px] w-[800px] rounded-full bg-slate-800/30 blur-[120px]" />
        <div className="absolute -right-1/4 top-1/4 h-[600px] w-[600px] rounded-full bg-slate-700/20 blur-[100px]" />
      </div>

      {/* Sticky header */}
      <motion.header
        style={{ opacity: headerOpacity }}
        className="fixed top-0 left-0 right-0 z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-md"
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            engrm
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/docs"
              className="text-sm text-slate-400 hover:text-slate-100 transition-colors"
            >
              Docs
            </Link>
            <Link
              href="/brain"
              className="text-sm text-slate-400 hover:text-slate-100 transition-colors"
            >
              Brain
            </Link>
            <a
              href="https://github.com/jscianna/engrm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-slate-400 hover:text-slate-100 transition-colors"
            >
              GitHub
            </a>
          </nav>
        </div>
      </motion.header>

      {/* Top nav (visible at top) */}
      <header className="relative z-40 px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link
            href="/"
            className="text-xl font-semibold tracking-tight text-slate-100"
          >
            engrm
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/docs"
              className="text-sm text-slate-400 hover:text-slate-100 transition-colors"
            >
              Docs
            </Link>
            <Link
              href="/brain"
              className="text-sm text-slate-400 hover:text-slate-100 transition-colors"
            >
              Brain
            </Link>
            <a
              href="https://github.com/jscianna/engrm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-slate-400 hover:text-slate-100 transition-colors"
            >
              GitHub
            </a>
            {hasClerk ? (
              <>
                <SignedOut>
                  <SignInButton mode="modal">
                    <Button
                      size="sm"
                      className="bg-slate-100 text-slate-900 hover:bg-white"
                    >
                      Sign In
                    </Button>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <Button
                    asChild
                    size="sm"
                    className="bg-slate-100 text-slate-900 hover:bg-white"
                  >
                    <Link href="/dashboard">Dashboard</Link>
                  </Button>
                </SignedIn>
              </>
            ) : (
              <Button
                asChild
                size="sm"
                className="bg-slate-100 text-slate-900 hover:bg-white"
              >
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative px-6 pt-20 pb-32 md:pt-32 md:pb-40">
        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <motion.div {...fadeInUp}>
            <Badge
              variant="outline"
              className="mb-6 border-slate-700 bg-slate-900/50 text-slate-300 backdrop-blur-sm"
            >
              <Sparkles className="mr-1.5 h-3 w-3" />
              Memory infrastructure for AI agents
            </Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl"
          >
            <span className="bg-gradient-to-b from-slate-100 via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Memory that
            </span>
            <br />
            <span className="bg-gradient-to-b from-slate-100 via-slate-300 to-slate-500 bg-clip-text text-transparent">
              just works.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-6 max-w-2xl text-lg text-slate-400 leading-relaxed"
          >
            Your agent recalls what matters, stores what&apos;s important, and
            gets smarter over time. No manual context management required.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-wrap justify-center gap-4"
          >
            {hasClerk ? (
              <>
                <SignedOut>
                  <SignInButton mode="modal">
                    <ShimmerButton size="lg" className="text-base px-8">
                      Get Started
                      <ArrowRight className="h-4 w-4" />
                    </ShimmerButton>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <ShimmerButton size="lg" className="text-base px-8" asChild>
                    <Link href="/dashboard">
                      Open Dashboard
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </ShimmerButton>
                </SignedIn>
              </>
            ) : (
              <ShimmerButton size="lg" className="text-base px-8" asChild>
                <Link href="/dashboard">
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </ShimmerButton>
            )}
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-slate-100"
            >
              <Link href="/docs">View Documentation</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative z-10 px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <Stats />
        </div>
      </section>

      {/* Command Palette Preview */}
      <section className="relative z-10 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl font-semibold text-slate-100 mb-3">
              Lightning-fast search
            </h2>
            <p className="text-slate-400">
              Find any memory, session, or agent in milliseconds
            </p>
          </motion.div>
          <CommandPalettePreview />
        </div>
      </section>

      {/* Code Preview Section */}
      <section className="relative z-10 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl font-semibold text-slate-100 mb-3">
              Simple, powerful API
            </h2>
            <p className="text-slate-400">
              Two functions to get started. Full control when you need it.
            </p>
          </motion.div>
          <CodePreview />
        </div>
      </section>

      {/* Features Bento Grid */}
      <section className="relative z-10 px-6 py-24" id="features">
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-semibold text-slate-100 mb-4">
              Built for production
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Everything you need to give your agents persistent, intelligent
              memory.
            </p>
          </motion.div>
          <BentoGrid />
        </div>
      </section>

      {/* How it Works */}
      <section className="relative z-10 px-6 py-24 bg-slate-900/30">
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-semibold text-slate-100 mb-4">
              How it works
            </h2>
            <p className="text-slate-400">
              Three steps to intelligent memory
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Start Session",
                description:
                  "Initialize with the first message. Relevant memories are automatically retrieved and injected.",
                icon: Layers,
              },
              {
                step: "02",
                title: "Conversation Flows",
                description:
                  "Your agent responds with full context. New insights are captured as the conversation unfolds.",
                icon: GitBranch,
              },
              {
                step: "03",
                title: "End & Learn",
                description:
                  "Session ends. Learnings are stored, consolidated, and strengthened for next time.",
                icon: Shield,
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="relative text-center"
              >
                <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50">
                  <item.icon className="h-6 w-6 text-slate-300" />
                </div>
                <div className="text-5xl font-bold text-slate-800 mb-3">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-slate-100 mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 px-6 py-32">
        <div className="mx-auto max-w-3xl text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl font-semibold text-slate-100 mb-4"
          >
            Ready to give your agents memory?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-slate-400 mb-10"
          >
            Start building intelligent agents that learn from every
            conversation.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="flex flex-wrap justify-center gap-4"
          >
            {hasClerk ? (
              <SignedOut>
                <SignInButton mode="modal">
                  <ShimmerButton size="lg" className="text-base px-8">
                    Get Started
                    <ArrowRight className="h-4 w-4" />
                  </ShimmerButton>
                </SignInButton>
              </SignedOut>
            ) : (
              <ShimmerButton size="lg" className="text-base px-8" asChild>
                <Link href="/dashboard">
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </ShimmerButton>
            )}
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-slate-100"
            >
              <Link href="/docs">Read the Docs</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/50 px-6 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-semibold text-slate-100">
              engrm
            </Link>
            <span className="text-slate-700">·</span>
            <Link
              href="/docs"
              className="text-sm text-slate-400 hover:text-slate-100"
            >
              Docs
            </Link>
            <Link
              href="/brain"
              className="text-sm text-slate-400 hover:text-slate-100"
            >
              Brain
            </Link>
            <a
              href="https://github.com/jscianna/engrm"
              className="text-sm text-slate-400 hover:text-slate-100"
            >
              GitHub
            </a>
          </div>
          <p className="text-sm text-slate-500">
            Built by{" "}
            <a
              href="https://x.com/scianna"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-slate-100 transition-colors"
            >
              John Scianna
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
