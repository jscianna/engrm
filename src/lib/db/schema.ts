import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const chatbots = sqliteTable("chatbots", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  systemPrompt: text("system_prompt"),
  model: text("model").default("gpt-4o-mini"),
  temperature: real("temperature").default(0.7),
  publicToken: text("public_token").unique(),
  welcomeMessage: text("welcome_message"),
  themeJson: text("theme_json"),
  arweaveEnabled: integer("arweave_enabled", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  chatbotId: text("chatbot_id")
    .notNull()
    .references(() => chatbots.id),
  type: text("type").notNull(),
  name: text("name").notNull(),
  url: text("url"),
  content: text("content"),
  chunkCount: integer("chunk_count").default(0),
  status: text("status").default("pending"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" }),
});

export const chunks = sqliteTable("chunks", {
  id: text("id").primaryKey(),
  sourceId: text("source_id")
    .notNull()
    .references(() => sources.id),
  chatbotId: text("chatbot_id")
    .notNull()
    .references(() => chatbots.id),
  content: text("content").notNull(),
  embedding: text("embedding"),
  chunkIndex: integer("chunk_index"),
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp" }),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  chatbotId: text("chatbot_id")
    .notNull()
    .references(() => chatbots.id),
  sessionId: text("session_id"),
  title: text("title"),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  sourcesUsed: text("sources_used"),
  createdAt: integer("created_at", { mode: "timestamp" }),
});
