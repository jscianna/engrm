# MEMRY

Permanent memory SaaS scaffold built with Next.js App Router, Clerk auth, Arweave Turbo uploads, SQLite metadata, and Vectra semantic search.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind + shadcn/ui
- Clerk (`@clerk/nextjs`) for auth
- Arweave Turbo SDK (`@ardrive/turbo-sdk`) for uploads
- SQLite (`better-sqlite3`) for metadata storage
- Embeddings via `@xenova/transformers`
- Vector search with `vectra` local index

## Routes

- `/` marketing landing page
- `/dashboard` memory dashboard
- `/dashboard/add` add text/url/file memory
- `/dashboard/search` semantic search
- `/dashboard/memory/[id]` memory detail + Arweave proof
- `/dashboard/settings` profile + integration status
- `/api/memories` GET/POST
- `/api/memories/[id]` GET
- `/api/memories/search` GET

## Setup

Create `.env.local` with:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Optional but required for real Arweave uploads
ARWEAVE_JWK={"kty":"RSA",...}
TURBO_TOKEN=arweave
```

Install and run:

```bash
npm install
npm run dev
```

## Notes

- Metadata DB lives at `data/memry.sqlite`.
- Vector index lives at `data/vectra`.
- If `ARWEAVE_JWK` is missing, memories still save locally but no TX ID is created.
