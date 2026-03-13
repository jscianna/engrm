import { validateApiKey } from "@/lib/api-auth";
import {
  archiveAgentMemoriesByIds,
  deleteAgentMemoriesByIds,
  getSessionById,
  insertMemoryWithMetadata,
  listSessionMemories,
} from "@/lib/db";
import { embedText } from "@/lib/embeddings";
import { extractEntities } from "@/lib/entities";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";
import { LLMError, callLLM } from "@/lib/llm";
import { upsertMemoryVector } from "@/lib/qdrant";

export const runtime = "nodejs";

type SummaryPayload = {
  title?: string;
  summary?: string;
  keyFacts?: string[];
  preferences?: string[];
  importantContext?: string[];
  timeline?: string[];
};

function llmErrorResponse(error: LLMError): Response {
  return Response.json(
    {
      error: {
        code: error.code,
        message: "Session summarization is temporarily unavailable.",
        details: { reason: error.message },
      },
    },
    { status: error.status },
  );
}

function parseSummaryPayload(raw: string): SummaryPayload {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return {
    title: typeof parsed.title === "string" ? parsed.title.trim() : undefined,
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : undefined,
    keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [],
    preferences: Array.isArray(parsed.preferences) ? parsed.preferences.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [],
    importantContext: Array.isArray(parsed.importantContext) ? parsed.importantContext.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [],
    timeline: Array.isArray(parsed.timeline) ? parsed.timeline.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [],
  };
}

function buildSummaryText(payload: SummaryPayload): string {
  const sections = [
    payload.summary ? `Summary\n${payload.summary}` : "",
    payload.keyFacts?.length ? `Key facts learned\n- ${payload.keyFacts.join("\n- ")}` : "",
    payload.preferences?.length ? `User preferences identified\n- ${payload.preferences.join("\n- ")}` : "",
    payload.importantContext?.length ? `Important context\n- ${payload.importantContext.join("\n- ")}` : "",
    payload.timeline?.length ? `Temporal ordering\n- ${payload.timeline.join("\n- ")}` : "",
  ].filter(Boolean);

  return sections.join("\n\n").trim();
}

function buildSummarizePrompt(memories: Array<{ id: string; title: string; text: string; createdAt: string }>): string {
  return JSON.stringify({
    task: "Summarize a single session's memories into one structured memory.",
    instructions: [
      "Preserve temporal ordering in the timeline output.",
      "Extract durable key facts, user preferences, and important context.",
      "Use concise, factual language. Do not mention that this is an LLM summary.",
    ],
    outputSchema: {
      title: "short summary title",
      summary: "short paragraph",
      keyFacts: ["fact"],
      preferences: ["preference"],
      importantContext: ["context"],
      timeline: ["ordered event"],
    },
    sessionMemories: memories,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "sessions.summarize");
    const { id: sessionId } = await context.params;
    const session = await getSessionById(identity.userId, sessionId);
    if (!session) {
      throw new FatHippoError("SESSION_NOT_FOUND");
    }

    const body = (await request.json().catch(() => ({}))) as unknown;
    if (!isObject(body)) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "body", reason: "object required" });
    }

    const deleteOriginals = body.deleteOriginals === true;
    const memories = (await listSessionMemories(identity.userId, sessionId)).filter(
      (memory) => memory.memoryType !== "session_summary",
    );

    if (memories.length === 0) {
      throw new FatHippoError("VALIDATION_ERROR", {
        field: "sessionId",
        reason: "No session memories available to summarize",
      });
    }

    const llmResponse = await callLLM(
      buildSummarizePrompt(
        memories.map((memory) => ({
          id: memory.id,
          title: memory.title,
          text: memory.text.slice(0, 2500),
          createdAt: memory.createdAt,
        })),
      ),
      "You maintain an AI memory system. Respond with valid JSON only.",
    );

    const payload = parseSummaryPayload(llmResponse);
    const text = buildSummaryText(payload);
    if (!text) {
      throw new FatHippoError("VALIDATION_ERROR", {
        field: "summary",
        reason: "LLM returned an empty session summary",
      });
    }

    const summarizedAt = new Date().toISOString();
    const vector = await embedText(text.slice(0, 6000));
    const summaryMemory = await insertMemoryWithMetadata({
      userId: identity.userId,
      title: payload.title ?? `Session summary ${sessionId}`,
      text,
      embedding: vector,
      memoryType: "session_summary",
      importance: 8,
      entities: extractEntities(text),
      namespaceId: session.namespaceId,
      sessionId,
      metadata: {
        originalSessionId: sessionId,
        memoryCount: memories.length,
        summarizedAt,
      },
    });

    await upsertMemoryVector({
      memoryId: summaryMemory.id,
      userId: summaryMemory.userId,
      title: summaryMemory.title,
      sourceType: summaryMemory.sourceType,
      memoryType: "session_summary",
      importance: 8,
      vector,
    });

    const originalIds = memories.map((memory) => memory.id);
    const affectedOriginals = deleteOriginals
      ? await deleteAgentMemoriesByIds(identity.userId, originalIds)
      : await archiveAgentMemoriesByIds(identity.userId, originalIds);

    return Response.json({
      memory: summaryMemory,
      stats: {
        originalCount: memories.length,
        deletedOriginals: deleteOriginals ? affectedOriginals : 0,
        archivedOriginals: deleteOriginals ? 0 : affectedOriginals,
      },
    });
  } catch (error) {
    if (error instanceof LLMError) {
      return llmErrorResponse(error);
    }
    return errorResponse(error);
  }
}
