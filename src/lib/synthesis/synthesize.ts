import { estimateTokens } from "@/lib/api-v1";
import { callLLM } from "@/lib/llm";
import type { MemoryCluster } from "@/lib/synthesis/clustering";

const SYNTHESIS_MODEL = "gpt-4o-mini";

export type ClusterSynthesis = {
  synthesis: string;
  title: string;
  confidence: number;
  compressionRatio: number;
  qualityScore: number;
  metadata: {
    patterns?: string[];
    decisions?: string[];
    constraints?: string[];
    guidance?: string;
  };
};

type SynthesisResponse = {
  topic?: unknown;
  synthesis?: unknown;
  confidence?: unknown;
  quality_score?: unknown;
  patterns?: unknown[];
  decisions?: unknown[];
  constraints?: unknown[];
  guidance?: unknown;
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
You are synthesizing related memories into actionable knowledge for an AI agent.

Instructions:
1. Extract PATTERNS: recurring approaches, techniques, or behaviors that worked.
2. Extract DECISIONS: explicit choices made (tech stack, architecture, preferences).
3. Extract CONSTRAINTS: rules, limits, or things to avoid.
4. Write GUIDANCE: "Next time X happens, do Y" style actionable advice.
5. Create a SYNTHESIS: 2-4 sentence compressed memory preserving key facts.
6. Rate QUALITY (0-1): How useful/actionable is this synthesis for future tasks?

Preserve specific values, numbers, dates, versions, and named entities exactly.
If memories conflict, flag it explicitly.

Output JSON:
{
  "topic": "short topic",
  "synthesis": "compressed synthesis (2-4 sentences)",
  "patterns": ["pattern 1", "pattern 2"],
  "decisions": ["decision 1"],
  "constraints": ["constraint 1"],
  "guidance": "Next time... do this",
  "confidence": 0.0,
  "quality_score": 0.0
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
    "You create actionable knowledge syntheses for an AI agent's long-term memory. Focus on patterns, decisions, and guidance that help with future tasks. Be precise, keep numbers intact, and never hide contradictions.";

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

  const patterns = Array.isArray(parsed.patterns)
    ? parsed.patterns.filter((p): p is string => typeof p === "string")
    : [];
  const decisions = Array.isArray(parsed.decisions)
    ? parsed.decisions.filter((d): d is string => typeof d === "string")
    : [];
  const constraints = Array.isArray(parsed.constraints)
    ? parsed.constraints.filter((c): c is string => typeof c === "string")
    : [];
  const guidance = typeof parsed.guidance === "string" ? parsed.guidance.trim() : undefined;

  return {
    synthesis,
    title,
    confidence: clampConfidence(parsed.confidence),
    compressionRatio: Number((sourceTokens / Math.max(1, synthesisTokens)).toFixed(2)),
    qualityScore: clampConfidence(parsed.quality_score),
    metadata: {
      patterns: patterns.length > 0 ? patterns : undefined,
      decisions: decisions.length > 0 ? decisions : undefined,
      constraints: constraints.length > 0 ? constraints : undefined,
      guidance,
    },
  };
}
