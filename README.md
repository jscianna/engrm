<p align="center">
  <img src="https://raw.githubusercontent.com/jscianna/fathippo/main/public/hippo.png" alt="FatHippo" width="140" />
</p>

<h1 align="center">FatHippo</h1>

<p align="center">
  <strong>Memory that just works.</strong><br/>
  Persistent, encrypted memory infrastructure for AI agents.
</p>

<p align="center">
  <a href="https://fathippo.ai">Website</a> •
  <a href="https://fathippo.ai/docs">Documentation</a> •
  <a href="https://www.npmjs.com/package/@fathippo/openclaw-memory">OpenClaw Plugin</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/typescript-5.0+-blue.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/next.js-16+-black.svg" alt="Next.js" />
  <img src="https://img.shields.io/npm/v/@fathippo/openclaw-memory.svg" alt="npm" />
</p>

---

## What is FatHippo?

Every AI agent wakes up with amnesia. FatHippo fixes that.

- **Persistent** — Memories survive sessions, restarts, and model switches
- **Encrypted** — AES-256-GCM encryption at rest with per-user keys
- **Automatic** — Auto-recall at conversation start, auto-capture of insights
- **Cross-platform** — Works across Telegram, Discord, Slack, web, CLI
- **Model-agnostic** — Claude, GPT, Gemini, local models — same memories everywhere

---

## Quick Start (OpenClaw)

The fastest way to add memory to your AI agent:

```bash
# Install the plugin
openclaw plugins install @fathippo/openclaw-memory

# Set your API key
openclaw config set plugins.entries.memory-fathippo.config.apiKey=mem_xxx

# Enable as memory provider
openclaw config set plugins.slots.memory=memory-fathippo

# Done. Memory is now automatic.
```

Your agent now:
- ✅ Auto-recalls relevant context at conversation start
- ✅ Auto-captures insights, preferences, decisions
- ✅ Works across all chat surfaces
- ✅ Survives restarts and model switches

---

## REST API

For custom integrations:

### Store a Memory

```bash
curl -X POST https://fathippo.ai/api/v1/simple/remember \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{"text": "User prefers dark mode"}'
```

### Get Context

```bash
curl -X POST https://fathippo.ai/api/v1/simple/context \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{"message": "What are my preferences?"}'
```

### Search Memories

```bash
curl -X POST https://fathippo.ai/api/v1/search \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{"query": "user preferences", "topK": 5}'
```

### Full API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/simple/remember` | Store a memory |
| `POST` | `/api/v1/simple/context` | Get relevant context for a message |
| `POST` | `/api/v1/simple/recall` | Search memories |
| `POST` | `/api/v1/search` | Advanced semantic search |
| `GET` | `/api/v1/memories` | List all memories |
| `DELETE` | `/api/v1/memories/:id` | Delete a memory |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Clients                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   OpenClaw   │  │   REST API   │  │   Python     │          │
│  │   Plugin     │  │   Direct     │  │   SDK        │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         └──────────────────┼──────────────────┘                 │
└────────────────────────────┼────────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼────────────────────────────────────┐
│                        FatHippo API                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Server-Side Encryption Layer                │   │
│  │         AES-256-GCM with per-user derived keys           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            │                                    │
│  ┌─────────────┐  ┌────────▼───────┐  ┌─────────────────────┐   │
│  │   Turso     │  │    Qdrant      │  │   Redis (Upstash)   │   │
│  │  (SQLite)   │  │    Cloud       │  │                     │   │
│  │             │  │                │  │ • Embedding cache   │   │
│  │ • Metadata  │  │ • Vectors      │  │ • Rate limiting     │   │
│  │ • Users     │  │ • Similarity   │  │                     │   │
│  │ • Encrypted │  │   Search       │  │                     │   │
│  │   content   │  │                │  │                     │   │
│  └─────────────┘  └────────────────┘  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Security

### Encryption

| Layer | Implementation |
|-------|----------------|
| **At Rest** | AES-256-GCM with per-user keys derived from master key + userId |
| **In Transit** | TLS 1.3 |
| **Embeddings** | Stored in Qdrant with encryption |

### Privacy Model

- ✅ Database breach = encrypted blobs only
- ✅ Per-user key derivation (no shared keys)
- ✅ FatHippo employees cannot read your data
- ⚠️ LLM-based features (entity extraction) use external providers*

*Confidential compute roadmap in progress for fully private inference.

### Compliance

- **GDPR Ready** — Delete endpoint for data removal
- **Audit Logging** — All access logged
- **SOC2 Hosting** — Deployed on Vercel

---

## Memory Tiers

FatHippo uses intelligent memory tiering:

| Tier | Behavior |
|------|----------|
| **Critical** | Always loaded at session start |
| **High** | Loaded if semantically relevant |
| **Normal** | On-demand search only |

Memories auto-promote based on access patterns (5+ accesses → high, 15+ → critical).

---

## Self-Hosting

### Prerequisites

- Node.js 20+
- Turso account (database)
- Qdrant Cloud (vector search)
- OpenAI API key (embeddings)

### Setup

```bash
# Clone the repository
git clone https://github.com/jscianna/fathippo.git
cd fathippo

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Configure your environment variables (see below)

# Start development server
npm run dev
```

### Environment Variables

```bash
# Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...

# Database (Turso)
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token

# Embeddings (OpenAI)
OPENAI_API_KEY=sk-...

# Vector Search (Qdrant Cloud)
QDRANT_URL=https://xxx.cloud.qdrant.io:6333
QDRANT_API_KEY=your-key

# Encryption (required)
ENCRYPTION_KEY=your-32-byte-hex-key

# Optional: Embedding Cache (Upstash Redis)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

---

## Contributing

We welcome contributions! 

### Getting Started

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Make your changes
4. Run tests and linting (`npm test && npm run lint`)
5. Commit with clear messages (`git commit -m 'Add amazing feature'`)
6. Push to your branch (`git push origin feature/amazing`)
7. Open a Pull Request

### Development

```bash
npm install      # Install dependencies
npm run dev      # Start dev server
npm test         # Run tests
npm run lint     # Lint code
npm run build    # Production build
```

### Code Style

- TypeScript strict mode
- Prettier for formatting
- ESLint for linting
- Conventional commits preferred

### Areas We'd Love Help

- 🔌 SDK/client libraries (Python, Go, Rust)
- 📝 Documentation improvements
- 🧪 Test coverage
- 🌍 Internationalization
- 🐛 Bug fixes and performance improvements

---

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.

---

## Links

- **Website:** [fathippo.ai](https://fathippo.ai)
- **npm:** [@fathippo/openclaw-memory](https://www.npmjs.com/package/@fathippo/openclaw-memory)
- **Twitter:** [@scianna](https://x.com/scianna)

---

<p align="center">
  <strong>Memory that just works.</strong>
</p>
