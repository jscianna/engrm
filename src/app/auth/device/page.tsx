"use client";

import { useState } from "react";
import { useAuth, SignInButton } from "@clerk/nextjs";

export default function DeviceAuthPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setStatus("loading");
    setError("");

    try {
      const res = await fetch("/api/v1/auth/device/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_code: code.trim() }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus("success");
      } else {
        setStatus("error");
        setError(data.error ?? "Invalid code. Please try again.");
      }
    } catch {
      setStatus("error");
      setError("Network error. Please try again.");
    }
  }

  if (!isLoaded) return null;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-zinc-100 mb-2">🦛 FatHippo</h1>
          <p className="text-zinc-400">Connect your CLI</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          {!isSignedIn ? (
            <div className="text-center">
              <p className="text-zinc-300 mb-6">Sign in to authorize your device.</p>
              <SignInButton mode="modal">
                <button className="bg-cyan-400 text-zinc-950 font-medium px-6 py-3 rounded-xl hover:bg-cyan-300 transition-colors">
                  Sign In
                </button>
              </SignInButton>
            </div>
          ) : status === "success" ? (
            <div className="text-center">
              <div className="text-4xl mb-4">✓</div>
              <h2 className="text-xl font-semibold text-zinc-100 mb-2">Device Authorized</h2>
              <p className="text-zinc-400">You can close this page and return to your terminal.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Enter the code shown in your terminal
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC-123"
                maxLength={7}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-center text-2xl font-mono text-zinc-100 tracking-widest focus:outline-none focus:border-cyan-400 placeholder:text-zinc-600"
                autoFocus
                autoComplete="off"
              />
              {error && (
                <p className="text-red-400 text-sm mt-2 text-center">{error}</p>
              )}
              <button
                type="submit"
                disabled={status === "loading" || code.replace("-", "").length < 6}
                className="w-full mt-4 bg-cyan-400 text-zinc-950 font-medium py-3 rounded-xl hover:bg-cyan-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === "loading" ? "Authorizing..." : "Authorize Device"}
              </button>
            </form>
          )}
        </div>

        <p className="text-zinc-500 text-xs text-center mt-4">
          This will create an API key for your CLI. You can revoke it anytime from your dashboard.
        </p>
      </div>
    </div>
  );
}
