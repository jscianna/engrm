"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type OpenClawConnectClaimProps = {
  connectId: string;
  expiresAt: string;
  initialStatus: "pending" | "claimed" | "consumed" | "expired";
  installationId: string;
  installationName: string | null;
  namespaceHint: string | null;
  userCode: string;
};

type ClaimState =
  | {
      phase: "authorizing";
      message: string;
    }
  | {
      phase: "authorized";
      installationId: string;
      message: string;
      namespace: string | null;
    }
  | {
      phase: "expired";
      message: string;
    }
  | {
      phase: "error";
      message: string;
    };

export function OpenClawConnectClaim(props: OpenClawConnectClaimProps) {
  const [state, setState] = useState<ClaimState>(() => {
    if (props.initialStatus === "expired") {
      return {
        phase: "expired",
        message: "This connect session has expired. Start a fresh install from your terminal.",
      };
    }
    if (props.initialStatus === "claimed" || props.initialStatus === "consumed") {
      return {
        phase: "authorized",
        installationId: props.installationId,
        message: "This OpenClaw install was already approved. Your terminal can keep going.",
        namespace: props.namespaceHint,
      };
    }
    return {
      phase: "authorizing",
      message: "Authorizing your OpenClaw install…",
    };
  });

  async function runAuthorization() {
    setState({
      phase: "authorizing",
      message: "Authorizing your OpenClaw install…",
    });

    try {
      const response = await fetch("/api/connect/openclaw/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connectId: props.connectId,
          namespace: props.namespaceHint,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        installationId?: string;
        namespace?: string | null;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to authorize this OpenClaw install.");
      }

      setState({
        phase: "authorized",
        installationId: payload.installationId ?? props.installationId,
        message: "OpenClaw is authorized. You can return to your terminal and finish the install.",
        namespace: typeof payload.namespace === "string" ? payload.namespace : props.namespaceHint,
      });
    } catch (error) {
      setState({
        phase: "error",
        message: error instanceof Error ? error.message : "Failed to authorize this OpenClaw install.",
      });
    }
  }

  const authorizeFromEffect = useEffectEvent(async () => {
    await runAuthorization();
  });

  useEffect(() => {
    if (props.initialStatus === "pending") {
      void authorizeFromEffect();
    }
  }, [props.initialStatus]);

  const expiresLabel = new Date(props.expiresAt).toLocaleString();

  return (
    <Card className="mx-auto w-full max-w-2xl border-zinc-800 bg-zinc-900/60">
      <CardHeader>
        <CardTitle className="text-zinc-100">Connect OpenClaw</CardTitle>
        <CardDescription>
          Approve this OpenClaw install so the terminal can receive a fresh hosted FatHippo key automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-zinc-300">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Authorization code</p>
          <p className="mt-2 font-mono text-lg text-zinc-100">{props.userCode}</p>
        </div>

        <div className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Installation</p>
            <p className="mt-2 text-zinc-100">{props.installationName ?? "OpenClaw"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Namespace</p>
            <p className="mt-2 text-zinc-100">{props.namespaceHint ?? "Default personal graph"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Installation ID</p>
            <p className="mt-2 font-mono text-zinc-100">{props.installationId}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Expires</p>
            <p className="mt-2 text-zinc-100">{expiresLabel}</p>
          </div>
        </div>

        {state.phase === "authorizing" ? (
          <div className="flex items-center gap-2 rounded-xl border border-cyan-900 bg-cyan-950/30 p-4 text-cyan-200">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{state.message}</span>
          </div>
        ) : null}

        {state.phase === "authorized" ? (
          <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-4 text-emerald-200">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              <span>{state.message}</span>
            </div>
            <p className="mt-3 text-xs text-emerald-100/80">
              Installation ID: <span className="font-mono">{state.installationId}</span>
            </p>
            <p className="mt-1 text-xs text-emerald-100/80">
              Namespace: <span className="font-mono">{state.namespace ?? "default"}</span>
            </p>
          </div>
        ) : null}

        {state.phase === "expired" || state.phase === "error" ? (
          <div className="rounded-xl border border-amber-800 bg-amber-950/20 p-4 text-amber-100">
            <p>{state.message}</p>
            {state.phase === "error" ? (
              <Button
                type="button"
                variant="outline"
                className="mt-3 border-amber-700 text-amber-100 hover:bg-amber-950/40"
                onClick={() => void runAuthorization()}
              >
                Try Again
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
