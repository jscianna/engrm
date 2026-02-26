# MEMRY

Permanent memory SaaS with zero-knowledge encryption, built on Arweave.

## Stack

- **Framework:** Next.js 16 (App Router) + TypeScript + Tailwind + shadcn/ui
- **Auth:** Clerk (`@clerk/nextjs`)
- **Storage:** Arweave Turbo SDK (`@ardrive/turbo-sdk`) — free under 100KB
- **Database:** Turso (libSQL) for metadata + vectors
- **Embeddings:** OpenAI text-embedding-3-small
- **Reads:** ar.io Wayfinder for verified Arweave retrieval

## Security

**Zero-Knowledge Encryption:**
- Vault password never leaves your browser
- Key derived client-side via PBKDF2 (100K iterations)
- Server stores only encrypted blobs + salts
- Even database access can't read your memories

## Routes

- `/` — Marketing landing page
- `/dashboard` — Memory dashboard
- `/dashboard/add` — Add text/url/file memory
- `/dashboard/search` — Semantic search
- `/dashboard/memory/[id]` — Memory detail + Arweave proof
- `/dashboard/settings` — Profile + vault password + recovery key

### API (v1)

- `POST /api/v1/memories` — Store memory
- `GET /api/v1/memories` — List memories
- `POST /api/v1/search` — Semantic search
- `POST /api/v1/context` — Get LLM-ready context
- `POST /api/v1/sessions` — Create session
- `POST /api/v1/namespaces` — Create namespace

## Setup

Create `.env.local`:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Turso database
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token

# OpenAI for embeddings
OPENAI_API_KEY=sk-...

# Optional: Arweave wallet for permanent uploads
ARWEAVE_JWK={"kty":"RSA",...}
```

Install and run:

```bash
npm install
npm run dev
```

## Deploy

Optimized for Vercel serverless. Works on Railway/Render too.

```bash
vercel --prod
```

## License

MIT
