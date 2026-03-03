# Engrm Chatbot Platform Spec

> RAG-powered chatbots with client-side encrypted knowledge bases

## Product Vision

Engrm becomes the memory backend for AI chatbots. Users upload documents, Engrm chunks and encrypts them client-side, then serves relevant context to LLMs at query time. The server never sees plaintext — only the user's browser/agent can decrypt.

**Positioning:** "Train chatbots on your docs. We can't read them."

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ENGRM CHATBOT                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐     ┌──────────────┐     ┌─────────────────────────────┐ │
│   │   SOURCES   │     │   INGESTION  │     │         STORAGE             │ │
│   │             │     │              │     │                             │ │
│   │  PDF        │────▶│  Chunker     │────▶│  Turso (vectors + meta)     │ │
│   │  URL/Web    │     │  Embedder    │     │  Arweave (permanent)        │ │
│   │  Text       │     │  Encryptor   │     │                             │ │
│   │  Markdown   │     │  (browser)   │     │  ┌─────────────────────┐    │ │
│   │             │     │              │     │  │ Encrypted chunks    │    │ │
│   └─────────────┘     └──────────────┘     │  │ + embedding vectors │    │ │
│                                            │  └─────────────────────┘    │ │
│                                            └─────────────────────────────┘ │
│                                                         │                   │
│                                                         ▼                   │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                         RETRIEVAL LAYER                              │  │
│   │                                                                      │  │
│   │   Query ──▶ Embed ──▶ Vector Search ──▶ Decrypt (client) ──▶ Context │  │
│   │                                                                      │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                            │                                │
│                                            ▼                                │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                           CHAT LAYER                                 │  │
│   │                                                                      │  │
│   │   ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │  │
│   │   │ System       │    │ Retrieved    │    │ LLM Provider         │  │  │
│   │   │ Prompt       │ +  │ Context      │ ──▶│ (OpenAI/Anthropic/   │  │  │
│   │   │ (per bot)    │    │ (decrypted)  │    │  Gonka/OpenRouter)   │  │  │
│   │   └──────────────┘    └──────────────┘    └──────────────────────┘  │  │
│   │                                                      │               │  │
│   └──────────────────────────────────────────────────────│───────────────┘  │
│                                                          ▼                  │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                         DELIVERY                                     │  │
│   │                                                                      │  │
│   │   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌───────────┐  │  │
│   │   │ Dashboard  │   │ Embed      │   │ API        │   │ MCP       │  │  │
│   │   │ Chat UI    │   │ Widget     │   │ /v1/chat   │   │ Server    │  │  │
│   │   └────────────┘   └────────────┘   └────────────┘   └───────────┘  │  │
│   │                                                                      │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Chatbot (new table)
```sql
CREATE TABLE chatbots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  namespace TEXT NOT NULL,        -- links to memories namespace
  system_prompt TEXT,             -- encrypted, client-side
  model TEXT DEFAULT 'gpt-4o-mini',
  temperature REAL DEFAULT 0.7,
  public_token TEXT UNIQUE,       -- for embed widget auth
  settings_json TEXT,             -- theme, welcome msg, etc
  created_at INTEGER,
  updated_at INTEGER
);
```

### Source (documents uploaded to a chatbot)
```sql
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  chatbot_id TEXT NOT NULL,
  type TEXT NOT NULL,             -- 'pdf' | 'url' | 'text' | 'markdown'
  name TEXT NOT NULL,
  url TEXT,                       -- original URL if web source
  chunk_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',  -- 'pending' | 'processing' | 'ready' | 'error'
  error_message TEXT,
  created_at INTEGER,
  FOREIGN KEY (chatbot_id) REFERENCES chatbots(id)
);
```

### Chunks → existing `memories` table
Each chunk = one memory in the chatbot's namespace. Metadata includes:
- `source_id`: link back to source document
- `chunk_index`: position in document
- `page_number`: for PDFs

---

## API Endpoints

### Chatbot Management
```
POST   /api/v1/chatbots              Create chatbot
GET    /api/v1/chatbots              List user's chatbots
GET    /api/v1/chatbots/:id          Get chatbot details
PATCH  /api/v1/chatbots/:id          Update settings
DELETE /api/v1/chatbots/:id          Delete chatbot + sources + chunks
```

### Source Management
```
POST   /api/v1/chatbots/:id/sources       Add source (upload/URL)
GET    /api/v1/chatbots/:id/sources       List sources
DELETE /api/v1/chatbots/:id/sources/:sid  Remove source + its chunks
POST   /api/v1/chatbots/:id/sources/:sid/reprocess  Re-chunk source
```

### Chat (RAG)
```
POST   /api/v1/chatbots/:id/chat     Send message, get streamed response
GET    /api/v1/chatbots/:id/conversations          List conversations  
GET    /api/v1/chatbots/:id/conversations/:cid     Get conversation history
DELETE /api/v1/chatbots/:id/conversations/:cid     Delete conversation
```

### Public Widget
```
POST   /api/v1/widget/:publicToken/chat   Public chat (rate limited)
```

---

## Chunking Strategy

**Default:** 512 tokens with 50 token overlap

**Smart boundaries:**
- Markdown: split on headers (h1 > h2 > h3)
- PDF: respect page breaks, avoid mid-sentence splits
- Code: keep functions/classes intact when possible

**Metadata per chunk:**
```json
{
  "source_id": "src_xxx",
  "chunk_index": 3,
  "page": 2,
  "header_path": ["Introduction", "Getting Started"],
  "token_count": 487
}
```

---

## Encryption Flow (Client-Side)

### Ingestion (browser)
```
1. User uploads PDF
2. Browser extracts text (pdf.js)
3. Browser chunks text
4. For each chunk:
   a. Generate embedding (API call with plaintext — see note)
   b. Encrypt chunk with vault key (AES-256-GCM)
   c. Send encrypted chunk + plaintext embedding to server
5. Server stores encrypted chunk + embedding vector
```

**⚠️ Tradeoff:** Embeddings are generated from plaintext (either client-side with local model, or server-side API). Options:
- **Option A:** Client-side embedding (transformers.js) — true server-blind, but slower
- **Option B:** Server-side embedding — faster, but server sees text during embed
- **Option C:** Hybrid — small local model for embedding, encrypted storage

**Recommendation:** Start with Option B (server-side embed via OpenAI), add Option A as premium "fully private" tier.

### Retrieval (query time)
```
1. User sends query
2. Server embeds query, finds top-k similar chunks
3. Server returns encrypted chunks
4. Client decrypts chunks with vault key
5. Client sends decrypted context + query to LLM
6. LLM streams response
```

---

## Widget Embed

```html
<script src="https://engrm.xyz/widget.js"></script>
<script>
  Engrm.init({
    token: 'pub_xxxxx',
    theme: 'dark',
    position: 'bottom-right',
    welcomeMessage: 'Hi! Ask me anything about our docs.'
  });
</script>
```

Widget features:
- Floating chat bubble
- Fullscreen mobile mode
- Markdown rendering
- Code syntax highlighting
- "Powered by Engrm" footer (removable on paid tier)

---

## Pricing Tiers (Draft)

| Tier | Price | Chatbots | Sources/bot | Queries/mo | Features |
|------|-------|----------|-------------|------------|----------|
| Free | $0 | 1 | 3 | 100 | Widget branding, community support |
| Pro | $29/mo | 5 | 20 | 5,000 | No branding, priority support |
| Team | $99/mo | 20 | 100 | 25,000 | SSO, analytics, custom domain |
| Enterprise | Custom | ∞ | ∞ | ∞ | On-prem option, SLA, dedicated support |

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Chatbot CRUD API
- [ ] Source upload (text/markdown only)
- [ ] Basic chunking (fixed size + overlap)
- [ ] RAG chat endpoint (no streaming)

### Phase 2: Ingestion (Week 2)
- [ ] PDF parsing (pdf.js)
- [ ] URL scraping (cheerio/puppeteer)
- [ ] Smart chunking (markdown headers)
- [ ] Processing queue (background jobs)

### Phase 3: Chat UI (Week 3)
- [ ] Dashboard chat interface (lift from GonkaCloud)
- [ ] Conversation persistence
- [ ] Streaming responses
- [ ] Source citations in responses

### Phase 4: Widget (Week 4)
- [ ] Embeddable widget JS
- [ ] Public token auth
- [ ] Rate limiting
- [ ] Customization options

### Phase 5: Polish (Week 5+)
- [ ] Analytics dashboard
- [ ] Usage tracking / billing
- [ ] Client-side embedding option
- [ ] Webhook integrations

---

## Open Questions

1. **LLM provider:** Bundle our own (via Gonka/OpenRouter) or let users BYO API key?
2. **Embedding model:** OpenAI `text-embedding-3-small` or local `all-MiniLM-L6-v2`?
3. **Conversation storage:** Encrypted like memories, or plaintext (simpler)?
4. **Domain:** Keep under engrm.xyz or separate brand?

---

## Competitive Landscape

| Product | Encryption | Pricing | Differentiator |
|---------|------------|---------|----------------|
| Chatbase | None | $19-399/mo | Market leader, easy UX |
| CustomGPT | None | $49-499/mo | Enterprise focus |
| Dante AI | None | $29-394/mo | Multi-language |
| **Engrm** | Client-side | TBD | Privacy-first, Arweave permanence |

Our edge: **"The only RAG platform that can't read your documents."**

---

*Spec v0.1 — 2026-03-01*
