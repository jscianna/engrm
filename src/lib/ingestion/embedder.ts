import { embedText } from "@/lib/embeddings";

export async function embedDocumentText(input: string): Promise<number[]> {
  return embedText(input);
}
