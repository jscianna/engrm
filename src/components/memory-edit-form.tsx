"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface MemoryEditFormProps {
  memoryId: string;
  initialTitle: string;
  initialText: string;
  isEncrypted: boolean;
}

export function MemoryEditForm({ memoryId, initialTitle, initialText, isEncrypted }: MemoryEditFormProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (isEncrypted) {
      toast.error("Cannot edit encrypted memories from this interface yet.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/memories/${memoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, text }),
      });

      const text_response = await response.text();
      let data;
      try {
        data = text_response ? JSON.parse(text_response) : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data.error || `Failed to update (${response.status})`);
      }

      toast.success("Memory updated");
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  if (!isEditing) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        onClick={() => setIsEditing(true)}
        disabled={isEncrypted}
        title={isEncrypted ? "Cannot edit encrypted memories" : "Edit memory"}
      >
        <Pencil className="mr-2 h-4 w-4" />
        Edit
      </Button>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-cyan-800/50 bg-zinc-950 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-cyan-300">Edit Memory</p>
        <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="border-zinc-700 bg-zinc-900 text-zinc-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-400">Content</label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="border-zinc-700 bg-zinc-900 text-zinc-100"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setIsEditing(false)} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-cyan-600 hover:bg-cyan-500"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save
        </Button>
      </div>
    </div>
  );
}
