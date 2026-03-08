import { estimateTokens } from "@/lib/api-v1";
import { callLLM } from "@/lib/llm";
import type { MemoryCluster } from "@/lib/synthesis/clustering";

const SYNTHESIS_MODEL = "gpt-4o-mini";

export type ClusterSynthesis = {
  synthesis: string;
  title: string;
  confidence: number;
  compressionRatio: number;
};

type SynthesisResponse = {
  topic?: unknown;
  synthesis?: unknown;
  confidence?: unknown;
};

function clampConfidence(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, parsed));
}

export async function synthesizeCluster(cluster: MemoryCluster): Promise<ClusterSynthesis> {
  const prompt = `
You are synthesizing related memories into one compressed semantic memory.

Instructions:
1. Extract the durable insight, decision, pattern, or architecture truth.
2. Preserve specific values, numbers, limits, dates, versions, and named entities exactly when they matter.
3. If the memories conflict, flag the conflict explicitly instead of resolving it.
4. Write directly in declarative present tense.
5. Keep the synthesis to 2-4 sentences.

Output JSON:
{
  "topic": "short topic",
  "synthesis": "compressed synthesis",
  "confidence": 0.0
}

Source memories:
${cluster.memories
  .map(
    (memory, index) =>
      `${index + 1}. TITLE: ${memory.title}\nCREATED_AT: ${memory.createdAt}\nENTITIES: ${memory.derivedEntities.join(", ") || "none"}\nTEXT: ${memory.text}`,
  )
  .join("\n\n")}
  `.trim();

  const systemPrompt =
    "You create compact semantic memories for a long-term memory system. Be precise, keep numbers intact, and never hide contradictions.";

  const raw = await callLLM(prompt, systemPrompt, { model: SYNTHESIS_MODEL });
  const parsed = JSON.parse(raw) as SynthesisResponse;

  const synthesis = typeof parsed.synthesis === "string" ? parsed.synthesis.trim() : "";
  if (!synthesis) {
    throw new Error("Synthesis response did not include synthesis text");
  }

  const title =
    typeof parsed.topic === "string" && parsed.topic.trim().length > 0
      ? parsed.topic.trim()
      : cluster.topic;

  const sourceTokens = estimateTokens(cluster.memories.map((memory) => memory.text).join("\n\n"));
  const synthesisTokens = estimateTokens(synthesis);

  return {
    synthesis,
    title,
    confidence: clampConfidence(parsed.confidence),
    compressionRatio: Number((sourceTokens / Math.max(1, synthesisTokens)).toFixed(2)),
  };
}
