import { embedText } from "@/lib/embeddings";
import { extractEntities } from "@/lib/entities";
import { classifyMemoryType, classifyPeer } from "@/lib/memory-classification";
import { classifyMemory } from "@/lib/memory-classifier";
import {
  getAgentMemoriesByIds,
  insertAgentMemory,
  updateAgentMemory,
} from "@/lib/db";
import { semanticSearchVectors, upsertMemoryVector } from "@/lib/qdrant";
import {
  invalidateAllLocalResultsForUser,
  invalidateLocalResultsByMemoryIds,
} from "@/lib/local-retrieval";
import { detectSecretCategories, VAULT_HINT_MESSAGE } from "@/lib/secrets";
import { createTrace, getMatchingPatterns, syncTracePatternMatches } from "@/lib/cognitive-db";
import { runMicroDream } from "@/lib/micro-dream";
import { detectProjectScope } from "@/lib/project-scope";
import type { MemoryImportanceTier, MemoryKind, MemoryPeer } from "@/lib/types";

const CONSOLIDATION_THRESHOLD = 0.9;

const HIGH_IMPORTANCE_PATTERNS = [
  /\b(?:always|never|must|required|important|critical|prefers?|preferred)\b/i,
  /\b(?:my name is|i am|i'm called)\b/i,
  /\b(?:remember|don't forget)\b/i,
];

const CRITICAL_PATTERNS = [
  /\b(?:must always|never ever|absolutely|core principle|fundamental)\b/i,
];

const NOISE_PATTERNS = [
  /^```[\s\S]{0,50}```$/,
  /^\s*$/,
  /^(ok|okay|thanks|thx|ty|np|no problem|sure|yep|yes|no|maybe)\.?$/i,
  /^[👍👎🎉✅❌🔥💯]+$/,
  /^\d+$/,
  /^https?:\/\/\S+$/,
];

const TERMINAL_PATTERNS = [
  /npm (ERR!|WARN)/,
  /error:\s*\w+Error/i,
  /at\s+\w+\s+\([^)]+:\d+:\d+\)/,
  /^\s*\^\s*$/m,
  /Traceback \(most recent call last\)/,
  /^warning:/im,
  /^error:/im,
];

const CAPTURE_PATTERNS = [
  /\b(decide|decided|decision)\b/i,
  /\b(prefer|preference|prefers)\b/i,
  /\b(always|never|must|should)\b/i,
  /\b(remember|don't forget|note that)\b/i,
  /\b(rule|principle|guideline)\b/i,
  /\b(important|critical|key)\b/i,
  /\b(identity|i am|my name)\b/i,
  /\b(constraint|requirement|must not)\b/i,
  /\b(workflow|process|procedure)\b/i,
  /\b(plan|approved|ship|release|namespace|installation|mode)\b/i,
];

const ASSISTANT_DURABLE_PATTERNS = [
  /\b(?:we(?:'ll| will)?|let's|plan is|decision is|recommended|use|using|configured|set to|remember)\b/i,
  /\b(?:fixed|resolved|migrated|installed|enabled|disabled|created|updated)\b/i,
];

const TOOL_DURABLE_PATTERNS = [
  /\b(?:created|updated|configured|installed|migrated|fixed|resolved|generated|saved|wrote|set)\b/i,
  /\b(?:namespace|workspace|project|plugin|database|schema|endpoint|config|mode|version)\b/i,
];

const CODING_KEYWORDS = [
  // Existing
  "bug",
  "error",
  "fix",
  "debug",
  "implement",
  "build",
  "create",
  "refactor",
  "function",
  "class",
  "api",
  "endpoint",
  "database",
  "query",
  "test",
  "deploy",
  "config",
  "install",
  "code",
  "script",
  // Common agent tasks
  "update",
  "change",
  "modify",
  "add",
  "remove",
  "delete",
  "move",
  "rename",
  "split",
  "merge",
  "migrate",
  "component",
  "module",
  "service",
  "route",
  "page",
  "schema",
  "model",
  "type",
  "interface",
  "import",
  "export",
  "dependency",
  "package",
  "lint",
  "format",
  "optimize",
  "performance",
  "docker",
  "container",
  "ci",
  "cd",
  "pipeline",
  "commit",
  "push",
  "pull",
  "branch",
  "file",
  "directory",
  "folder",
  "path",
  "setup",
  "configure",
  "initialize",
  "scaffold",
  "server",
  "client",
  "frontend",
  "backend",
  "style",
  "css",
  "layout",
  "responsive",
  "auth",
  "login",
  "session",
  "token",
  "cache",
  "queue",
  "worker",
  "cron",
];

const SUCCESS_PATTERNS = [
  /\b(?:fixed|works?|working|resolved|passing|tests?\s+pass(?:ed)?|build succeeded|all checks passed)\b/i,
  /\b(?:created|updated|configured|installed|enabled|disabled)\b/i,
];

const FAILURE_PATTERNS = [
  /\b(?:failed|failing|still broken|not working|error persists|blocked|stuck|build failed|tests? failed)\b/i,
];

export type TurnCaptureMessage = {
  role?: string;
  content?: string | null;
  toolName?: string | null;
};

export type AutoStoredMemoryResult = {
  action: "stored" | "updated" | "merged" | "skipped";
  id?: string;
  consolidated?: boolean;
  mergedWith?: string;
  warning?: string;
  matchedSecretCategories?: string[];
};

export type TurnMemoryCaptureSummary = {
  candidateCount: number;
  memoryIds: string[];
  merged: number;
  stored: number;
  updated: number;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeForDedup(value: string): string {
  return normalizeWhitespace(value).toLowerCase().replace(/\s+/g, " ");
}

function sanitizeCapturedText(value: string): string {
  return normalizeWhitespace(value).slice(0, 10_000);
}

function detectNoise(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < 10) {
    return true;
  }
  return NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function detectTerminalOutput(content: string): boolean {
  return TERMINAL_PATTERNS.some((pattern) => pattern.test(content));
}

function matchesCapturePatterns(content: string): boolean {
  if (detectNoise(content) || detectTerminalOutput(content) || content.length < 20) {
    return false;
  }
  return CAPTURE_PATTERNS.some((pattern) => pattern.test(content));
}

function classifyImportance(text: string): MemoryImportanceTier {
  for (const pattern of CRITICAL_PATTERNS) {
    if (pattern.test(text)) {
      return "critical";
    }
  }
  for (const pattern of HIGH_IMPORTANCE_PATTERNS) {
    if (pattern.test(text)) {
      return "high";
    }
  }
  return "normal";
}

/** Map importance tier to numeric score (1-10) for vector storage and display */
function importanceTierToScore(tier: MemoryImportanceTier): number {
  switch (tier) {
    case "critical": return 9;
    case "working": return 8;
    case "high": return 7;
    case "normal": return 5;
    default: return 5;
  }
}

function getMessageContent(message: TurnCaptureMessage): string {
  return typeof message.content === "string" ? message.content.trim() : "";
}

function splitCandidateSegments(content: string): string[] {
  return content
    .split(/\n{2,}|(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function shouldKeepCandidate(message: TurnCaptureMessage, segment: string): boolean {
  const role = (message.role ?? "").toLowerCase();
  if (!segment || detectNoise(segment)) {
    return false;
  }

  if (role === "user") {
    return matchesCapturePatterns(segment);
  }

  if (role === "assistant") {
    return (
      !detectTerminalOutput(segment) &&
      ASSISTANT_DURABLE_PATTERNS.some((pattern) => pattern.test(segment)) &&
      matchesCapturePatterns(segment)
    );
  }

  if (role === "tool" || role === "toolresult") {
    const looksDurable =
      TOOL_DURABLE_PATTERNS.some((pattern) => pattern.test(segment));
    return !detectTerminalOutput(segment) && looksDurable;
  }

  return false;
}

export function extractTurnMemoryCandidates(params: {
  captureUserOnly?: boolean;
  messages: TurnCaptureMessage[];
}): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const message of params.messages) {
    const role = (message.role ?? "").toLowerCase();
    if (params.captureUserOnly && role !== "user") {
      continue;
    }

    const content = getMessageContent(message);
    if (!content) {
      continue;
    }

    const segments = splitCandidateSegments(content);
    for (const segment of segments) {
      if (!shouldKeepCandidate(message, segment)) {
        continue;
      }
      const candidate = sanitizeCapturedText(segment);
      const key = normalizeForDedup(candidate);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      candidates.push(candidate);
      if (candidates.length >= 12) {
        return candidates;
      }
    }
  }

  return candidates;
}

export async function storeAutoMemory(params: {
  namespaceId?: string | null;
  sessionId?: string | null;
  text: string;
  userId: string;
  peer?: MemoryPeer;
  sessionMeta?: Record<string, unknown>;
}): Promise<AutoStoredMemoryResult> {
  const text = sanitizeCapturedText(params.text);
  if (!text) {
    return {
      action: "skipped",
      warning: "Empty memory text",
    };
  }

  const matchedSecretCategories = detectSecretCategories(text);
  if (matchedSecretCategories.length > 0) {
    return {
      action: "skipped",
      warning:
        "This looks like a sensitive credential. Store it in your secure vault instead of memories.",
      matchedSecretCategories,
    };
  }

  const memoryType: MemoryKind = classifyMemoryType(text.slice(0, 60), text);
  const importanceTier = classifyImportance(text);

  let entities: string[] = [];
  try {
    entities = extractEntities(text);
  } catch {
    // Best effort.
  }

  let structuredMetadata: Record<string, unknown> | null = null;
  let textForEmbedding = text;

  try {
    const classificationResult = await classifyMemory(text);
    if (classificationResult.structured) {
      structuredMetadata = {
        classified: {
          type: classificationResult.type,
          confidence: classificationResult.confidence,
          fields: classificationResult.structured.fields,
          canonical: classificationResult.structured.canonical,
        },
      };
      textForEmbedding = classificationResult.structured.canonical;
      entities = [...new Set([...entities, ...classificationResult.entities])];
    } else if (classificationResult.type !== "general") {
      structuredMetadata = {
        classified: {
          type: classificationResult.type,
          confidence: classificationResult.confidence,
          entities: classificationResult.entities,
        },
      };
    }
  } catch (error) {
    console.error("Memory classification failed:", error);
  }

  let embedding: number[] | null = null;
  try {
    embedding = await embedText(textForEmbedding);
  } catch {
    // Continue without vector consolidation.
  }

  if (embedding) {
    try {
      const hits = await semanticSearchVectors({
        userId: params.userId,
        query: text,
        vector: embedding,
        topK: 3,
      });
      const similarHit = hits.find((hit) => hit.score >= CONSOLIDATION_THRESHOLD);
      if (similarHit) {
        const [existing] = await getAgentMemoriesByIds({
          userId: params.userId,
          ids: [similarHit.item.id],
          namespaceId: params.namespaceId,
        });

        if (existing) {
          const existingNormalized = normalizeForDedup(existing.text);
          const nextNormalized = normalizeForDedup(text);
          if (existingNormalized === nextNormalized || existing.text.includes(text)) {
            invalidateLocalResultsByMemoryIds(params.userId, [existing.id]);
            return {
              action: "merged",
              id: existing.id,
              consolidated: true,
              mergedWith: existing.id,
            };
          }

          const newText = `${existing.text}\n\n${text}`;
          await updateAgentMemory(params.userId, existing.id, { text: newText });
          invalidateLocalResultsByMemoryIds(params.userId, [existing.id]);

          try {
            const newEmbedding = await embedText(newText);
            await upsertMemoryVector({
              memoryId: existing.id,
              userId: params.userId,
              title: existing.title,
              sourceType: existing.sourceType,
              memoryType: existing.memoryType,
              importance: importanceTierToScore(importanceTier),
              vector: newEmbedding,
            });
          } catch {
            // Best effort.
          }

          return {
            action: "updated",
            id: existing.id,
            consolidated: true,
            mergedWith: existing.id,
          };
        }
      }
    } catch {
      // Fall back to creating a new memory.
    }
  }

  const peer = params.peer ?? classifyPeer(text);

  // Auto-detect project scope from session metadata and enrich memory metadata
  if (params.sessionMeta) {
    const scope = detectProjectScope({
      sessionMeta: params.sessionMeta,
      messageText: text,
    });
    if (scope.detected && scope.scope) {
      structuredMetadata = {
        ...(structuredMetadata ?? {}),
        projectScope: scope.scope,
      };
    }
  }

  const memory = await insertAgentMemory({
    userId: params.userId,
    title: text.slice(0, 60),
    text,
    memoryType,
    importanceTier,
    entities,
    metadata: structuredMetadata ?? undefined,
    namespaceId: params.namespaceId,
    sessionId: params.sessionId,
    peer,
  });

  if (embedding) {
    try {
      await upsertMemoryVector({
        memoryId: memory.id,
        userId: params.userId,
        title: memory.title,
        sourceType: memory.sourceType,
        memoryType: memory.memoryType,
        importance: importanceTierToScore(importanceTier),
        vector: embedding,
      });
    } catch {
      // Best effort.
    }
  }

  invalidateAllLocalResultsForUser(params.userId);

  // Fire-and-forget micro-dream (non-blocking)
  runMicroDream({
    userId: params.userId,
    memoryId: memory.id,
    memoryText: text,
    namespaceId: params.namespaceId ?? null,
  }).catch((e) => console.warn("[MicroDream] failed:", e)); // Never block the response

  return {
    action: "stored",
    id: memory.id,
  };
}

export async function captureTurnMemories(params: {
  captureUserOnly?: boolean;
  messages: TurnCaptureMessage[];
  namespaceId?: string | null;
  sessionId?: string | null;
  userId: string;
}): Promise<TurnMemoryCaptureSummary> {
  const candidates = extractTurnMemoryCandidates({
    captureUserOnly: params.captureUserOnly,
    messages: params.messages,
  });

  let stored = 0;
  let updated = 0;
  let merged = 0;
  const memoryIds = new Set<string>();

  for (const candidate of candidates) {
    const result = await storeAutoMemory({
      userId: params.userId,
      namespaceId: params.namespaceId,
      sessionId: params.sessionId,
      text: candidate,
    });

    if (result.id) {
      memoryIds.add(result.id);
    }

    if (result.action === "stored") {
      stored += 1;
    } else if (result.action === "updated") {
      updated += 1;
    } else if (result.action === "merged") {
      merged += 1;
    }
  }

  return {
    candidateCount: candidates.length,
    memoryIds: [...memoryIds],
    merged,
    stored,
    updated,
  };
}

function looksLikeCodingTurn(messages: TurnCaptureMessage[]): boolean {
  const combined = messages
    .map((message) => getMessageContent(message).toLowerCase())
    .join(" ");
  return CODING_KEYWORDS.some((keyword) => combined.includes(keyword));
}

type CognitiveTraceType = 'coding_turn' | 'debugging' | 'user_correction' | 'knowledge_gap' | 'best_practice' | 'feature_request';

function detectTraceType(messages: TurnCaptureMessage[]): CognitiveTraceType | null {
  const recent = messages.slice(-6);
  const user_messages = recent
    .filter(m => (m.role ?? '').toLowerCase() === 'user')
    .map(m => getMessageContent(m).toLowerCase());
  const all_text = recent.map(m => getMessageContent(m).toLowerCase()).join(' ');

  // User correction detection (highest signal)
  const correction_patterns = [
    "no, that's wrong", "no that's wrong", "that's not right", "that's incorrect",
    "actually, it should", "actually it should", "you're wrong",
    "that's outdated", "that's not how", "not what i asked",
    "wrong approach", "that's the wrong", "no, use", "no, do it",
    "i said", "i meant", "that's not correct",
  ];
  for (const pattern of correction_patterns) {
    if (user_messages.some(m => m.includes(pattern))) return 'user_correction';
  }

  // Feature request detection
  const feature_patterns = [
    "can you also", "i wish you could", "is there a way to",
    "why can't you", "it would be nice if", "could you add",
    "we need a", "we should add", "missing feature",
  ];
  for (const pattern of feature_patterns) {
    if (user_messages.some(m => m.includes(pattern))) return 'feature_request';
  }

  // Knowledge gap (agent admits uncertainty or user provides unknown info)
  const knowledge_patterns = [
    "i didn't know", "wasn't aware", "that's new to me",
    "my knowledge", "i was wrong about", "outdated information",
    "actually the api", "the docs say", "according to",
  ];
  if (knowledge_patterns.some(p => all_text.includes(p))) return 'knowledge_gap';

  // Debugging (error-focused)
  const debug_patterns = [
    "error", "exception", "stack trace", "failed", "crash",
    "bug", "broken", "not working", "fix this", "debug",
  ];
  if (debug_patterns.some(p => all_text.includes(p))) return 'debugging';

  // Best practice (optimization, cleanup)
  const practice_patterns = [
    "better way", "best practice", "optimize", "clean up",
    "refactor", "improve", "simplify", "more efficient",
  ];
  if (practice_patterns.some(p => all_text.includes(p))) return 'best_practice';

  // Default coding turn
  if (looksLikeCodingTurn(messages)) return 'coding_turn';

  return null;
}

function detectTraceOutcome(messages: TurnCaptureMessage[]): "success" | "partial" | "failed" {
  const combined = messages
    .slice(-6)
    .map((message) => getMessageContent(message))
    .join(" ");
  if (FAILURE_PATTERNS.some((pattern) => pattern.test(combined))) {
    return "failed";
  }
  if (SUCCESS_PATTERNS.some((pattern) => pattern.test(combined))) {
    return "success";
  }
  return "partial";
}

function inferTechnologies(text: string): string[] {
  const techPatterns: Record<string, RegExp> = {
    typescript: /typescript|\.tsx?|tsc/i,
    javascript: /javascript|\.jsx?|node/i,
    react: /react|jsx|useState|useEffect/i,
    nextjs: /next\.js|app router/i,
    postgres: /postgres|psql|pg_/i,
    python: /python|\.py|pip/i,
    docker: /docker|container/i,
    git: /\bgit\b|commit|branch|merge/i,
  };

  return Object.entries(techPatterns)
    .filter(([, pattern]) => pattern.test(text))
    .map(([key]) => key);
}

function inferFilesModified(text: string): string[] {
  const filePattern = /(?:^|[\s("'`])((?:[\w.-]+\/)*[\w.-]+\.(?:ts|tsx|js|jsx|json|md|sql|py|go|rs|java|rb|sh|yaml|yml))(?:$|[\s)"'`:,])/g;
  const matches = new Set<string>();
  for (const match of text.matchAll(filePattern)) {
    if (match[1]) {
      matches.add(match[1]);
    }
  }
  return [...matches].slice(0, 25);
}

function inferErrorMessages(text: string): string[] {
  return Array.from(
    text.matchAll(/(?:TypeError|ReferenceError|SyntaxError|Error|Cannot\s+[^\n.]+)/gi),
    (match) => sanitizeCapturedText(match[0].slice(0, 240)),
  ).slice(0, 5);
}

export async function captureCodingTraceFromTurn(params: {
  messages: TurnCaptureMessage[];
  sessionId: string;
  userId: string;
}): Promise<boolean> {
  const trace_type = detectTraceType(params.messages);
  if (!trace_type) {
    return false;
  }

  const firstUser = params.messages.find((message) => (message.role ?? "").toLowerCase() === "user");
  if (!firstUser?.content) {
    return false;
  }

  const assistantText = params.messages
    .filter((message) => (message.role ?? "").toLowerCase() === "assistant")
    .map((message) => getMessageContent(message))
    .filter(Boolean)
    .join("\n\n");
  const combinedText = params.messages.map((message) => getMessageContent(message)).join("\n\n");
  const reasoning = sanitizeCapturedText(assistantText || combinedText).slice(0, 4000);
  if (reasoning.length < 40) {
    return false;
  }

  const outcome = detectTraceOutcome(params.messages);
  const problem = sanitizeCapturedText(getMessageContent(firstUser)).slice(0, 600);
  const filesModified = inferFilesModified(combinedText);
  const technologies = inferTechnologies(combinedText);
  const errorMessages = inferErrorMessages(combinedText);
  const toolsUsed = params.messages
    .map((message) => (typeof message.toolName === "string" ? message.toolName : null))
    .filter((toolName): toolName is string => Boolean(toolName));

  const trace = await createTrace({
    userId: params.userId,
    sessionId: params.sessionId,
    type: trace_type,
    problem,
    context: {
      technologies,
      errorMessages,
      filesModified,
    },
    reasoning,
    approaches: [],
    solution:
      outcome === "success"
        ? sanitizeCapturedText(
            params.messages
              .filter((message) => (message.role ?? "").toLowerCase() === "assistant")
              .slice(-1)
              .map((message) => getMessageContent(message))
              .join("\n\n"),
          ).slice(0, 1400)
        : undefined,
    outcome,
    automatedSignals: {
      toolCalls: [],
      toolResults: [],
      verificationCommands: [],
      retryCount: 0,
      resolutionKind: outcome === "success" ? "manual_only" : "failed",
    },
    toolsUsed,
    filesModified,
    durationMs: 0,
    sanitized: true,
    sanitizedAt: new Date().toISOString(),
    shareEligible: false,
  });

  const matchedPatterns = await getMatchingPatterns({
    userId: params.userId,
    problem,
    technologies,
    limit: 5,
  });
  await syncTracePatternMatches({
    userId: params.userId,
    traceId: trace.id,
    patterns: matchedPatterns.map((pattern) => ({ id: pattern.id, score: pattern.score })),
    matchSource: "trace_capture",
  });

  return true;
}

export { VAULT_HINT_MESSAGE };
