"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface MemoryDeleteButtonProps {
  memoryId: string;
}

export function MemoryDeleteButton({ memoryId }: MemoryDeleteButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm("Delete this memory? This cannot be undone.");
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`/api/v1/memories/${memoryId}`, {
        method: "DELETE",
      });

      const text = await response.text();
      let payload: { error?: string } = {};

      try {
        payload = text ? JSON.parse(text) as { error?: string } : {};
      } catch {
        payload = {};
      }

      if (!response.ok) {
        throw new Error(payload.error || `Failed to delete (${response.status})`);
      }

      toast.success("Memory deleted");
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
      onClick={handleDelete}
      disabled={deleting}
    >
      {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
      Delete
    </Button>
  );
}
