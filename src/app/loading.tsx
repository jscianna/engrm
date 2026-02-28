import { Loader2 } from "lucide-react";

export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-200">
      <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
        Loading Engrm...
      </div>
    </div>
  );
}
