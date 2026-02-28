"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, Copy, Key, Loader2, Lock, Sparkles, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bytesToBase64, deriveKeyFromPassword, encryptClientSide, exportKeyToBase64, generateSalt } from "@/lib/client-crypto";
import { generateArweaveWallet, getWalletAddress } from "@/lib/arweave-wallet";

type Step = "welcome" | "password" | "api-key" | "complete";

type OnboardingWizardProps = {
  userId: string;
  onComplete: (key: CryptoKey) => void;
};

function StepIndicator({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
              i < current
                ? "bg-cyan-500 text-zinc-950"
                : i === current
                ? "bg-cyan-400/20 text-cyan-400 ring-2 ring-cyan-400"
                : "bg-zinc-800 text-zinc-500"
            }`}
          >
            {i < current ? <Check className="h-4 w-4" /> : i + 1}
          </div>
          {i < steps.length - 1 && (
            <div className={`mx-2 h-0.5 w-8 ${i < current ? "bg-cyan-500" : "bg-zinc-800"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <div className="mb-6 flex justify-center">
        <div className="rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 p-4">
          <Sparkles className="h-12 w-12 text-cyan-400" />
        </div>
      </div>
      <h2 className="mb-3 text-2xl font-semibold text-zinc-100">Welcome to Engrm</h2>
      <p className="mb-6 text-zinc-400 max-w-md mx-auto">
        Zero-knowledge memory for your AI agents. Your data is encrypted client-side —
        we never see your memories.
      </p>
      
      <div className="mb-8 grid gap-3 text-left max-w-sm mx-auto">
        <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <Shield className="mt-0.5 h-5 w-5 text-cyan-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-zinc-200">True Zero-Knowledge</p>
            <p className="text-xs text-zinc-500">Encryption happens in your browser</p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <Lock className="mt-0.5 h-5 w-5 text-violet-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-zinc-200">You Hold the Key</p>
            <p className="text-xs text-zinc-500">Vault password never leaves your device</p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <Key className="mt-0.5 h-5 w-5 text-emerald-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-zinc-200">Simple API</p>
            <p className="text-xs text-zinc-500">Store and retrieve memories with one call</p>
          </div>
        </div>
      </div>

      <Button onClick={onNext} className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
        Get Started
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

function PasswordStep({
  onNext,
  loading,
}: {
  onNext: (password: string) => Promise<void>;
  loading: boolean;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const strength = (() => {
    let score = 0;
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    if (score <= 1) return { score, label: "Weak", color: "bg-rose-500" };
    if (score <= 3) return { score, label: "Medium", color: "bg-amber-500" };
    return { score, label: "Strong", color: "bg-emerald-500" };
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Use at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }

    await onNext(password);
  }

  return (
    <div>
      <div className="mb-6 text-center">
        <div className="mb-4 flex justify-center">
          <div className="rounded-2xl bg-violet-500/20 p-3">
            <Lock className="h-8 w-8 text-violet-400" />
          </div>
        </div>
        <h2 className="mb-2 text-xl font-semibold text-zinc-100">Create Your Vault Password</h2>
        <p className="text-sm text-zinc-400">
          This password encrypts all your memories. We can't recover it for you.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Choose a strong password"
            autoFocus
            className="border-zinc-700 bg-zinc-900 text-zinc-100"
          />
          {password && (
            <div className="mt-2 space-y-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full transition-all ${strength.color}`}
                  style={{ width: `${Math.max(15, strength.score * 20)}%` }}
                />
              </div>
              <p className="text-xs text-zinc-500">{strength.label}</p>
            </div>
          )}
        </div>

        <Input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm password"
          className="border-zinc-700 bg-zinc-900 text-zinc-100"
        />

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 p-3">
          <p className="text-xs text-amber-200">
            ⚠️ Save this password somewhere safe. Losing it means permanent loss of your encrypted memories.
          </p>
        </div>

        <Button
          type="submit"
          disabled={loading || !password || !confirm}
          className="w-full bg-cyan-400 text-zinc-950 hover:bg-cyan-300"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Create Vault
        </Button>
      </form>
    </div>
  );
}

function ApiKeyStep({
  apiKey,
  onNext,
  onSkip,
  loading,
  onGenerateKey,
}: {
  apiKey: string | null;
  onNext: () => void;
  onSkip: () => void;
  loading: boolean;
  onGenerateKey: () => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);

  // Auto-generate key when step loads
  useEffect(() => {
    if (!apiKey && !loading) {
      onGenerateKey();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const copyKey = useCallback(() => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      setCopied(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  }, [apiKey]);

  return (
    <div>
      <div className="mb-6 text-center">
        <div className="mb-4 flex justify-center">
          <div className="rounded-2xl bg-emerald-500/20 p-3">
            <Key className="h-8 w-8 text-emerald-400" />
          </div>
        </div>
        <h2 className="mb-2 text-xl font-semibold text-zinc-100">Your API Key</h2>
        <p className="text-sm text-zinc-400">
          Use this key to authenticate your agents with Engrm.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400 mb-3" />
          <p className="text-sm text-zinc-400">Generating your API key...</p>
        </div>
      ) : apiKey ? (
        <div className="space-y-4">
          <div className="relative">
            <Input
              value={apiKey}
              readOnly
              className="border-zinc-700 bg-zinc-900 pr-12 font-mono text-sm text-zinc-100"
            />
            <button
              onClick={copyKey}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>

          <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 p-3">
            <p className="text-xs text-amber-200">
              ⚠️ Copy this key now. You won't be able to see it again.
            </p>
          </div>

          <Button onClick={onNext} className="w-full bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Button
            onClick={onGenerateKey}
            className="w-full bg-cyan-400 text-zinc-950 hover:bg-cyan-300"
          >
            <Key className="mr-2 h-4 w-4" />
            Generate API Key
          </Button>
          <button
            onClick={onSkip}
            className="w-full text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Skip for now — I'll create one later
          </button>
        </div>
      )}
    </div>
  );
}

function CompleteStep() {
  return (
    <div className="text-center animate-in fade-in-0 zoom-in-95 duration-500">
      <div className="mb-6 flex justify-center">
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" />
          <div className="relative rounded-full bg-emerald-500/20 p-4">
            <Check className="h-12 w-12 text-emerald-400" />
          </div>
        </div>
      </div>
      <h2 className="mb-3 text-2xl font-semibold text-zinc-100">You're All Set! 🎉</h2>
      <p className="mb-6 text-zinc-400">
        Your vault is ready. Start storing memories from your agents.
      </p>

      <div className="mb-8 space-y-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-left">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-zinc-300">Store a memory</p>
            <span className="text-xs text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded">POST</span>
          </div>
          <pre className="overflow-x-auto rounded bg-zinc-950 p-3 text-xs text-zinc-400 font-mono">
{`curl -X POST /api/v1/memories \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "User prefers dark mode"}'`}
          </pre>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-left">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-zinc-300">Search memories</p>
            <span className="text-xs text-violet-400 bg-violet-400/10 px-2 py-0.5 rounded">POST</span>
          </div>
          <pre className="overflow-x-auto rounded bg-zinc-950 p-3 text-xs text-zinc-400 font-mono">
{`curl -X POST /api/v1/search \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "user preferences"}'`}
          </pre>
        </div>
      </div>

      <div className="flex gap-3 justify-center">
        <Button asChild variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
          <a href="/docs">Read Docs</a>
        </Button>
        <Button asChild className="bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
          <a href="/dashboard">Go to Dashboard</a>
        </Button>
      </div>
    </div>
  );
}

export function OnboardingWizard({ userId, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);

  const steps = ["welcome", "password", "api-key", "complete"];
  const currentIndex = steps.indexOf(step);

  async function handlePasswordSubmit(password: string) {
    setLoading(true);
    try {
      const salt = generateSalt();
      const derivedKey = await deriveKeyFromPassword(password, salt);
      const saltEncoded = bytesToBase64(salt);

      // Generate Arweave wallet
      const arweaveWallet = await generateArweaveWallet();
      const walletJson = JSON.stringify(arweaveWallet);
      const { ciphertext: walletEncrypted, iv: walletIv } = await encryptClientSide(walletJson, derivedKey);
      const walletAddress = await getWalletAddress(arweaveWallet);

      const response = await fetch("/api/settings/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salt: saltEncoded,
          arweaveWalletEncrypted: walletEncrypted,
          arweaveWalletIv: walletIv,
          arweaveWalletAddress: walletAddress,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create vault");
      }

      // Store key in session
      const keyB64 = await exportKeyToBase64(derivedKey);
      sessionStorage.setItem(`engrm_vault_key_b64:${userId}`, keyB64);
      
      setVaultKey(derivedKey);
      setStep("api-key");
      toast.success("Vault created!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create vault");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateApiKey() {
    setLoading(true);
    try {
      const response = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName: "My First Agent" }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate API key");
      }

      const data = await response.json();
      setApiKey(data.apiKey);
      toast.success("API key generated!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate API key");
    } finally {
      setLoading(false);
    }
  }

  function handleComplete() {
    setStep("complete");
    if (vaultKey) {
      onComplete(vaultKey);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-8 shadow-2xl">
        <StepIndicator current={currentIndex} steps={["Welcome", "Vault", "API Key", "Done"]} />

        {step === "welcome" && <WelcomeStep onNext={() => setStep("password")} />}
        {step === "password" && <PasswordStep onNext={handlePasswordSubmit} loading={loading} />}
        {step === "api-key" && (
          <ApiKeyStep
            apiKey={apiKey}
            onNext={handleComplete}
            onSkip={handleComplete}
            loading={loading}
            onGenerateKey={handleGenerateApiKey}
          />
        )}
        {step === "complete" && <CompleteStep />}
      </div>
    </div>
  );
}
