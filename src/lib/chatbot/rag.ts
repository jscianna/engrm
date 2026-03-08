import { embedChatbotText } from "@/lib/chatbot/embedder";
import {
  listChunksByChatbot,
  listSourcesByChatbot,
  type ChunkRecord,
} from "@/lib/chatbot/storage";

export type RankedChunk = {
  chunk: ChunkRecord;
  score: number;
  sourceName: string | null;
};

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dot / magnitude;
}

export async function retrieveRelevantChunks(params: {
  chatbotId: string;
  query: string;
  limit?: number;
}): Promise<RankedChunk[]> {
  const queryEmbedding = await embedChatbotText(params.query);
  // TODO: Push source metadata into the chunk query path so this stays O(n) over chunks, not chunks + sources.
  const [chunks, sources] = await Promise.all([
    listChunksByChatbot(params.chatbotId),
    listSourcesByChatbot(params.chatbotId),
  ]);
  const sourceNameById = new Map(sources.map((source) => [source.id, source.name]));
  const topK = params.limit ?? 5;

  const scored = chunks.map((chunk) => ({
    chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding ?? []),
    sourceName: sourceNameById.get(chunk.sourceId) ?? null,
  }));

  return scored.sort((left, right) => right.score - left.score).slice(0, topK);
}

export function buildRagContext(matches: RankedChunk[]): {
  context: string;
  sourcesUsed: string[];
} {
  const relevant = matches.filter((match) => match.chunk.content.trim());
  if (relevant.length === 0) {
    return {
      context: "No relevant knowledge base context was found.",
      sourcesUsed: [],
    };
  }

  const context = relevant
    .map((match, index) => {
      const header = match.sourceName
        ? `Source ${index + 1} (${match.sourceName})`
        : `Source ${index + 1}`;
      return `${header}\n${match.chunk.content}`;
    })
    .join("\n\n");

  return {
    context,
    sourcesUsed: relevant.map((match) => match.chunk.id),
  };
}
