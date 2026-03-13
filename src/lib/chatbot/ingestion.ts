import { chunkText } from "@/lib/chatbot/chunker";
import { embedChatbotText } from "@/lib/chatbot/embedder";
import {
  createSource,
  getChatbotById,
  getSourceById,
  replaceSourceChunks,
  updateSource,
  type ChatbotRecord,
  type SourceRecord,
  type SourceType,
} from "@/lib/chatbot/storage";
import { FatHippoError } from "@/lib/errors";

function resolveChunkType(type: SourceType): "text" | "markdown" {
  return type === "markdown" ? "markdown" : "text";
}

function assertSupportedSourceType(type: SourceType): void {
  if (type === "pdf") {
    throw new FatHippoError("VALIDATION_ERROR", {
      field: "type",
      reason: "PDF ingestion is not implemented in Phase 1",
    });
  }
}

export async function ingestSource(params: {
  userId: string;
  chatbotId: string;
  type: SourceType;
  name: string;
  url?: string | null;
  content: string;
}): Promise<{ chatbot: ChatbotRecord; source: SourceRecord }> {
  assertSupportedSourceType(params.type);

  const chatbot = await getChatbotById(params.userId, params.chatbotId);
  if (!chatbot) {
    throw new FatHippoError("CHATBOT_NOT_FOUND");
  }

  const source = await createSource({
    chatbotId: params.chatbotId,
    type: params.type,
    name: params.name,
    url: params.url ?? null,
    content: params.content,
    status: "processing",
  });

  try {
    const chunks = chunkText(params.content, {
      type: resolveChunkType(params.type),
      chunkSize: 512,
      overlap: 50,
    });

    const embeddedChunks = [];
    for (const chunk of chunks) {
      const embedding = await embedChatbotText(chunk.content);
      embeddedChunks.push({
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        embedding,
        metadata: chunk.metadata,
      });
    }

    await replaceSourceChunks(source.id, params.chatbotId, embeddedChunks);
    const updated = await updateSource({
      chatbotId: params.chatbotId,
      sourceId: source.id,
      chunkCount: embeddedChunks.length,
      status: "ready",
      errorMessage: null,
    });

    if (!updated) {
      throw new Error("Failed to update source after ingestion");
    }

    return { chatbot, source: updated };
  } catch (error) {
    await updateSource({
      chatbotId: params.chatbotId,
      sourceId: source.id,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown ingestion error",
    });
    throw error;
  }
}

export async function getOwnedSource(params: {
  userId: string;
  chatbotId: string;
  sourceId: string;
}): Promise<SourceRecord> {
  const chatbot = await getChatbotById(params.userId, params.chatbotId);
  if (!chatbot) {
    throw new FatHippoError("CHATBOT_NOT_FOUND");
  }

  const source = await getSourceById(params.chatbotId, params.sourceId);
  if (!source) {
    throw new FatHippoError("SOURCE_NOT_FOUND");
  }

  return source;
}
