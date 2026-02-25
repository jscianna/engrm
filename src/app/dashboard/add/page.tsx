"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export default function AddMemoryPage() {
  const router = useRouter();
  const [sourceType, setSourceType] = useState<"text" | "url" | "file">("text");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const formData = new FormData();
      formData.set("sourceType", sourceType);
      formData.set("title", title);

      if (sourceType === "text") {
        formData.set("text", text);
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

      toast.success("Memory saved permanently.");
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

            <Input
              placeholder="Memory title (optional)"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
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
