# Chatbot Feature - Build Task

## Context
Engrm is a memory system for AI agents. We're adding a chatbot module — a Chatbase-style RAG product.

## Key Decisions (Already Made)
- **NO encryption for chatbot data** — public chatbots use plaintext storage
- **Server-side embeddings** — OpenAI text-embedding-3-small via existing embed logic
- **Arweave is OPTIONAL** — not default, can be enabled per-chatbot
- **Reuse existing infra** — Turso vectors, auth, namespace concepts
- **Isolated module** — don't touch existing memory/search code

## What to Build (Phase 1)

### 1. Database Schema
Add to `src/lib/db/schema.ts`:

```typescript
// Chatbots table
export const chatbots = sqliteTable('chatbots', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  systemPrompt: text('system_prompt'),
  model: text('model').default('gpt-4o-mini'),
  temperature: real('temperature').default(0.7),
  publicToken: text('public_token').unique(),  // for embed widget
  welcomeMessage: text('welcome_message'),
  themeJson: text('theme_json'),  // colors, etc
  arweaveEnabled: integer('arweave_enabled', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// Sources (documents uploaded to a chatbot)
export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),
  chatbotId: text('chatbot_id').notNull().references(() => chatbots.id),
  type: text('type').notNull(),  // 'text' | 'url' | 'pdf' | 'markdown'
  name: text('name').notNull(),
  url: text('url'),  // original URL if scraped
  content: text('content'),  // raw content (plaintext)
  chunkCount: integer('chunk_count').default(0),
  status: text('status').default('pending'),  // pending | processing | ready | error
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

// Chunks (vectorized pieces of sources)
export const chunks = sqliteTable('chunks', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').notNull().references(() => sources.id),
  chatbotId: text('chatbot_id').notNull().references(() => chatbots.id),
  content: text('content').notNull(),  // plaintext chunk
  embedding: text('embedding'),  // JSON array of floats
  chunkIndex: integer('chunk_index'),
  metadata: text('metadata'),  // JSON: page number, headers, etc
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

// Conversations
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  chatbotId: text('chatbot_id').notNull().references(() => chatbots.id),
  sessionId: text('session_id'),  // for widget users (anonymous)
  title: text('title'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// Messages
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id),
  role: text('role').notNull(),  // 'user' | 'assistant'
  content: text('content').notNull(),
  sourcesUsed: text('sources_used'),  // JSON array of chunk IDs used
  createdAt: integer('created_at', { mode: 'timestamp' }),
});
```

### 2. API Routes
Create under `src/app/api/v1/chatbots/`:

```
chatbots/
├── route.ts                    # GET (list), POST (create)
├── [id]/
│   ├── route.ts               # GET, PATCH, DELETE
│   ├── sources/
│   │   ├── route.ts           # GET (list), POST (upload)
│   │   └── [sourceId]/
│   │       └── route.ts       # GET, DELETE
│   ├── chat/
│   │   └── route.ts           # POST (send message, get response)
│   └── conversations/
│       ├── route.ts           # GET (list)
│       └── [convId]/
│           └── route.ts       # GET (messages), DELETE
```

### 3. Core Logic
Create `src/lib/chatbot/`:

```
chatbot/
├── index.ts           # exports
├── chunker.ts         # Split text into chunks (512 tokens, 50 overlap)
├── embedder.ts        # Call OpenAI embeddings API
├── ingestion.ts       # Process source → chunks → embeddings
├── rag.ts             # Vector search + context building
└── chat.ts            # LLM call with context injection
```

### 4. Chunking Strategy
- Default: 512 tokens, 50 token overlap
- Markdown: respect headers (split on ## before token limit)
- Use tiktoken for accurate token counting

### 5. RAG Flow
```
1. User sends message
2. Embed the query (OpenAI)
3. Vector search chunks table (cosine similarity)
4. Take top 5 chunks as context
5. Build prompt: system_prompt + context + user_message
6. Call LLM (OpenAI/Anthropic based on chatbot.model)
7. Stream response back
8. Save conversation + message
```

### 6. Environment
Use existing env vars:
- OPENAI_API_KEY (for embeddings + chat)
- TURSO_DATABASE_URL, TURSO_AUTH_TOKEN (storage)

## What NOT to Do
- Don't touch `src/lib/memory/` or `src/app/api/v1/memories/`
- Don't add encryption — this is plaintext storage
- Don't implement PDF parsing yet (Phase 2)
- Don't build widget yet (Phase 3)

## File Structure Reference
Look at existing patterns in:
- `src/lib/db/` for Drizzle setup
- `src/app/api/v1/memories/` for API patterns
- `src/lib/vector/` for embedding patterns (if exists)

## Success Criteria
- [ ] `pnpm build` passes
- [ ] Can create a chatbot via API
- [ ] Can add a text source and see it chunked
- [ ] Can send a chat message and get RAG response
- [ ] Conversations are persisted

## Start Here
1. Add schema to `src/lib/db/schema.ts`
2. Run migration: `pnpm db:push` (or generate migration)
3. Create `src/lib/chatbot/` with core logic
4. Create API routes
5. Test with curl

When completely finished, run:
openclaw system event --text "Done: Chatbot Phase 1 complete - schema, API routes, chunking, RAG chat working" --mode now
