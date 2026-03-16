"use client";

import { useState } from "react";
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
  Menu,
  X,
  Check,
  Star,
  Cloud,
  HardDrive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";

// ============================================================================
// Premium Gradient CTA Button (Data Blue to Aero Teal)
// ============================================================================
function GradientButton({
  children,
  className = "",
  asChild,
  ...props
}: React.ComponentProps<typeof Button> & { asChild?: boolean }) {
  // When used with asChild (e.g., wrapping Link), render simpler structure
  if (asChild) {
    return (
      <Button
        asChild
        className={`relative overflow-hidden bg-gradient-to-r from-[#0070F3] to-[#00B8D9] text-white font-medium hover:from-[#0060D3] hover:to-[#00A8C9] shadow-[0_4px_14px_0_rgba(0,112,243,0.39)] hover:shadow-[0_6px_20px_rgba(0,118,255,0.4)] transition-all duration-300 ${className}`}
        {...props}
      >
        {children}
      </Button>
    );
  }
  
  return (
    <Button
      className={`relative overflow-hidden bg-gradient-to-r from-[#0070F3] to-[#00B8D9] text-white font-medium hover:from-[#0060D3] hover:to-[#00A8C9] shadow-[0_4px_14px_0_rgba(0,112,243,0.39)] hover:shadow-[0_6px_20px_rgba(0,118,255,0.4)] transition-all duration-300 ${className}`}
      {...props}
    >
      <span className="relative z-10 flex items-center gap-2">{children}</span>
      <span className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent" />
    </Button>
  );
}

// ============================================================================
// Premium Floating Card with Layered Shadows
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
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
      whileHover={{ 
        y: -6,
        transition: { duration: 0.3, ease: "easeOut" } 
      }}
      style={{ 
        transform: stackOffset ? `translateY(${stackOffset}px)` : undefined,
        zIndex: stackOffset ? 10 - stackOffset : 10
      }}
      className={`group relative h-full ${className}`}
    >
      <div className="relative rounded-2xl bg-white p-6 border border-[#E5E7EB] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08),0_8px_32px_rgba(0,0,0,0.06)] hover:border-[#D1D5DB] transition-all duration-300 h-full">
        {children}
      </div>
    </motion.div>
  );
}

// ============================================================================
// Command Palette UI Component (Premium Light Glassmorphism)
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
      <div
        className={`relative rounded-2xl overflow-hidden ${
          focused ? "ring-2 ring-[#0070F3]/20" : ""
        } bg-white border border-[#E5E7EB] shadow-[0_4px_24px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-200`}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#F3F4F6]">
          <Search className="h-4 w-4 text-[#9CA3AF]" />
          <input
            type="text"
            placeholder="What did we decide about..."
            className="flex-1 bg-transparent text-sm text-[#111827] placeholder:text-[#9CA3AF] outline-none"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          <div className="flex items-center gap-1">
            <Kbd className="text-[10px] bg-[#F9FAFB] text-[#6B7280] border-[#E5E7EB]">
              <Command className="h-2.5 w-2.5" />
            </Kbd>
            <Kbd className="text-[10px] bg-[#F9FAFB] text-[#6B7280] border-[#E5E7EB]">K</Kbd>
          </div>
        </div>
        <div className="p-2">
          {[
            { icon: Brain, label: "What did we decide about pricing?", hint: "semantic" },
            { icon: Sparkles, label: "Remember: ship MVP by Friday", hint: "storing..." },
            { icon: GitBranch, label: "MEMORY.md savings", hint: "−847 tokens" },
          ].map((item, i) => (
            <div
              key={item.label}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                i === 0
                  ? "bg-[#0070F3]/[0.06] text-[#111827]"
                  : "text-[#4B5563] hover:bg-[#F9FAFB] hover:text-[#111827]"
              } cursor-pointer transition-colors`}
            >
              <item.icon className={`h-4 w-4 ${i === 0 ? "text-[#0070F3]" : "text-[#9CA3AF]"}`} />
              <span className="flex-1 font-medium">{item.label}</span>
              <span className="text-xs text-[#9CA3AF]">{item.hint}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// OpenClaw Installation Code Preview
// ============================================================================
function OpenClawCodePreview() {
  // Syntax highlighting colors (VS Code-like)
  const colors = {
    comment: "text-[#6A737D]",      // gray
    command: "text-[#B392F0]",       // purple - main command
    subcommand: "text-[#79B8FF]",    // blue - plugins, config
    action: "text-[#85E89D]",        // green - install, set
    package: "text-[#FFAB70]",       // orange - package names
    key: "text-[#79B8FF]",           // blue - config keys
    value: "text-[#9ECBFF]",         // light blue - values
    equals: "text-[#E1E4E8]",        // white - operators
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="relative mx-auto max-w-2xl"
    >
      <div className="relative rounded-2xl bg-[#0D1117] overflow-hidden shadow-[0_24px_48px_-12px_rgba(0,0,0,0.18)] border border-[#30363D]">
        {/* Window chrome */}
        <div className="flex items-center gap-2 px-4 py-3 bg-[#161B22] border-b border-[#30363D]">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-[#FF5F57]" />
            <div className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
            <div className="h-3 w-3 rounded-full bg-[#28C840]" />
          </div>
          <div className="flex-1 flex justify-center">
            <span className="text-[11px] text-[#8B949E] font-medium tracking-wide">Terminal</span>
          </div>
          <Terminal className="h-3.5 w-3.5 text-[#8B949E]" />
        </div>

        {/* Code content */}
        <div className="p-6 font-mono text-base leading-8 bg-[#0D1117]">
          {/* Line 1: Comment */}
          <motion.div initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.4 }}>
            <span className={colors.comment}># One command. Every platform.</span>
          </motion.div>
          
          {/* Line 2: npx command */}
          <motion.div initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.46 }}>
            <span className={colors.command}>npx</span>{" "}
            <span className={colors.package}>fathippo</span>{" "}
            <span className={colors.action}>setup</span>
          </motion.div>
          
          {/* Empty line */}
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.52 }}>&nbsp;</motion.div>
          
          {/* Line 3: Output header */}
          <motion.div initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.58 }}>
            <span className={colors.value}>🦛 FatHippo Setup</span>
          </motion.div>
          
          {/* Empty line */}
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.61 }}>&nbsp;</motion.div>
          
          {/* Line 4: Detected */}
          <motion.div initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.64 }}>
            <span className={colors.comment}>Detected coding platforms:</span>
          </motion.div>
          
          {/* Line 5: Claude Code */}
          <motion.div initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.7 }}>
            <span className={colors.action}>{"  ✔"}</span>{" "}
            <span className={colors.value}>Claude Code</span>{" "}
            <span className={colors.comment}>— configured</span>
          </motion.div>
          
          {/* Line 6: Cursor */}
          <motion.div initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.74 }}>
            <span className={colors.action}>{"  ✔"}</span>{" "}
            <span className={colors.value}>Cursor</span>{" "}
            <span className={colors.comment}>— configured</span>
          </motion.div>
          
          {/* Line 7: Codex */}
          <motion.div initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.78 }}>
            <span className={colors.action}>{"  ✔"}</span>{" "}
            <span className={colors.value}>Codex</span>{" "}
            <span className={colors.comment}>— configured</span>
          </motion.div>
          
          {/* Line 8: Windsurf */}
          <motion.div initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.82 }}>
            <span className={colors.action}>{"  ✔"}</span>{" "}
            <span className={colors.value}>Windsurf</span>{" "}
            <span className={colors.comment}>— configured</span>
          </motion.div>
          
          {/* Empty line */}
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.86 }}>&nbsp;</motion.div>
          
          {/* Line 9: Done */}
          <motion.div initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.9 }}>
            <span className={colors.comment}># That&apos;s it. Every agent learns now.</span>
          </motion.div>
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
      icon: Plug,
      title: "Cross-Platform Learning",
      description:
        "Fix a bug in Cursor. Claude Code gets the pattern. Codex gets the skill. One brain, every agent.",
      iconColor: "text-[#0070F3]",
      iconBg: "bg-[#0070F3]/[0.08]",
    },
    {
      icon: Sparkles,
      title: "Automatic Skill Synthesis",
      description:
        "Repeated successful patterns become reusable skills — procedure steps, pitfalls, verification. No manual curation.",
      iconColor: "text-[#00B8D9]",
      iconBg: "bg-[#00B8D9]/[0.08]",
    },
    {
      icon: Zap,
      title: "13 Platforms, One Command",
      description:
        "Claude Code, Cursor, Codex, Windsurf, Zed, VS Code, OpenCode, Antigravity, Trae, Qoder, Hermes Agent, and OpenClaw. npx fathippo setup. Done.",
      iconColor: "text-[#8B5CF6]",
      iconBg: "bg-[#8B5CF6]/[0.08]",
    },
    {
      icon: Lock,
      title: "Your Data Stays Yours",
      description:
        "AES-256-GCM encryption at rest. Frequency-based anonymization for shared patterns. Privacy by default.",
      iconColor: "text-[#0070F3]",
      iconBg: "bg-[#0070F3]/[0.08]",
    },
    {
      icon: Target,
      title: "Built-in Feedback Loop",
      description:
        "FatHippo detects whether patterns helped. Success increases confidence. Failure demotes. Quality improves automatically.",
      iconColor: "text-[#00B8D9]",
      iconBg: "bg-[#00B8D9]/[0.08]",
    },
    {
      icon: BarChart3,
      title: "Dashboard & Control",
      description:
        "See synthesized skills, edit them, submit feedback. View traces, patterns, and impact stats. You're always in control.",
      iconColor: "text-[#8B5CF6]",
      iconBg: "bg-[#8B5CF6]/[0.08]",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 auto-rows-fr">
      {features.map((feature, i) => (
        <FloatingCard 
          key={feature.title} 
          delay={i * 0.08}
        >
          <div className="relative">
            <div className={`mb-4 inline-flex items-center justify-center rounded-xl ${feature.iconBg} p-3`}>
              <feature.icon className={`h-5 w-5 ${feature.iconColor}`} />
            </div>
            <h3 className="text-base font-semibold text-[#111827] mb-2 tracking-tight">
              {feature.title}
            </h3>
            <p className="text-sm text-[#6B7280] leading-relaxed">
              {feature.description}
            </p>
          </div>
        </FloatingCard>
      ))}
    </div>
  );
}

// ============================================================================
// Pricing Section
// ============================================================================
function PricingSection() {
  const [annual, setAnnual] = useState(false);

  const freeFeatures = [
    "On-device memory, fully private",
    "Cross-session context recall",
    "Fix & workflow reuse",
    "Works offline",
    "No account required",
  ];

  const hostedFeatures = [
    "Everything in Free, plus:",
    "Cloud sync across devices",
    "Cognitive traces & pattern extraction",
    "Skill synthesis from coding patterns",
    "Dashboard with receipts & analytics",
    "Plugin version management",
    "Priority support",
  ];

  return (
    <section className="relative z-10 px-4 sm:px-6 py-24 bg-[#FAFAFA] overflow-hidden" id="pricing">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <Badge
            variant="outline"
            className="mb-4 border-[#8B5CF6]/20 bg-[#8B5CF6]/[0.04] text-[#7C3AED] font-medium"
          >
            Simple Pricing
          </Badge>
          <h2 className="text-4xl font-semibold text-[#111827] mb-4 tracking-tight">
            Start free. Scale when ready.
          </h2>
          <p className="text-lg text-[#6B7280] max-w-lg mx-auto mb-8">
            Local-only is free forever. Go hosted when you need sync, cognition, and cross-device memory.
          </p>

          {/* Monthly / Annual toggle */}
          <div className="inline-flex items-center gap-3 rounded-full bg-white border border-[#E5E7EB] p-1 shadow-sm">
            <button
              onClick={() => setAnnual(false)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                !annual
                  ? "bg-[#111827] text-white shadow-sm"
                  : "text-[#6B7280] hover:text-[#111827]"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                annual
                  ? "bg-[#111827] text-white shadow-sm"
                  : "text-[#6B7280] hover:text-[#111827]"
              }`}
            >
              Annual
              <span className="ml-1.5 text-xs text-[#059669] font-semibold">save 17%</span>
            </button>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-4 sm:gap-6 max-w-3xl mx-auto">
          {/* Free Card */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="relative"
          >
            <div className="rounded-2xl bg-white p-4 sm:p-6 md:p-8 border border-[#E5E7EB] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)] h-full flex flex-col overflow-hidden">
              <div className="flex items-center gap-3 mb-6">
                <div className="inline-flex items-center justify-center rounded-xl bg-[#F3F4F6] p-3 shrink-0">
                  <HardDrive className="h-5 w-5 text-[#6B7280]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-[#111827] tracking-tight">Free</h3>
                  <p className="text-sm text-[#6B7280]">Local-Only</p>
                </div>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-bold text-[#111827] tracking-tight">$0</span>
                <span className="text-[#6B7280] ml-1">/month</span>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {freeFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-[#4B5563]">
                    <Check className="h-4 w-4 text-[#9CA3AF] mt-0.5 shrink-0" />
                    <span className="break-words">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                variant="outline"
                className="w-full border-[#E5E7EB] text-[#111827] hover:bg-[#F9FAFB] font-medium h-11"
              >
                <Link href="/docs">Install Free</Link>
              </Button>
            </div>
          </motion.div>

          {/* Hosted Card */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="relative"
          >
            {/* Gradient border effect */}
            <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-[#0070F3] via-[#00B8D9] to-[#8B5CF6] opacity-100" />
            <div className="relative rounded-2xl bg-white p-4 sm:p-6 md:p-8 h-full flex flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-2 mb-6">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="inline-flex items-center justify-center rounded-xl bg-[#0070F3]/[0.08] p-3 shrink-0">
                    <Cloud className="h-5 w-5 text-[#0070F3]" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-[#111827] tracking-tight">Hosted</h3>
                    <p className="text-sm text-[#6B7280]">Full cognitive stack</p>
                  </div>
                </div>
                <Badge className="bg-[#0070F3]/[0.08] text-[#0070F3] border-[#0070F3]/20 font-medium shrink-0">
                  <Star className="h-3 w-3 mr-1" />
                  Popular
                </Badge>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-bold text-[#111827] tracking-tight">
                  {annual ? "$49.99" : "$4.99"}
                </span>
                <span className="text-[#6B7280] ml-1">/{annual ? "year" : "month"}</span>
                {annual && (
                  <span className="ml-2 text-sm text-[#059669] font-medium">$4.17/mo</span>
                )}
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {hostedFeatures.map((feature, i) => (
                  <li
                    key={feature}
                    className={`flex items-start gap-3 text-sm ${
                      i === 0 ? "text-[#111827] font-medium" : "text-[#4B5563]"
                    }`}
                  >
                    <Check className={`h-4 w-4 mt-0.5 shrink-0 ${i === 0 ? "text-[#0070F3]" : "text-[#0070F3]"}`} />
                    <span className="break-words">{feature}</span>
                  </li>
                ))}
              </ul>

              <GradientButton asChild className="w-full h-11">
                <Link href="/dashboard/settings">
                  Get Started
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </GradientButton>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================
export default function Home() {
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const headerOpacity = useTransform(scrollYProgress, [0, 0.08], [0, 1]);
  const headerPointerEvents = useTransform(scrollYProgress, (v) => v > 0.02 ? "auto" : "none");

  const fadeInUp = {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: [0.21, 0.47, 0.32, 0.98] },
  };

  return (
    <div className="min-h-screen bg-white text-[#111827] overflow-x-hidden antialiased">
      {/* Hippo mascot - bottom right, full visible, feet on bottom, butt on right */}
      <img 
        src="/hippo.png"
        alt=""
        className="fixed bottom-0 right-0 w-[888px] h-auto pointer-events-none z-0 opacity-[0.05] translate-x-[18%] translate-y-[28%]"
      />
      {/* Sticky header */}
      <motion.header
        style={{ opacity: headerOpacity, pointerEvents: headerPointerEvents }}
        className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-b border-[#F3F4F6]"
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight text-[#111827]">
            FatHippo
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <a
              href="#pricing"
              className="text-sm text-[#6B7280] hover:text-[#111827] transition-colors font-medium"
            >
              Pricing
            </a>
            <Link
              href="/docs"
              className="text-sm text-[#6B7280] hover:text-[#111827] transition-colors font-medium"
            >
              Docs
            </Link>
            <a
              href="https://github.com/jscianna/fathippo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#6B7280] hover:text-[#111827] transition-colors font-medium"
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
                      className="border-[#E5E7EB] text-[#111827] hover:bg-[#F9FAFB] font-medium"
                    >
                      Sign In
                    </Button>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <Button
                    asChild
                    size="sm"
                    className="bg-[#111827] text-white hover:bg-[#1F2937] font-medium"
                  >
                    <Link href="/dashboard">Dashboard</Link>
                  </Button>
                </SignedIn>
              </>
            ) : (
              <Button
                asChild
                size="sm"
                className="bg-[#111827] text-white hover:bg-[#1F2937] font-medium"
              >
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            )}
          </nav>
          {/* Mobile hamburger for sticky header */}
          <button
            className="md:hidden p-2 -mr-2 text-[#6B7280] hover:text-[#111827]"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </motion.header>

      {/* Top nav (visible at top) */}
      <header className="relative z-40 px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link
            href="/"
            className="text-xl font-semibold tracking-tight text-[#111827]"
          >
            FatHippo
          </Link>
          
          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            <a
              href="#pricing"
              className="text-sm text-[#6B7280] hover:text-[#111827] transition-colors font-medium"
            >
              Pricing
            </a>
            <Link
              href="/docs"
              className="text-sm text-[#6B7280] hover:text-[#111827] transition-colors font-medium"
            >
              Docs
            </Link>
            <a
              href="https://github.com/jscianna/fathippo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#6B7280] hover:text-[#111827] transition-colors font-medium"
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
                      className="border-[#E5E7EB] text-[#111827] hover:bg-[#F9FAFB] font-medium"
                    >
                      Sign In
                    </Button>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <Button
                    asChild
                    size="sm"
                    className="bg-[#111827] text-white hover:bg-[#1F2937] font-medium"
                  >
                    <Link href="/dashboard">Dashboard</Link>
                  </Button>
                </SignedIn>
              </>
            ) : (
              <Button
                asChild
                size="sm"
                className="bg-[#111827] text-white hover:bg-[#1F2937] font-medium"
              >
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            )}
          </nav>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 -mr-2 text-[#6B7280] hover:text-[#111827]"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-white border-b border-[#F3F4F6] shadow-lg z-50">
            <nav className="flex flex-col px-6 py-4 gap-4">
              <a
                href="#pricing"
                className="text-base text-[#6B7280] hover:text-[#111827] transition-colors font-medium py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Pricing
              </a>
              <Link
                href="/docs"
                className="text-base text-[#6B7280] hover:text-[#111827] transition-colors font-medium py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Docs
              </Link>
              <a
                href="https://github.com/jscianna/fathippo"
                target="_blank"
                rel="noopener noreferrer"
                className="text-base text-[#6B7280] hover:text-[#111827] transition-colors font-medium py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                GitHub
              </a>
              <div className="border-t border-[#F3F4F6] pt-4 mt-2">
                {hasClerk ? (
                  <>
                    <SignedOut>
                      <SignInButton mode="modal">
                        <Button
                          variant="outline"
                          className="w-full border-[#E5E7EB] text-[#111827] hover:bg-[#F9FAFB] font-medium"
                        >
                          Sign In
                        </Button>
                      </SignInButton>
                    </SignedOut>
                    <SignedIn>
                      <Button
                        asChild
                        className="w-full bg-[#111827] text-white hover:bg-[#1F2937] font-medium"
                      >
                        <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>Dashboard</Link>
                      </Button>
                    </SignedIn>
                  </>
                ) : (
                  <Button
                    asChild
                    className="w-full bg-[#111827] text-white hover:bg-[#1F2937] font-medium"
                  >
                    <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>Dashboard</Link>
                  </Button>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative px-6 pt-8 pb-16 md:pt-12 md:pb-24">
        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <motion.div {...fadeInUp}>
            <Badge
              variant="outline"
              className="mb-6 border-[#E5E7EB] bg-white text-[#6B7280] font-medium"
            >
              <Sparkles className="mr-1.5 h-3 w-3 text-[#0070F3]" />
              Works with 13 coding platforms
            </Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl text-[#111827] leading-[1.1]"
          >
            Your agent gets
            <br />
            <span className="text-[#6B7280]">smarter every session.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="mx-auto mt-6 max-w-xl text-lg text-[#6B7280] leading-relaxed"
          >
            FatHippo learns from real coding sessions across Claude Code, Cursor, Codex, and more. Patterns extracted. Skills synthesized. Context that compounds.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="mt-10 flex flex-wrap justify-center gap-4"
          >
            {hasClerk ? (
              <>
                <SignedOut>
                  <SignInButton mode="modal">
                    <GradientButton size="lg" className="text-base px-8 h-12">
                      Request API Key
                      <ArrowRight className="h-4 w-4" />
                    </GradientButton>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <GradientButton size="lg" className="text-base px-8 h-12" asChild>
                    <Link href="/dashboard">
                      Open Dashboard
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </GradientButton>
                </SignedIn>
              </>
            ) : (
              <GradientButton size="lg" className="text-base px-8 h-12" asChild>
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
              className="border-[#E5E7EB] bg-white text-[#111827] hover:bg-[#F9FAFB] h-12 font-medium"
            >
              <Link href="/docs">View Documentation</Link>
            </Button>
          </motion.div>
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
            <h2 className="text-3xl font-semibold text-[#111827] mb-3 tracking-tight">
              Install once. Every agent learns.
            </h2>
            <p className="text-lg text-[#6B7280] max-w-xl mx-auto">
              One command connects FatHippo to all your coding tools. Patterns learned in Cursor help Claude Code. Skills from Codex improve VS Code. Memory that flows everywhere.
            </p>
          </motion.div>
          <CommandPalettePreview />
        </div>
      </section>

      {/* How it Works */}
      <section className="relative z-10 px-6 py-24 bg-[#FAFAFA]">
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-semibold text-[#111827] mb-4 tracking-tight">
              How it works
            </h2>
            <p className="text-lg text-[#6B7280]">
              Three steps to intelligent memory
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                step: "01",
                title: "Connect",
                description:
                  "Run npx fathippo setup. FatHippo detects Claude Code, Cursor, Codex, Windsurf, Zed, VS Code, OpenCode, Antigravity, Trae, Qoder, Hermes Agent, and OpenClaw — configures them all.",
                icon: Layers,
                color: "text-[#0070F3]",
                bgColor: "bg-[#0070F3]/[0.08]",
              },
              {
                step: "02",
                title: "Learn",
                description:
                  "Your agent captures coding traces automatically. Successful patterns cluster. High-confidence patterns become reusable skills.",
                icon: GitBranch,
                color: "text-[#00B8D9]",
                bgColor: "bg-[#00B8D9]/[0.08]",
              },
              {
                step: "03",
                title: "Compound",
                description:
                  "Every session makes the next one smarter. Patterns improve with feedback. Skills get better with use. Your agent compounds experience.",
                icon: Shield,
                color: "text-[#8B5CF6]",
                bgColor: "bg-[#8B5CF6]/[0.08]",
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, ease: "easeOut" }}
                className="relative text-center"
              >
                <div className={`mb-6 mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl ${item.bgColor}`}>
                  <item.icon className={`h-6 w-6 ${item.color}`} />
                </div>
                <div className="text-5xl font-bold text-[#E5E7EB] mb-4 tracking-tight">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-[#111827] mb-2 tracking-tight">
                  {item.title}
                </h3>
                <p className="text-sm text-[#6B7280] leading-relaxed max-w-xs mx-auto">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Built for OpenClaw Section */}
      <section className="relative z-10 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <Badge
              variant="outline"
              className="mb-4 border-[#00B8D9]/20 bg-[#00B8D9]/[0.04] text-[#0891B2] font-medium"
            >
              Native Integration
            </Badge>
            <h2 className="text-3xl font-semibold text-[#111827] mb-3 tracking-tight">
              Works everywhere you code
            </h2>
            <p className="text-lg text-[#6B7280] max-w-lg mx-auto">
              One command configures Claude Code, Cursor, Codex, Windsurf, Zed, VS Code, OpenCode, and OpenClaw. Every agent learns from the same cognitive layer.
            </p>
          </motion.div>
          <OpenClawCodePreview />
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
            <h2 className="text-4xl font-semibold text-[#111827] mb-4 tracking-tight">
              Built for production
            </h2>
            <p className="text-lg text-[#6B7280] max-w-lg mx-auto">
              Real agents shipping today. Not a demo.
            </p>
          </motion.div>
          <BentoGrid />
        </div>
      </section>

      {/* Pricing */}
      <PricingSection />

      {/* Final CTA */}
      <section className="relative z-10 px-6 py-32">
        <div className="mx-auto max-w-2xl text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl font-semibold text-[#111827] mb-4 tracking-tight"
          >
            Make every coding session count
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-[#6B7280] mb-10"
          >
            One setup. 13 platforms. An agent that gets smarter every day.
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
                  <GradientButton size="lg" className="text-base px-8 h-12">
                    Request API Key
                    <ArrowRight className="h-4 w-4" />
                  </GradientButton>
                </SignInButton>
              </SignedOut>
            ) : (
              <GradientButton size="lg" className="text-base px-8 h-12" asChild>
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
              className="border-[#E5E7EB] bg-white text-[#111827] hover:bg-[#F9FAFB] h-12 font-medium"
            >
              <Link href="/docs">Read the Docs</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[#F3F4F6] px-6 py-12 bg-[#FAFAFA]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
          {/* Logo - centered on mobile */}
          <Link href="/" className="text-lg font-semibold text-[#111827]">
            FatHippo
          </Link>
          
          {/* Nav links - wrap on mobile */}
          <div className="flex items-center gap-4 md:gap-6">
            <a
              href="#pricing"
              className="text-sm text-[#6B7280] hover:text-[#111827] font-medium"
            >
              Pricing
            </a>
            <Link
              href="/docs"
              className="text-sm text-[#6B7280] hover:text-[#111827] font-medium"
            >
              Docs
            </Link>
            <a
              href="https://github.com/jscianna/fathippo"
              className="text-sm text-[#6B7280] hover:text-[#111827] font-medium"
            >
              GitHub
            </a>
          </div>
          
          <p className="text-sm text-[#9CA3AF]">Built by Hippocampus Labs, Inc.</p>
        </div>
      </footer>
    </div>
  );
}
