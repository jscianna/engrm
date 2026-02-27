"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useVault } from "@/components/vault-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { encryptClientSide } from "@/lib/client-crypto";
import type { MemoryKind } from "@/lib/types";

import { memoryTypeLabels } from "@/lib/memory-labels";

const memoryTypes: MemoryKind[] = ["episodic", "semantic", "procedural", "self-model"];

export function MemoryFormEncrypted() {
  const router = useRouter();
  const { key } = useVault();
  const [sourceType, setSourceType] = useState<"text" | "url" | "file">("text");
  const [memoryType, setMemoryType] = useState<MemoryKind>("episodic");
  const [importance, setImportance] = useState(5);
  const [tags, setTags] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!key) {
      toast.error("Unlock your vault first.");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.set("sourceType", sourceType);
      formData.set("memoryType", memoryType);
      formData.set("importance", String(importance));
      formData.set("tags", tags);
      formData.set("title", title);

      if (sourceType === "text") {
        const cleaned = text.trim();
        if (!cleaned) {
          throw new Error("Text memory cannot be empty.");
        }

        const encrypted = await encryptClientSide(cleaned, key);
        formData.set("encryptedContent", encrypted.ciphertext);
        formData.set("iv", encrypted.iv);
      } else if (sourceType === "url") {
        formData.set("url", url);
      } else if (file) {
        formData.set("file", file);
      }

      const response = await fetch("/api/memories", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to save memory");
      }

      if (sourceType !== "text") {
        toast.warning("URL/File submission is currently stored unencrypted. Use Text for zero-knowledge encryption.");
      } else {
        toast.success("Encrypted memory saved permanently.");
      }

      router.push(`/dashboard/memory/${payload.memory.id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save memory");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader>
          <CardTitle className="text-zinc-100">Add Memory</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <Tabs value={sourceType} onValueChange={(value) => setSourceType(value as "text" | "url" | "file")}> 
              <TabsList className="grid w-full grid-cols-3 bg-zinc-800/70">
                <TabsTrigger value="text">Text</TabsTrigger>
                <TabsTrigger value="url">URL</TabsTrigger>
                <TabsTrigger value="file">File</TabsTrigger>
              </TabsList>
            </Tabs>

            {sourceType !== "text" ? (
              <p className="rounded-lg border border-amber-800/50 bg-amber-950/40 p-3 text-xs text-amber-200">
                <AlertTriangle className="mr-1 inline h-3 w-3" />
                End-to-end zero-knowledge mode currently applies to Text memories.
              </p>
            ) : null}

            <Input
              placeholder="Memory title (optional)"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="border-zinc-700 bg-zinc-900 text-zinc-100"
            />

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Memory Type</p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {memoryTypes.map((type) => (
                  <Button
                    key={type}
                    type="button"
                    variant={memoryType === type ? "default" : "outline"}
                    onClick={() => setMemoryType(type)}
                    className={
                      memoryType === type
                        ? "bg-cyan-400 text-zinc-950 hover:bg-cyan-300"
                        : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                    }
                  >
                    {memoryTypeLabels[type]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Importance</p>
                <p className="text-sm text-zinc-300">{importance}/10</p>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={importance}
                onChange={(event) => setImportance(Number(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-cyan-300"
              />
            </div>

            <Input
              placeholder="Tags (comma separated): work, arweave, research"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              className="border-zinc-700 bg-zinc-900 text-zinc-100"
            />

            {sourceType === "text" && (
              <Textarea
                required
                rows={12}
                placeholder="Paste notes, ideas, snippets..."
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="border-zinc-700 bg-zinc-900 text-zinc-100"
              />
            )}

            {sourceType === "url" && (
              <Input
                required
                type="url"
                placeholder="https://example.com/article"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                className="border-zinc-700 bg-zinc-900 text-zinc-100"
              />
            )}

            {sourceType === "file" && (
              <Input
                required
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="border-zinc-700 bg-zinc-900 text-zinc-100"
              />
            )}

            <Button type="submit" disabled={loading} className="w-full bg-cyan-400 text-zinc-950 hover:bg-cyan-300">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save to MEMRY
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
