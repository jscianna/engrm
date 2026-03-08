import {
  demoteMemoryToNormal,
  getCriticalMemories,
  insertAgentMemory,
  listEphemeralMemoriesOlderThan,
  markMemoryCompleted,
  type AgentMemoryRecord,
  upsertSynthesizedMemory,
} from "@/lib/db";
import { callLLM } from "@/lib/llm";
import { absorbMemoriesIntoSynthesis } from "@/lib/synthesis/critical-synthesis";

const COMPLETION_MODEL = "gpt-4o-mini";
const EPHEMERAL_MODEL = "gpt-4o-mini";

const COMPLETION_DETECTION_PATTERNS = [
  /\b(fixed|implemented|deployed|shipped|done|completed|resolved)\b/i,
  /\bcommit [a-f0-9]{7,}\b/i,
  /\b(v\d+\.\d+|version \d+)\b/i,
];

type CompletionAnalysis = {
  isCompleted: boolean;
  extractedPrinciple?: string;
};

type PrincipleExtraction = {
  principle?: unknown;
};

function looksCompletedByRegex(memory: AgentMemoryRecord): boolean {
  return COMPLETION_DETECTION_PATTERNS.some(
    (pattern) => pattern.test(memory.title) || pattern.test(memory.text),
  );
}

async function analyzePotentialCompletion(memory: AgentMemoryRecord): Promise<CompletionAnalysis> {
  const prompt = `
Determine if this memory is describing a finished/completed task.

Output JSON:
{
  "isCompleted": true/false,
  "extractedPrinciple": "optional 1 sentence durable principle"
}

Memory:
TITLE: ${memory.title}
TEXT: ${memory.text}
`.trim();

  const systemPrompt =
    "You classify whether engineering tasks are completed and optionally extract a durable principle.";
  const raw = await callLLM(prompt, systemPrompt, { model: COMPLETION_MODEL });
  const parsed = JSON.parse(raw) as { isCompleted?: unknown; extractedPrinciple?: unknown };
  const extracted =
    typeof parsed.extractedPrinciple === "string" && parsed.extractedPrinciple.trim().length > 0
      ? parsed.extractedPrinciple.trim()
      : undefined;

  return {
    isCompleted: parsed.isCompleted === true,
    extractedPrinciple: extracted,
  };
}

async function extractPrincipleIfAny(memory: AgentMemoryRecord): Promise<string | null> {
  const prompt = `
Extract ONE durable principle from this ephemeral memory, if a stable principle exists.

Output JSON:
{
  "principle": "one sentence principle or empty string if none"
}

Memory:
TITLE: ${memory.title}
TEXT: ${memory.text}
`.trim();

  const systemPrompt =
    "You extract long-lived rules from short-lived implementation details. Return empty when nothing durable exists.";
  const raw = await callLLM(prompt, systemPrompt, { model: EPHEMERAL_MODEL });
  const parsed = JSON.parse(raw) as PrincipleExtraction;
  const principle = typeof parsed.principle === "string" ? parsed.principle.trim() : "";
  return principle.length > 0 ? principle : null;
}

export async function detectCompletedMemories(
  memories: AgentMemoryRecord[],
): Promise<Array<{ memory: AgentMemoryRecord; analysis: CompletionAnalysis }>> {
  const candidates = memories.filter((memory) => looksCompletedByRegex(memory) && !memory.completed);
  const analyses: Array<{ memory: AgentMemoryRecord; analysis: CompletionAnalysis }> = [];

  for (const memory of candidates) {
    const analysis = await analyzePotentialCompletion(memory);
    analyses.push({ memory, analysis });
  }
  return analyses;
}

export async function processCompletedMemories(userId: string): Promise<void> {
  const critical = await getCriticalMemories(userId, {
    excludeCompleted: true,
    excludeAbsorbed: true,
  });
  if (critical.length === 0) {
    return;
  }

  const analyses = await detectCompletedMemories(critical);
  for (const { memory, analysis } of analyses) {
    if (!analysis.isCompleted) {
      continue;
    }

    await markMemoryCompleted(userId, memory.id);

    if (analysis.extractedPrinciple) {
      await insertAgentMemory({
        userId,
        title: `Principle: ${analysis.extractedPrinciple.slice(0, 70)}`,
        text: analysis.extractedPrinciple,
        sourceType: "text",
        memoryType: "semantic",
        importanceTier: "critical",
        metadata: { derivedFrom: memory.id, source: "completed_task_extraction" },
      });
    }
  }
}

export async function processEphemeralMemories(userId: string): Promise<void> {
  const ephemeral = await listEphemeralMemoriesOlderThan(userId, 7, 100);
  for (const memory of ephemeral) {
    if (memory.absorbed) {
      continue;
    }

    const principle = await extractPrincipleIfAny(memory);
    if (principle) {
      const synthesized = await upsertSynthesizedMemory({
        userId,
        synthesis: principle,
        title: `Principle: ${memory.title.slice(0, 70)}`,
        sourceMemoryIds: [memory.id],
        sourceCount: 1,
        clusterId: `ephemeral_${memory.id}`,
        clusterTopic: memory.title.slice(0, 80) || "ephemeral-principle",
        importanceTier: "critical",
        synthesizedAt: new Date().toISOString(),
        lastValidatedAt: new Date().toISOString(),
        stale: false,
      });
      await absorbMemoriesIntoSynthesis(userId, synthesized.id, [memory.id]);
      continue;
    }

    await demoteMemoryToNormal(userId, memory.id);
  }
}
