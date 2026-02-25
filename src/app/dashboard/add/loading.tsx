import { Loader2 } from "lucide-react";

export default function AddMemoryLoading() {
  return (
    <div className="mx-auto flex min-h-[40vh] w-full max-w-3xl items-center justify-center">
      <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-200">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
        Loading editor...
      </div>
    </div>
  );
}
