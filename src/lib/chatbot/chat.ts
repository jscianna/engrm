import {
  createConversation,
  createMessage,
  getChatbotById,
  getConversationById,
  listMessagesByConversation,
  touchConversation,
  type ChatbotRecord,
  type ConversationRecord,
  type MessageRecord,
} from "@/lib/chatbot/storage";
import { buildRagContext, retrieveRelevantChunks } from "@/lib/chatbot/rag";
import { MemryError } from "@/lib/errors";

type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type StreamProviderArgs = {
  chatbot: ChatbotRecord;
  systemPrompt: string;
  history: ChatHistoryMessage[];
  userMessage: string;
};

function summarizeTitle(message: string): string {
  return message.trim().replace(/\s+/g, " ").slice(0, 80) || "New conversation";
}

function buildSystemPrompt(chatbot: ChatbotRecord, context: string): string {
  const basePrompt =
    chatbot.systemPrompt?.trim() ||
    "You are a retrieval-augmented assistant. Answer using the provided context.";

  return `${basePrompt}

Use the knowledge base context below when answering. If the answer is not supported by the context, say that clearly.

Knowledge base context:
${context}`;
}

async function ensureConversation(params: {
  chatbotId: string;
  conversationId?: string;
  sessionId?: string | null;
  firstUserMessage: string;
}): Promise<ConversationRecord> {
  if (params.conversationId) {
    const existing = await getConversationById(params.chatbotId, params.conversationId);
    if (!existing) {
      throw new MemryError("CONVERSATION_NOT_FOUND");
    }
    return existing;
  }

  return createConversation({
    chatbotId: params.chatbotId,
    sessionId: params.sessionId ?? null,
    title: summarizeTitle(params.firstUserMessage),
  });
}

async function streamOpenAiCompletion(args: StreamProviderArgs): Promise<ReadableStream<Uint8Array>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for chatbot responses");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: args.chatbot.model,
      temperature: args.chatbot.temperature,
      stream: true,
      messages: [
        { role: "system", content: args.systemPrompt },
        ...args.history,
        { role: "user", content: args.userMessage },
      ],
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`OpenAI chat request failed with ${response.status}`);
  }

  return response.body;
}

async function streamAnthropicCompletion(args: StreamProviderArgs): Promise<ReadableStream<Uint8Array>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for Claude chatbot models");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: args.chatbot.model,
      temperature: args.chatbot.temperature,
      max_tokens: 1024,
      stream: true,
      system: args.systemPrompt,
      messages: [...args.history, { role: "user", content: args.userMessage }],
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Anthropic chat request failed with ${response.status}`);
  }

  return response.body;
}

async function getProviderStream(args: StreamProviderArgs): Promise<ReadableStream<Uint8Array>> {
  if (args.chatbot.model.toLowerCase().startsWith("claude")) {
    return streamAnthropicCompletion(args);
  }

  return streamOpenAiCompletion(args);
}

async function* readProviderText(
  chatbot: ChatbotRecord,
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (!line.startsWith("data:")) {
        newlineIndex = buffer.indexOf("\n");
        continue;
      }

      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") {
        newlineIndex = buffer.indexOf("\n");
        continue;
      }

      try {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        if (chatbot.model.toLowerCase().startsWith("claude")) {
          if (parsed.type === "content_block_delta") {
            const delta = parsed.delta as { text?: string } | undefined;
            if (delta?.text) {
              yield delta.text;
            }
          }
        } else {
          const choices = parsed.choices as Array<{ delta?: { content?: string } }> | undefined;
          const content = choices?.[0]?.delta?.content;
          if (typeof content === "string" && content.length > 0) {
            yield content;
          }
        }
      } catch {
        // Ignore non-JSON lines from the provider stream.
      }

      newlineIndex = buffer.indexOf("\n");
    }
  }
}

export async function streamChatReply(params: {
  userId: string;
  chatbotId: string;
  conversationId?: string;
  sessionId?: string | null;
  message: string;
}): Promise<{
  conversation: ConversationRecord;
  stream: ReadableStream<Uint8Array>;
  sourcesUsed: string[];
}> {
  const chatbot = await getChatbotById(params.userId, params.chatbotId);
  if (!chatbot) {
    throw new MemryError("CHATBOT_NOT_FOUND");
  }

  const conversation = await ensureConversation({
    chatbotId: params.chatbotId,
    conversationId: params.conversationId,
    sessionId: params.sessionId ?? null,
    firstUserMessage: params.message,
  });
  const history = await listMessagesByConversation(conversation.id);
  await createMessage({
    conversationId: conversation.id,
    role: "user",
    content: params.message,
  });

  const matches = await retrieveRelevantChunks({
    chatbotId: params.chatbotId,
    query: params.message,
    limit: 5,
  });
  const { context, sourcesUsed } = buildRagContext(matches);
  const systemPrompt = buildSystemPrompt(chatbot, context);
  const providerStream = await getProviderStream({
    chatbot,
    systemPrompt,
    history: history.map((message): ChatHistoryMessage => ({
      role: message.role,
      content: message.content,
    })),
    userMessage: params.message,
  });

  const encoder = new TextEncoder();
  let assistantResponse = "";
  let persisted = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of readProviderText(chatbot, providerStream)) {
          assistantResponse += delta;
          controller.enqueue(encoder.encode(delta));
        }

        if (!persisted) {
          await createMessage({
            conversationId: conversation.id,
            role: "assistant",
            content: assistantResponse.trim(),
            sourcesUsed,
          });
          await touchConversation(
            params.chatbotId,
            conversation.id,
            conversation.title ?? summarizeTitle(params.message),
          );
          persisted = true;
        }
        controller.close();
      } catch (error) {
        if (!persisted && assistantResponse.trim()) {
          await createMessage({
            conversationId: conversation.id,
            role: "assistant",
            content: assistantResponse.trim(),
            sourcesUsed,
          });
          await touchConversation(params.chatbotId, conversation.id, conversation.title);
        }
        controller.error(error);
      }
    },
  });

  return { conversation, stream, sourcesUsed };
}

export async function getConversationTranscript(params: {
  userId: string;
  chatbotId: string;
  conversationId: string;
}): Promise<{ chatbot: ChatbotRecord; conversation: ConversationRecord; messages: MessageRecord[] }> {
  const chatbot = await getChatbotById(params.userId, params.chatbotId);
  if (!chatbot) {
    throw new MemryError("CHATBOT_NOT_FOUND");
  }

  const conversation = await getConversationById(params.chatbotId, params.conversationId);
  if (!conversation) {
    throw new MemryError("CONVERSATION_NOT_FOUND");
  }

  const messages = await listMessagesByConversation(conversation.id);
  return { chatbot, conversation, messages };
}
