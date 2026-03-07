"use client";

import { useEffect, useRef, useState } from "react";
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
// Neural Network Background Visualization (Light Mode)
// ============================================================================
function NeuralBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const nodesRef = useRef<
    Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      pulsePhase: number;
      connections: number[];
      color: "blue" | "teal";
    }>
  >([]);
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
      const nodeCount = Math.floor((canvas.width * canvas.height) / 30000);
      nodesRef.current = Array.from({ length: Math.min(nodeCount, 60) }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        radius: Math.random() * 3 + 2,
        pulsePhase: Math.random() * Math.PI * 2,
        connections: [],
        color: Math.random() > 0.5 ? "blue" : "teal",
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

        // Mouse attraction (gentle)
        const dx = mouse.x - node.x;
        const dy = mouse.y - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200 && dist > 50) {
          const force = (200 - dist) / 200;
          node.vx += (dx / dist) * force * 0.005;
          node.vy += (dy / dist) * force * 0.005;
        }

        // Dampen velocity
        node.vx *= 0.995;
        node.vy *= 0.995;

        // Bounce off edges with margin
        if (node.x < 50 || node.x > canvas.width - 50) node.vx *= -1;
        if (node.y < 50 || node.y > canvas.height - 50) node.vy *= -1;

        node.x = Math.max(50, Math.min(canvas.width - 50, node.x));
        node.y = Math.max(50, Math.min(canvas.height - 50, node.y));
      });

      // Draw connections (thin gray lines)
      nodes.forEach((node, i) => {
        nodes.slice(i + 1).forEach((other) => {
          const dx = other.x - node.x;
          const dy = other.y - node.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 180) {
            const opacity = (1 - dist / 180) * 0.12;
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(other.x, other.y);
            ctx.strokeStyle = `rgba(156, 163, 175, ${opacity})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });
      });

      // Draw nodes with glow
      nodes.forEach((node) => {
        const pulse = Math.sin(time * 1.5 + node.pulsePhase) * 0.4 + 0.6;
        const isBlue = node.color === "blue";

        // Soft glow
        const glowGradient = ctx.createRadialGradient(
          node.x,
          node.y,
          0,
          node.x,
          node.y,
          node.radius * 8
        );

        if (isBlue) {
          glowGradient.addColorStop(0, `rgba(0, 112, 243, ${pulse * 0.3})`);
          glowGradient.addColorStop(0.5, `rgba(0, 112, 243, ${pulse * 0.1})`);
          glowGradient.addColorStop(1, "rgba(0, 112, 243, 0)");
        } else {
          glowGradient.addColorStop(0, `rgba(0, 184, 217, ${pulse * 0.3})`);
          glowGradient.addColorStop(0.5, `rgba(0, 184, 217, ${pulse * 0.1})`);
          glowGradient.addColorStop(1, "rgba(0, 184, 217, 0)");
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * 8, 0, Math.PI * 2);
        ctx.fillStyle = glowGradient;
        ctx.fill();

        // Core node
        const coreGradient = ctx.createRadialGradient(
          node.x - node.radius * 0.3,
          node.y - node.radius * 0.3,
          0,
          node.x,
          node.y,
          node.radius
        );

        if (isBlue) {
          coreGradient.addColorStop(0, `rgba(59, 130, 246, ${pulse})`);
          coreGradient.addColorStop(1, `rgba(0, 112, 243, ${pulse * 0.8})`);
        } else {
          coreGradient.addColorStop(0, `rgba(34, 211, 238, ${pulse})`);
          coreGradient.addColorStop(1, `rgba(0, 184, 217, ${pulse * 0.8})`);
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = coreGradient;
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
      className="pointer-events-none fixed inset-0 z-0 opacity-70"
    />
  );
}

// ============================================================================
// Gradient CTA Button (Data Blue to Aero Teal)
// ============================================================================
function GradientButton({
  children,
  className = "",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      className={`relative overflow-hidden bg-gradient-to-r from-[#0070F3] to-[#00B8D9] text-white hover:from-[#0060D3] hover:to-[#00A8C9] shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 ${className}`}
      {...props}
    >
      <span className="relative z-10 flex items-center gap-2">{children}</span>
      <span className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    </Button>
  );
}

// ============================================================================
// Floating Card with Soft Shadows (No Borders)
// ============================================================================
function FloatingCard({
  children,
  className = "",
  delay = 0,
  stackOffset = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  stackOffset?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ 
        scale: 1.02, 
        y: -4,
        transition: { duration: 0.25 } 
      }}
      style={{ 
        transform: stackOffset ? `translateY(${stackOffset}px)` : undefined,
        zIndex: stackOffset ? 10 - stackOffset : 10
      }}
      className={`group relative rounded-2xl ${className}`}
    >
      {/* Card content with soft shadows */}
      <div className="relative rounded-2xl bg-[#F8F9FA] p-6 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06),0_10px_25px_-5px_rgba(0,0,0,0.08)] hover:shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1),0_4px_6px_-1px_rgba(0,0,0,0.06),0_20px_40px_-10px_rgba(0,0,0,0.12)] transition-shadow duration-300">
        {children}
      </div>
    </motion.div>
  );
}

// ============================================================================
// Command Palette UI Component (Light Mode Glassmorphism)
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
      {/* Subtle glow effect */}
      <div className="absolute -inset-4 rounded-2xl bg-gradient-to-r from-[#0070F3]/5 via-[#00B8D9]/5 to-[#0070F3]/5 blur-xl" />

      <div
        className={`relative rounded-xl ${
          focused ? "ring-2 ring-[#0070F3]/30" : ""
        } bg-white/80 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.08),0_4px_10px_rgba(0,0,0,0.04)] transition-all duration-200`}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search memories, agents, or commands..."
            className="flex-1 bg-transparent text-sm text-[#1A1A1A] placeholder:text-gray-400 outline-none"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          <div className="flex items-center gap-1">
            <Kbd className="text-xs bg-gray-100 text-gray-500 border-gray-200">
              <Command className="h-3 w-3" />
            </Kbd>
            <Kbd className="text-xs bg-gray-100 text-gray-500 border-gray-200">K</Kbd>
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
                  ? "bg-[#0070F3]/5 text-[#1A1A1A]"
                  : "text-gray-600 hover:bg-gray-50 hover:text-[#1A1A1A]"
              } cursor-pointer transition-colors`}
            >
              <item.icon className={`h-4 w-4 ${i === 0 ? "text-[#0070F3]" : ""}`} />
              <span className="flex-1">{item.label}</span>
              <span className="text-xs text-gray-400">{item.hint}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// Code Preview with Syntax Highlighting (Light Mode)
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
    keyword: "text-[#0070F3]",
    string: "text-[#00B8D9]",
    function: "text-[#7C3AED]",
    comment: "text-gray-400",
    plain: "text-[#1A1A1A]",
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
      {/* Subtle radial glow */}
      <div className="absolute -inset-8 rounded-3xl bg-gradient-to-r from-[#0070F3]/5 via-transparent to-[#00B8D9]/5 blur-2xl" />

      <div className="relative rounded-xl bg-[#1A1A1A] overflow-hidden shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)]">
        {/* Window chrome */}
        <div className="flex items-center gap-2 px-4 py-3 bg-[#2D2D2D] border-b border-[#3D3D3D]">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-[#FF5F57]" />
            <div className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
            <div className="h-3 w-3 rounded-full bg-[#28C840]" />
          </div>
          <div className="flex-1 flex justify-center">
            <span className="text-xs text-gray-400 font-mono">memory.ts</span>
          </div>
          <Terminal className="h-4 w-4 text-gray-500" />
        </div>

        {/* Code content */}
        <div className="p-4 font-mono text-sm leading-6 bg-[#1A1A1A]">
          {lines.map((line, lineIdx) => (
            <motion.div
              key={lineIdx}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 + lineIdx * 0.05 }}
              className="flex"
            >
              <span className="w-8 text-gray-600 text-right pr-4 select-none">
                {line.num}
              </span>
              <span>
                {line.tokens.map((token, tokenIdx) => (
                  <span
                    key={tokenIdx}
                    className={
                      token.type === "plain"
                        ? "text-gray-300"
                        : colorMap[token.type]
                    }
                  >
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
      iconColor: "text-[#0070F3]",
      iconBg: "bg-[#0070F3]/10",
    },
    {
      icon: Lock,
      title: "Encrypted by Default",
      description:
        "AES-256-GCM encryption at rest. Only you and your agent can read memories.",
      className: "",
      iconColor: "text-[#00B8D9]",
      iconBg: "bg-[#00B8D9]/10",
    },
    {
      icon: Zap,
      title: "Simple or Powerful",
      description:
        "Use remember() and recall() for quick integration, or the full API for complete control.",
      className: "",
      iconColor: "text-[#7C3AED]",
      iconBg: "bg-[#7C3AED]/10",
    },
    {
      icon: BarChart3,
      title: "Analytics Dashboard",
      description:
        "Built-in analytics show token savings, session success rates, and memory utilization.",
      className: "",
      iconColor: "text-[#0070F3]",
      iconBg: "bg-[#0070F3]/10",
    },
    {
      icon: Plug,
      title: "Model Agnostic",
      description:
        "Works with OpenAI, Anthropic, local models, or any LLM. REST API means no lock-in.",
      className: "",
      iconColor: "text-[#00B8D9]",
      iconBg: "bg-[#00B8D9]/10",
    },
    {
      icon: Target,
      title: "Smart Consolidation",
      description:
        "Similar memories merge automatically. No duplicates. Repeated mentions strengthen memories.",
      className: "md:col-span-2",
      iconColor: "text-[#7C3AED]",
      iconBg: "bg-[#7C3AED]/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {features.map((feature, i) => (
        <FloatingCard 
          key={feature.title} 
          className={feature.className} 
          delay={i * 0.1}
          stackOffset={i % 2 === 1 ? 8 : 0}
        >
          <div className="relative">
            <motion.div 
              className={`mb-4 inline-flex items-center justify-center rounded-xl ${feature.iconBg} p-3`}
              animate={{ y: [0, -3, 0] }}
              transition={{ 
                duration: 3, 
                repeat: Infinity, 
                ease: "easeInOut",
                delay: i * 0.2 
              }}
            >
              <feature.icon className={`h-5 w-5 ${feature.iconColor}`} />
            </motion.div>
            <h3 className="text-lg font-semibold text-[#1A1A1A] mb-2">
              {feature.title}
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              {feature.description}
            </p>
          </div>
        </FloatingCard>
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
          <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#0070F3] to-[#00B8D9] bg-clip-text text-transparent">
            {stat.value}
          </div>
          <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
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
    <div className="min-h-screen bg-white text-[#1A1A1A] overflow-x-hidden">
      {/* Neural network background */}
      <NeuralBackground />

      {/* Sticky header */}
      <motion.header
        style={{ opacity: headerOpacity }}
        className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100"
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight text-[#1A1A1A]">
            engrm
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/docs"
              className="text-sm text-gray-500 hover:text-[#1A1A1A] transition-colors"
            >
              Docs
            </Link>
            <Link
              href="/brain"
              className="text-sm text-gray-500 hover:text-[#1A1A1A] transition-colors"
            >
              Brain
            </Link>
            <a
              href="https://github.com/jscianna/engrm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-[#1A1A1A] transition-colors"
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
            className="text-xl font-semibold tracking-tight text-[#1A1A1A]"
          >
            engrm
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/docs"
              className="text-sm text-gray-500 hover:text-[#1A1A1A] transition-colors"
            >
              Docs
            </Link>
            <Link
              href="/brain"
              className="text-sm text-gray-500 hover:text-[#1A1A1A] transition-colors"
            >
              Brain
            </Link>
            <a
              href="https://github.com/jscianna/engrm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-[#1A1A1A] transition-colors"
            >
              GitHub
            </a>
            {hasClerk ? (
              <>
                <SignedOut>
                  <SignInButton mode="modal">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-gray-200 text-[#1A1A1A] hover:bg-gray-50"
                    >
                      Sign In
                    </Button>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <Button
                    asChild
                    size="sm"
                    className="bg-[#1A1A1A] text-white hover:bg-[#2D2D2D]"
                  >
                    <Link href="/dashboard">Dashboard</Link>
                  </Button>
                </SignedIn>
              </>
            ) : (
              <Button
                asChild
                size="sm"
                className="bg-[#1A1A1A] text-white hover:bg-[#2D2D2D]"
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
              className="mb-6 border-gray-200 bg-white/80 text-gray-600 backdrop-blur-sm shadow-sm"
            >
              <Sparkles className="mr-1.5 h-3 w-3 text-[#0070F3]" />
              Memory infrastructure for AI agents
            </Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl"
          >
            <span className="bg-gradient-to-b from-[#1A1A1A] via-[#2D2D2D] to-[#4A4A4A] bg-clip-text text-transparent">
              Memory that
            </span>
            <br />
            <span className="bg-gradient-to-b from-[#1A1A1A] via-[#3D3D3D] to-[#5A5A5A] bg-clip-text text-transparent">
              just works.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 leading-relaxed"
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
                    <GradientButton size="lg" className="text-base px-8">
                      Request API Key
                      <ArrowRight className="h-4 w-4" />
                    </GradientButton>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <GradientButton size="lg" className="text-base px-8" asChild>
                    <Link href="/dashboard">
                      Open Dashboard
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </GradientButton>
                </SignedIn>
              </>
            ) : (
              <GradientButton size="lg" className="text-base px-8" asChild>
                <Link href="/dashboard">
                  Request API Key
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </GradientButton>
            )}
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-gray-200 bg-white text-[#1A1A1A] hover:bg-gray-50 shadow-sm"
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
            <h2 className="text-2xl font-semibold text-[#1A1A1A] mb-3">
              Lightning-fast search
            </h2>
            <p className="text-gray-500">
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
            <h2 className="text-2xl font-semibold text-[#1A1A1A] mb-3">
              Simple, powerful API
            </h2>
            <p className="text-gray-500">
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
            <h2 className="text-3xl font-semibold text-[#1A1A1A] mb-4">
              Built for production
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              Everything you need to give your agents persistent, intelligent
              memory.
            </p>
          </motion.div>
          <BentoGrid />
        </div>
      </section>

      {/* How it Works */}
      <section className="relative z-10 px-6 py-24 bg-[#F8F9FA]">
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-semibold text-[#1A1A1A] mb-4">
              How it works
            </h2>
            <p className="text-gray-500">
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
                color: "text-[#0070F3]",
                bgColor: "bg-[#0070F3]/10",
              },
              {
                step: "02",
                title: "Conversation Flows",
                description:
                  "Your agent responds with full context. New insights are captured as the conversation unfolds.",
                icon: GitBranch,
                color: "text-[#00B8D9]",
                bgColor: "bg-[#00B8D9]/10",
              },
              {
                step: "03",
                title: "End & Learn",
                description:
                  "Session ends. Learnings are stored, consolidated, and strengthened for next time.",
                icon: Shield,
                color: "text-[#7C3AED]",
                bgColor: "bg-[#7C3AED]/10",
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
                <motion.div 
                  className={`mb-6 mx-auto inline-flex h-14 w-14 items-center justify-center rounded-xl ${item.bgColor}`}
                  animate={{ y: [0, -4, 0] }}
                  transition={{ 
                    duration: 3, 
                    repeat: Infinity, 
                    ease: "easeInOut",
                    delay: i * 0.3 
                  }}
                >
                  <item.icon className={`h-6 w-6 ${item.color}`} />
                </motion.div>
                <div className="text-5xl font-bold text-gray-200 mb-3">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-[#1A1A1A] mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">
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
            className="text-3xl font-semibold text-[#1A1A1A] mb-4"
          >
            Ready to give your agents memory?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-gray-500 mb-10"
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
                  <GradientButton size="lg" className="text-base px-8">
                    Request API Key
                    <ArrowRight className="h-4 w-4" />
                  </GradientButton>
                </SignInButton>
              </SignedOut>
            ) : (
              <GradientButton size="lg" className="text-base px-8" asChild>
                <Link href="/dashboard">
                  Request API Key
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </GradientButton>
            )}
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-gray-200 bg-white text-[#1A1A1A] hover:bg-gray-50 shadow-sm"
            >
              <Link href="/docs">Read the Docs</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-100 px-6 py-12 bg-[#F8F9FA]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-semibold text-[#1A1A1A]">
              engrm
            </Link>
            <span className="text-gray-300">|</span>
            <Link
              href="/docs"
              className="text-sm text-gray-500 hover:text-[#1A1A1A]"
            >
              Docs
            </Link>
            <Link
              href="/brain"
              className="text-sm text-gray-500 hover:text-[#1A1A1A]"
            >
              Brain
            </Link>
            <a
              href="https://github.com/jscianna/engrm"
              className="text-sm text-gray-500 hover:text-[#1A1A1A]"
            >
              GitHub
            </a>
          </div>
          <p className="text-sm text-gray-400">
            Built by{" "}
            <a
              href="https://x.com/scianna"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-[#1A1A1A] transition-colors"
            >
              John Scianna
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
