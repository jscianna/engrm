<p align="center">
  <img src="https://engrm.xyz/logo.png" alt="Engrm" width="120" />
</p>

<h1 align="center">Engrm</h1>

<p align="center">
  <strong>Encrypted memory infrastructure for AI agents</strong>
</p>

<p align="center">
  <a href="https://engrm.xyz">Website</a> •
  <a href="https://engrm.xyz/docs">Documentation</a> •
  <a href="https://engrm.xyz/brain">Live Demo</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/typescript-5.0+-blue.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/next.js-16+-black.svg" alt="Next.js" />
</p>

---

## Overview

Engrm provides persistent, encrypted memory for AI agents. Unlike ephemeral context windows, Engrm memories persist across sessions, decay naturally like human memory, and remain private through client-side encryption.

### Key Features

- **🔐 Client-Side Encryption** — AES-256-GCM encryption happens in your browser. Server stores only ciphertext.
- **🧠 Brain-Like Memory** — Memories strengthen with use, decay when forgotten, and form associative connections.
- **🌍 Layered Namespaces** — Global identity layer + per-conversation isolation with hashed namespace privacy.
- **⚡ Vector Search** — Semantic similarity search via Qdrant Cloud (O(log n), not O(n)).
- **📊 Reinforcement Learning** — Similar memories merge instead of duplicating. "Fire together, wire together."
- **🗄️ Permanent Storage** — Optional Arweave integration for truly permanent memories.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ MCP      │  │ Python   │  │ REST     │  │ Browser  │        │
│  │ Server   │  │ CLI      │  │ API      │  │ SDK      │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │             │             │             │               │
│       └─────────────┴─────────────┴─────────────┘               │
│                           │                                     │
│              ┌────────────▼────────────┐                        │
│              │   Client-Side Layer     │                        │
│              │  • Embeddings (MiniLM)  │                        │
│              │  • Encryption (AES-256) │                        │
│              │  • Namespace Hashing    │                        │
│              └────────────┬────────────┘                        │
└───────────────────────────┼─────────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼─────────────────────────────────────┐
│                        Engrm API                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Rate Limiting                         │   │
│  │              (60/min, 10k/day per key)                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            │                                    │
│  ┌─────────────┐  ┌────────▼───────┐  ┌─────────────────────┐   │
│  │   Turso     │  │    Qdrant      │  │      Arweave        │   │
│  │  (SQLite)   │  │    Cloud       │  │    (Optional)       │   │
│  │             │  │                │  │                     │   │
│  │ • Metadata  │  │ • Vectors      │  │ • Permanent         │   │
│  │ • Users     │  │ • Similarity   │  │   Storage           │   │
│  │ • Audit     │  │   Search       │  │ • Immutable         │   │
│  └─────────────┘  └────────────────┘  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm (recommended) or npm
- Turso account (free tier available)
- OpenAI API key (for embeddings)

### Installation

```bash
# Clone the repository
git clone https://github.com/jscianna/engrm.git
cd engrm

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env.local

# Start development server
pnpm dev
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

# Admin
ADMIN_API_KEY=your-admin-key

# Optional: Permanent Storage (Arweave)
ARWEAVE_JWK={"kty":"RSA",...}
```

---

## API Reference

### Authentication

All API requests require a Bearer token:

```bash
curl https://engrm.xyz/api/v1/memories \
  -H "Authorization: Bearer mem_your_api_key"
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/memories` | Store a memory |
| `GET` | `/api/v1/memories` | List memories |
| `GET` | `/api/v1/memories/:id` | Get memory by ID |
| `DELETE` | `/api/v1/memories/:id` | Delete memory |
| `POST` | `/api/v1/memories/zk` | Store encrypted memory |
| `POST` | `/api/v1/search` | Semantic search |
| `POST` | `/api/v1/context` | Get LLM-ready context |

### Example: Store a Memory

```bash
curl -X POST https://engrm.xyz/api/v1/memories \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "User prefers dark mode",
    "type": "preference",
    "importance": 8
  }'
```

### Example: Semantic Search

```bash
curl -X POST https://engrm.xyz/api/v1/search \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the user preferences?",
    "limit": 5
  }'
```

---

## MCP Server

For Claude Desktop, Cursor, and other MCP-compatible clients:

```bash
npm install -g engrm-mcp
```

Configure in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "engrm": {
      "command": "engrm-mcp",
      "env": {
        "ENGRM_API_KEY": "mem_xxx",
        "ENGRM_VAULT_PASSWORD": "your-password"
      }
    }
  }
}
```

---

## Security

### Encryption

| Layer | Algorithm | Notes |
|-------|-----------|-------|
| Content | AES-256-GCM | Client-side, key never leaves browser |
| Key Derivation | PBKDF2 | 100,000 iterations |
| Namespace Hash | PBKDF2-SHA256 | Client-side only: `PBKDF2(vault_password, namespace, 100,000)` |
| Transport | TLS 1.3 | All API traffic encrypted |
| At Rest | Provider Default | Turso (AES-256), Qdrant (encrypted storage) |

### Privacy Model

```
What Engrm Sees          What Engrm Cannot See
─────────────────        ─────────────────────
✓ Encrypted ciphertext   ✗ Plaintext content
✓ Embedding vectors      ✗ Vault password
✓ Hashed namespace IDs   ✗ Actual namespace names
✓ Memory metadata        ✗ Decryption keys
```

> **Note:** Embedding vectors encode semantic similarity. An attacker with database access could cluster vectors to infer topics. True zero-knowledge would require homomorphic encryption, which is impractical for search.

### Compliance

- **Audit Logging** — All access logged with timestamps, IPs, actions
- **Data Retention** — Configurable retention policies
- **GDPR Ready** — Data export and deletion APIs
- **SOC2 Hosting** — Deployed on Vercel (SOC2 certified)

---

## Memory Lifecycle

Engrm implements a brain-inspired memory model:

### Decay

Memories naturally fade over time if not accessed:

```
strength = base_strength × (0.9 ^ (days_since_access / halflife))
```

| Type | Halflife | Auto-Delete |
|------|----------|-------------|
| Identity | 365 days | Never |
| Constraint | 180 days | strength < 0.20 |
| How-To | 120 days | strength < 0.20 |
| Fact | 90 days | strength < 0.20 |
| Preference | 60 days | strength < 0.20 |
| Event | 14 days | strength < 0.20 |

### Reinforcement

- **Recall Strengthens:** Every retrieval bumps memory strength
- **Mention Protection:** ≥4 mentions protects for 365 days
- **Fire Together:** Co-retrieved memories form stronger associations

---

## Deployment

### Vercel (Recommended)

```bash
vercel --prod
```

### Docker

```bash
docker build -t engrm .
docker run -p 3000:3000 --env-file .env engrm
```

### Railway / Render

One-click deploy buttons coming soon.

---

## Development

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Build for production
pnpm build
```

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## License

MIT © [John Scianna](https://x.com/scianna)

---

<p align="center">
  <a href="https://engrm.xyz">engrm.xyz</a> •
  <a href="https://x.com/scianna">@scianna</a>
</p>
