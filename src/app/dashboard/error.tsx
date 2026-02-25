"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-100">
      <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/20 text-rose-300">
        <AlertTriangle className="h-4 w-4" />
      </div>
      <h1 className="text-lg font-semibold">Dashboard error</h1>
      <p className="mt-2 text-sm text-zinc-300">{error.message || "Unexpected dashboard error."}</p>
      <Button className="mt-4 bg-cyan-400 text-zinc-950 hover:bg-cyan-300" onClick={reset}>
        Reload section
      </Button>
    </div>
  );
}
