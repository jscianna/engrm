"use client";

import { useState } from "react";
import { CreditCard, Crown, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { EntitlementPlan } from "@/lib/db";

async function redirectToCheckout(priceId: string) {
  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priceId }),
  });
  const data = (await res.json()) as { url?: string; error?: string };
  if (data.url) {
    window.location.href = data.url;
  } else {
    throw new Error(data.error ?? "Failed to create checkout session");
  }
}

async function redirectToPortal() {
  const res = await fetch("/api/stripe/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = (await res.json()) as { url?: string; error?: string };
  if (data.url) {
    window.location.href = data.url;
  } else {
    throw new Error(data.error ?? "Failed to create portal session");
  }
}

export function BillingCard({
  plan,
  priceMonthly,
  priceAnnual,
}: {
  plan: EntitlementPlan;
  priceMonthly: string;
  priceAnnual: string;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isHosted = plan === "hosted";

  async function handleCheckout(priceId: string, label: string) {
    setLoading(label);
    setError(null);
    try {
      await redirectToCheckout(priceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(null);
    }
  }

  async function handlePortal() {
    setLoading("portal");
    setError(null);
    try {
      await redirectToPortal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(null);
    }
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-zinc-100">
          <CreditCard className="h-5 w-5 text-cyan-400" />
          Billing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Plan */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400">Current plan:</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-sm font-medium text-zinc-200">
            {isHosted ? (
              <>
                <Crown className="h-3.5 w-3.5 text-amber-400" />
                Hosted
              </>
            ) : (
              "Free"
            )}
          </span>
        </div>

        {isHosted ? (
          /* Manage existing subscription */
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              You have full access to sync, hosted retrieval, and cognitive APIs.
            </p>
            <Button
              onClick={handlePortal}
              disabled={loading === "portal"}
              variant="ghost"
              className="border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              {loading === "portal" ? "Loading…" : "Manage Subscription"}
            </Button>
          </div>
        ) : (
          /* Upgrade options */
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              Upgrade to unlock sync, hosted retrieval upgrades, and cognitive APIs.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Monthly */}
              <button
                type="button"
                onClick={() => handleCheckout(priceMonthly, "monthly")}
                disabled={loading !== null}
                className="group flex flex-col items-start gap-1 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 text-left transition-colors hover:border-cyan-600 hover:bg-zinc-800 disabled:opacity-50"
              >
                <span className="text-sm font-medium text-zinc-200">Monthly</span>
                <span className="text-2xl font-bold text-zinc-100">
                  $9.99<span className="text-sm font-normal text-zinc-500">/mo</span>
                </span>
                {loading === "monthly" && (
                  <span className="text-xs text-cyan-400">Redirecting…</span>
                )}
              </button>

              {/* Annual */}
              <button
                type="button"
                onClick={() => handleCheckout(priceAnnual, "annual")}
                disabled={loading !== null}
                className="group relative flex flex-col items-start gap-1 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 text-left transition-colors hover:border-cyan-600 hover:bg-zinc-800 disabled:opacity-50"
              >
                <span className="absolute -top-2.5 right-3 inline-flex items-center gap-1 rounded-full bg-cyan-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  <Sparkles className="h-3 w-3" />
                  Save 17%
                </span>
                <span className="text-sm font-medium text-zinc-200">Annual</span>
                <span className="text-2xl font-bold text-zinc-100">
                  $99.99<span className="text-sm font-normal text-zinc-500">/yr</span>
                </span>
                {loading === "annual" && (
                  <span className="text-xs text-cyan-400">Redirecting…</span>
                )}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-rose-400">{error}</p>}
      </CardContent>
    </Card>
  );
}
