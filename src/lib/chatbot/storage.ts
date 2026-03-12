import crypto from "node:crypto";
import { ensureDatabaseMigrations } from "@/lib/db-migrations";
import { getDb } from "@/lib/turso";

// TODO: public_token exists in storage, but the public chatbot access flow is not finished yet.

type JsonValue = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

export type ChatbotRecord = {
  id: string;
  userId: string;
  name: string;
  systemPrompt: string | null;
  model: string;
  temperature: number;
  publicToken: string | null;
  welcomeMessage: string | null;
  theme: Record<string, unknown> | null;
  createdAt: number | null;
  updatedAt: number | null;
};

export type SourceType = "text" | "url" | "pdf" | "markdown";
export type SourceStatus = "pending" | "processing" | "ready" | "error";

export type SourceRecord = {
  id: string;
  chatbotId: string;
  type: SourceType;
  name: string;
  url: string | null;
  content: string | null;
  chunkCount: number;
  status: SourceStatus;
  errorMessage: string | null;
  createdAt: number | null;
};

export type ChunkRecord = {
  id: string;
  sourceId: string;
  chatbotId: string;
  content: string;
  embedding: number[] | null;
  chunkIndex: number;
  metadata: Record<string, unknown> | null;
  createdAt: number | null;
};

export type ConversationRecord = {
  id: string;
  chatbotId: string;
  sessionId: string | null;
  title: string | null;
  createdAt: number | null;
  updatedAt: number | null;
};

export type MessageRole = "user" | "assistant";

export type MessageRecord = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  sourcesUsed: string[] | null;
  createdAt: number | null;
};

type ChunkInsert = {
  content: string;
  chunkIndex: number;
  embedding: number[];
  metadata?: Record<string, unknown> | null;
};

let initialized = false;

function now(): number {
  return Date.now();
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function parseJson<T>(value: unknown): T | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function stringifyJson(value: JsonValue | undefined): string | null {
  if (typeof value === "undefined" || value === null) {
    return null;
  }
  return JSON.stringify(value);
}

function mapChatbotRow(row: Record<string, unknown>): ChatbotRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    systemPrompt: row.system_prompt ? String(row.system_prompt) : null,
    model: row.model ? String(row.model) : "gpt-4o-mini",
    temperature: Number(row.temperature ?? 0.7),
    publicToken: row.public_token ? String(row.public_token) : null,
    welcomeMessage: row.welcome_message ? String(row.welcome_message) : null,
    theme: parseJson<Record<string, unknown>>(row.theme_json),
    createdAt: row.created_at == null ? null : Number(row.created_at),
    updatedAt: row.updated_at == null ? null : Number(row.updated_at),
  };
}

function mapSourceRow(row: Record<string, unknown>): SourceRecord {
  return {
    id: String(row.id),
    chatbotId: String(row.chatbot_id),
    type: String(row.type) as SourceType,
    name: String(row.name),
    url: row.url ? String(row.url) : null,
    content: row.content ? String(row.content) : null,
    chunkCount: Number(row.chunk_count ?? 0),
    status: String(row.status ?? "pending") as SourceStatus,
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: row.created_at == null ? null : Number(row.created_at),
  };
}

function mapChunkRow(row: Record<string, unknown>): ChunkRecord {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    chatbotId: String(row.chatbot_id),
    content: String(row.content),
    embedding: parseJson<number[]>(row.embedding),
    chunkIndex: Number(row.chunk_index ?? 0),
    metadata: parseJson<Record<string, unknown>>(row.metadata),
    createdAt: row.created_at == null ? null : Number(row.created_at),
  };
}

function mapConversationRow(row: Record<string, unknown>): ConversationRecord {
  return {
    id: String(row.id),
    chatbotId: String(row.chatbot_id),
    sessionId: row.session_id ? String(row.session_id) : null,
    title: row.title ? String(row.title) : null,
    createdAt: row.created_at == null ? null : Number(row.created_at),
    updatedAt: row.updated_at == null ? null : Number(row.updated_at),
  };
}

function mapMessageRow(row: Record<string, unknown>): MessageRecord {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    role: String(row.role) as MessageRole,
    content: String(row.content),
    sourcesUsed: parseJson<string[]>(row.sources_used),
    createdAt: row.created_at == null ? null : Number(row.created_at),
  };
}

export async function ensureChatbotTables(): Promise<void> {
  if (initialized) {
    return;
  }

  await ensureDatabaseMigrations();
  const client = getDb();
  // TODO: This raw bootstrap DDL overlaps with Drizzle schema definitions in src/lib/db/schema.ts.
  // Pick a single schema source of truth to avoid future drift.
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS chatbots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      system_prompt TEXT,
      model TEXT DEFAULT 'gpt-4o-mini',
      temperature REAL DEFAULT 0.7,
      public_token TEXT UNIQUE,
      welcome_message TEXT,
      theme_json TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_chatbots_user_created_at
    ON chatbots(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      chatbot_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      url TEXT,
      content TEXT,
      chunk_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      created_at INTEGER,
      FOREIGN KEY (chatbot_id) REFERENCES chatbots(id)
    );

    CREATE INDEX IF NOT EXISTS idx_sources_chatbot_created_at
    ON sources(chatbot_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      chatbot_id TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding TEXT,
      chunk_index INTEGER,
      metadata TEXT,
      created_at INTEGER,
      FOREIGN KEY (source_id) REFERENCES sources(id),
      FOREIGN KEY (chatbot_id) REFERENCES chatbots(id)
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_chatbot
    ON chunks(chatbot_id);

    CREATE INDEX IF NOT EXISTS idx_chunks_source_order
    ON chunks(source_id, chunk_index);

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      chatbot_id TEXT NOT NULL,
      session_id TEXT,
      title TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      FOREIGN KEY (chatbot_id) REFERENCES chatbots(id)
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_chatbot_updated_at
    ON conversations(chatbot_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sources_used TEXT,
      created_at INTEGER,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
    ON messages(conversation_id, created_at ASC);
  `);

  initialized = true;
}

export async function createChatbot(params: {
  userId: string;
  name: string;
  systemPrompt?: string | null;
  model?: string | null;
  temperature?: number | null;
  welcomeMessage?: string | null;
  theme?: Record<string, unknown> | null;
}): Promise<ChatbotRecord> {
  await ensureChatbotTables();

  const id = makeId("bot");
  const timestamp = now();
  const client = getDb();
  await client.execute({
    sql: `
      INSERT INTO chatbots (
        id, user_id, name, system_prompt, model, temperature, public_token,
        welcome_message, theme_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      id,
      params.userId,
      params.name,
      params.systemPrompt ?? null,
      params.model ?? "gpt-4o-mini",
      params.temperature ?? 0.7,
      crypto.randomUUID().replaceAll("-", ""),
      params.welcomeMessage ?? null,
      stringifyJson(params.theme),
      timestamp,
      timestamp,
    ],
  });

  const chatbot = await getChatbotById(params.userId, id);
  if (!chatbot) {
    throw new Error("Failed to create chatbot");
  }
  return chatbot;
}

export async function listChatbotsByUser(userId: string): Promise<ChatbotRecord[]> {
  await ensureChatbotTables();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, user_id, name, system_prompt, model, temperature, public_token,
             welcome_message, theme_json, created_at, updated_at
      FROM chatbots
      WHERE user_id = ?
      ORDER BY created_at DESC
    `,
    args: [userId],
  });

  return result.rows.map((row) => mapChatbotRow(row as Record<string, unknown>));
}

export async function getChatbotById(
  userId: string,
  chatbotId: string,
): Promise<ChatbotRecord | null> {
  await ensureChatbotTables();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, user_id, name, system_prompt, model, temperature, public_token,
             welcome_message, theme_json, created_at, updated_at
      FROM chatbots
      WHERE user_id = ? AND id = ?
      LIMIT 1
    `,
    args: [userId, chatbotId],
  });

  if (result.rows.length === 0) {
    return null;
  }

  return mapChatbotRow(result.rows[0] as Record<string, unknown>);
}

export async function updateChatbot(
  userId: string,
  chatbotId: string,
  patch: {
    name?: string;
    systemPrompt?: string | null;
    model?: string | null;
    temperature?: number | null;
    welcomeMessage?: string | null;
    theme?: Record<string, unknown> | null;
  },
): Promise<ChatbotRecord | null> {
  const existing = await getChatbotById(userId, chatbotId);
  if (!existing) {
    return null;
  }

  const client = getDb();
  const updatedAt = now();
  await client.execute({
    sql: `
      UPDATE chatbots
      SET name = ?, system_prompt = ?, model = ?, temperature = ?,
          welcome_message = ?, theme_json = ?, updated_at = ?
      WHERE user_id = ? AND id = ?
    `,
    args: [
      patch.name ?? existing.name,
      typeof patch.systemPrompt === "undefined" ? existing.systemPrompt : patch.systemPrompt,
      patch.model ?? existing.model,
      typeof patch.temperature === "number" ? patch.temperature : existing.temperature,
      typeof patch.welcomeMessage === "undefined"
        ? existing.welcomeMessage
        : patch.welcomeMessage,
      typeof patch.theme === "undefined" ? stringifyJson(existing.theme) : stringifyJson(patch.theme),
      updatedAt,
      userId,
      chatbotId,
    ],
  });

  return getChatbotById(userId, chatbotId);
}

export async function deleteChatbot(userId: string, chatbotId: string): Promise<boolean> {
  await ensureChatbotTables();
  const client = getDb();

  const chatbot = await getChatbotById(userId, chatbotId);
  if (!chatbot) {
    return false;
  }

  await client.execute({
    sql: `
      DELETE FROM messages
      WHERE conversation_id IN (
        SELECT id FROM conversations WHERE chatbot_id = ?
      )
    `,
    args: [chatbotId],
  });
  await client.execute({
    sql: `DELETE FROM conversations WHERE chatbot_id = ?`,
    args: [chatbotId],
  });
  await client.execute({
    sql: `DELETE FROM chunks WHERE chatbot_id = ?`,
    args: [chatbotId],
  });
  await client.execute({
    sql: `DELETE FROM sources WHERE chatbot_id = ?`,
    args: [chatbotId],
  });
  const result = await client.execute({
    sql: `DELETE FROM chatbots WHERE user_id = ? AND id = ?`,
    args: [userId, chatbotId],
  });

  return (result.rowsAffected ?? 0) > 0;
}

export async function createSource(params: {
  chatbotId: string;
  type: SourceType;
  name: string;
  url?: string | null;
  content?: string | null;
  status?: SourceStatus;
}): Promise<SourceRecord> {
  await ensureChatbotTables();
  const timestamp = now();
  const id = makeId("src");
  const client = getDb();

  await client.execute({
    sql: `
      INSERT INTO sources (
        id, chatbot_id, type, name, url, content, chunk_count,
        status, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      id,
      params.chatbotId,
      params.type,
      params.name,
      params.url ?? null,
      params.content ?? null,
      0,
      params.status ?? "pending",
      null,
      timestamp,
    ],
  });

  const source = await getSourceById(params.chatbotId, id);
  if (!source) {
    throw new Error("Failed to create source");
  }
  return source;
}

export async function updateSource(params: {
  chatbotId: string;
  sourceId: string;
  content?: string | null;
  chunkCount?: number;
  status?: SourceStatus;
  errorMessage?: string | null;
}): Promise<SourceRecord | null> {
  await ensureChatbotTables();
  const source = await getSourceById(params.chatbotId, params.sourceId);
  if (!source) {
    return null;
  }

  const client = getDb();
  await client.execute({
    sql: `
      UPDATE sources
      SET content = ?, chunk_count = ?, status = ?, error_message = ?
      WHERE chatbot_id = ? AND id = ?
    `,
    args: [
      typeof params.content === "undefined" ? source.content : params.content,
      typeof params.chunkCount === "number" ? params.chunkCount : source.chunkCount,
      params.status ?? source.status,
      typeof params.errorMessage === "undefined" ? source.errorMessage : params.errorMessage,
      params.chatbotId,
      params.sourceId,
    ],
  });

  return getSourceById(params.chatbotId, params.sourceId);
}

export async function listSourcesByChatbot(chatbotId: string): Promise<SourceRecord[]> {
  await ensureChatbotTables();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, chatbot_id, type, name, url, content, chunk_count, status, error_message, created_at
      FROM sources
      WHERE chatbot_id = ?
      ORDER BY created_at DESC
    `,
    args: [chatbotId],
  });

  return result.rows.map((row) => mapSourceRow(row as Record<string, unknown>));
}

export async function getSourceById(
  chatbotId: string,
  sourceId: string,
): Promise<SourceRecord | null> {
  await ensureChatbotTables();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, chatbot_id, type, name, url, content, chunk_count, status, error_message, created_at
      FROM sources
      WHERE chatbot_id = ? AND id = ?
      LIMIT 1
    `,
    args: [chatbotId, sourceId],
  });

  if (result.rows.length === 0) {
    return null;
  }

  return mapSourceRow(result.rows[0] as Record<string, unknown>);
}

export async function deleteSource(chatbotId: string, sourceId: string): Promise<boolean> {
  await ensureChatbotTables();
  const client = getDb();
  await client.execute({
    sql: `DELETE FROM chunks WHERE source_id = ? AND chatbot_id = ?`,
    args: [sourceId, chatbotId],
  });
  const result = await client.execute({
    sql: `DELETE FROM sources WHERE chatbot_id = ? AND id = ?`,
    args: [chatbotId, sourceId],
  });

  return (result.rowsAffected ?? 0) > 0;
}

export async function replaceSourceChunks(
  sourceId: string,
  chatbotId: string,
  chunks: ChunkInsert[],
): Promise<void> {
  await ensureChatbotTables();
  const client = getDb();
  await client.execute({
    sql: `DELETE FROM chunks WHERE source_id = ? AND chatbot_id = ?`,
    args: [sourceId, chatbotId],
  });

  for (const chunk of chunks) {
    await client.execute({
      sql: `
        INSERT INTO chunks (
          id, source_id, chatbot_id, content, embedding, chunk_index, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        makeId("chk"),
        sourceId,
        chatbotId,
        chunk.content,
        JSON.stringify(chunk.embedding),
        chunk.chunkIndex,
        stringifyJson(chunk.metadata),
        now(),
      ],
    });
  }
}

export async function listChunksByChatbot(chatbotId: string): Promise<ChunkRecord[]> {
  await ensureChatbotTables();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, source_id, chatbot_id, content, embedding, chunk_index, metadata, created_at
      FROM chunks
      WHERE chatbot_id = ?
      ORDER BY source_id ASC, chunk_index ASC
    `,
    args: [chatbotId],
  });

  return result.rows.map((row) => mapChunkRow(row as Record<string, unknown>));
}

export async function createConversation(params: {
  chatbotId: string;
  sessionId?: string | null;
  title?: string | null;
}): Promise<ConversationRecord> {
  await ensureChatbotTables();
  const timestamp = now();
  const id = makeId("conv");
  const client = getDb();
  await client.execute({
    sql: `
      INSERT INTO conversations (
        id, chatbot_id, session_id, title, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    args: [id, params.chatbotId, params.sessionId ?? null, params.title ?? null, timestamp, timestamp],
  });

  const conversation = await getConversationById(params.chatbotId, id);
  if (!conversation) {
    throw new Error("Failed to create conversation");
  }
  return conversation;
}

export async function listConversationsByChatbot(
  chatbotId: string,
): Promise<ConversationRecord[]> {
  await ensureChatbotTables();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, chatbot_id, session_id, title, created_at, updated_at
      FROM conversations
      WHERE chatbot_id = ?
      ORDER BY updated_at DESC
    `,
    args: [chatbotId],
  });

  return result.rows.map((row) => mapConversationRow(row as Record<string, unknown>));
}

export async function getConversationById(
  chatbotId: string,
  conversationId: string,
): Promise<ConversationRecord | null> {
  await ensureChatbotTables();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, chatbot_id, session_id, title, created_at, updated_at
      FROM conversations
      WHERE chatbot_id = ? AND id = ?
      LIMIT 1
    `,
    args: [chatbotId, conversationId],
  });

  if (result.rows.length === 0) {
    return null;
  }

  return mapConversationRow(result.rows[0] as Record<string, unknown>);
}

export async function touchConversation(
  chatbotId: string,
  conversationId: string,
  title?: string | null,
): Promise<void> {
  await ensureChatbotTables();
  const client = getDb();
  const current = await getConversationById(chatbotId, conversationId);
  if (!current) {
    return;
  }

  await client.execute({
    sql: `
      UPDATE conversations
      SET title = ?, updated_at = ?
      WHERE chatbot_id = ? AND id = ?
    `,
    args: [typeof title === "undefined" ? current.title : title, now(), chatbotId, conversationId],
  });
}

export async function deleteConversation(
  chatbotId: string,
  conversationId: string,
): Promise<boolean> {
  await ensureChatbotTables();
  const client = getDb();
  await client.execute({
    sql: `DELETE FROM messages WHERE conversation_id = ?`,
    args: [conversationId],
  });
  const result = await client.execute({
    sql: `DELETE FROM conversations WHERE chatbot_id = ? AND id = ?`,
    args: [chatbotId, conversationId],
  });

  return (result.rowsAffected ?? 0) > 0;
}

export async function createMessage(params: {
  conversationId: string;
  role: MessageRole;
  content: string;
  sourcesUsed?: string[] | null;
}): Promise<MessageRecord> {
  await ensureChatbotTables();
  const id = makeId("msg");
  const timestamp = now();
  const client = getDb();
  await client.execute({
    sql: `
      INSERT INTO messages (
        id, conversation_id, role, content, sources_used, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    args: [
      id,
      params.conversationId,
      params.role,
      params.content,
      stringifyJson(params.sourcesUsed ?? null),
      timestamp,
    ],
  });

  const result = await client.execute({
    sql: `
      SELECT id, conversation_id, role, content, sources_used, created_at
      FROM messages
      WHERE id = ?
      LIMIT 1
    `,
    args: [id],
  });
  return mapMessageRow(result.rows[0] as Record<string, unknown>);
}

export async function listMessagesByConversation(
  conversationId: string,
): Promise<MessageRecord[]> {
  await ensureChatbotTables();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, conversation_id, role, content, sources_used, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `,
    args: [conversationId],
  });

  return result.rows.map((row) => mapMessageRow(row as Record<string, unknown>));
}
