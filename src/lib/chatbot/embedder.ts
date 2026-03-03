import { embedText } from "@/lib/embeddings";

export async function embedChatbotText(input: string): Promise<number[]> {
  return embedText(input);
}
