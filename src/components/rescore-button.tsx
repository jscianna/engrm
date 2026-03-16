"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { rescoreAllMemories } from "@/app/dashboard/settings/actions";

export function RescoreButton() {
  const [loading, setLoading] = useState(false);

  async function handleRescore() {
    setLoading(true);
    try {
      const result = await rescoreAllMemories();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(
          `Re-scored ${result.updated} of ${result.total} memories`,
        );
      }
    } catch {
      toast.error("Failed to re-score memories");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
      onClick={handleRescore}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="mr-2 h-4 w-4" />
      )}
      Re-score Importance
    </Button>
  );
}
