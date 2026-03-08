# FatHippo Vault Feature Specification

## Overview
Secure storage for sensitive credentials that should NEVER be:
- Returned by `/api/v1/simple/context` or any agent-facing API
- Injected into LLM context
- Accessible via API key auth (web session auth only)

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Regular Memories (API accessible)              │
│  - Recalled by agents, injected into context    │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Vault (Web UI only)                            │
│  - Session-authenticated (Clerk), NO API keys   │
│  - Never returned by /context or /search        │
│  - Agent gets: "Check your vault on fathippo.ai"│
└─────────────────────────────────────────────────┘
```

## Database Schema

```sql
CREATE TABLE vault_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,           -- "OpenAI API Key", "AWS Credentials"
  category TEXT NOT NULL,       -- api_key, password, token, connection_string, private_key
  value_encrypted TEXT NOT NULL, -- AES-256-GCM encrypted (same as memories)
  metadata_json TEXT,           -- optional: service, environment, expiry
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_vault_user ON vault_entries(user_id);
CREATE INDEX idx_vault_user_category ON vault_entries(user_id, category);
```

## API Routes

### Web-only routes (Clerk session auth, reject API key auth)
- `GET /api/vault` - List vault entries (names only, not values)
- `GET /api/vault/[id]` - Get single entry (decrypted value)
- `POST /api/vault` - Create entry
- `PUT /api/vault/[id]` - Update entry
- `DELETE /api/vault/[id]` - Delete entry

### Agent-facing behavior
When `/api/v1/simple/context` or `/api/v1/memories/search` detects a query matching secret patterns:
```json
{
  "vault_hint": "Sensitive credentials are stored in your secure vault. View them at fathippo.ai/vault",
  "matched_categories": ["api_key", "password"]
}
```

## Secret Detection Patterns

Use these regex patterns to:
1. Auto-detect secrets in `/remember` requests → prompt user to store in vault instead
2. Detect queries asking for secrets → return vault_hint instead of searching memories

### API Keys

| Service | Pattern | Example |
|---------|---------|---------|
| OpenAI | `sk-[a-zA-Z0-9]{20,}` | sk-abc123... |
| Anthropic | `sk-ant-[a-zA-Z0-9-]{40,}` | sk-ant-api03-... |
| AWS Access Key | `AKIA[0-9A-Z]{16}` | AKIAIOSFODNN7EXAMPLE |
| AWS Secret Key | `[a-zA-Z0-9/+]{40}` (contextual) | wJalrXUtnFEMI/K7MDENG... |
| Google Cloud | `AIza[0-9A-Za-z_-]{35}` | AIzaSyC... |
| GitHub Token | `gh[pousr]_[A-Za-z0-9_]{36,}` | ghp_xxxx... |
| GitHub Classic | `github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}` | |
| Stripe | `sk_live_[0-9a-zA-Z]{24,}` | sk_live_... |
| Stripe | `sk_test_[0-9a-zA-Z]{24,}` | sk_test_... |
| Stripe | `pk_live_[0-9a-zA-Z]{24,}` | pk_live_... |
| Twilio | `SK[0-9a-fA-F]{32}` | SK... |
| Twilio Auth | `[a-f0-9]{32}` (contextual) | |
| SendGrid | `SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}` | SG.xxx.yyy |
| Slack Bot | `xoxb-[0-9]{11}-[0-9]{11}-[a-zA-Z0-9]{24}` | xoxb-... |
| Slack User | `xoxp-[0-9]{11}-[0-9]{11}-[a-zA-Z0-9]{24}` | xoxp-... |
| Discord Bot | `[MN][A-Za-z0-9]{23,}\.[\w-]{6}\.[\w-]{27}` | |
| Telegram Bot | `[0-9]{8,10}:[a-zA-Z0-9_-]{35}` | 123456789:ABC... |
| OpenRouter | `sk-or-v1-[a-f0-9]{64}` | sk-or-v1-... |
| Vercel | `vercel_[a-zA-Z0-9]{24}` | |
| Supabase | `sbp_[a-f0-9]{40}` | |
| Supabase | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+` | JWT format |
| Cloudflare | `[a-z0-9]{37}` (contextual) | |
| Heroku | `[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}` | UUID format |
| Mailgun | `key-[0-9a-zA-Z]{32}` | key-... |
| HuggingFace | `hf_[a-zA-Z0-9]{34}` | hf_... |
| Replicate | `r8_[a-zA-Z0-9]{40}` | r8_... |
| Pinecone | `[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}` | UUID |
| Cohere | `[a-zA-Z0-9]{40}` (contextual) | |
| Mapbox | `pk\.[a-zA-Z0-9]{60,}` | pk.eyJ... |
| Firebase | `[a-zA-Z0-9_-]{40}` (contextual) | |
| DataDog | `[a-f0-9]{32}` (contextual) | |
| Sentry | `[a-f0-9]{32}` (contextual) | |
| Linear | `lin_api_[a-zA-Z0-9]{40}` | |
| Notion | `secret_[a-zA-Z0-9]{43}` | |
| Airtable | `key[a-zA-Z0-9]{14}` | keyXXX... |
| Algolia | `[a-f0-9]{32}` (contextual) | |
| Braintree | `access_token\$[a-z]+\$[a-z0-9]+\$[a-f0-9]{32}` | |
| Square | `sq0atp-[0-9A-Za-z_-]{22}` | |
| Square | `sq0csp-[0-9A-Za-z_-]{43}` | |
| PayPal | `access_token\$production\$[a-z0-9]{13}\$[a-f0-9]{32}` | |
| npm | `npm_[a-zA-Z0-9]{36}` | |
| PyPI | `pypi-[a-zA-Z0-9_-]{50,}` | |
| Doppler | `dp\.st\.[a-zA-Z0-9_-]{40,}` | |
| Railway | `[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}` | |
| Fly.io | `fo1_[a-zA-Z0-9_-]{40,}` | |
| PlanetScale | `pscale_tkn_[a-zA-Z0-9_-]{40,}` | |
| Turso | `[a-zA-Z0-9_-]{40,}` (contextual) | |
| Neon | `neon-[a-zA-Z0-9_-]{32,}` | |
| Clerk | `sk_live_[a-zA-Z0-9]{40,}` | |
| Clerk | `sk_test_[a-zA-Z0-9]{40,}` | |
| Auth0 | `[a-zA-Z0-9_-]{32,}` (contextual) | |
| Okta | `[a-zA-Z0-9_-]{42}` (contextual) | |
| Venice AI | `VENICE-[A-Za-z0-9_-]{40,}` | |
| FatHippo | `mem_[a-f0-9]{48}` | mem_... |

### Tokens & Auth

| Type | Pattern | Example |
|------|---------|---------|
| JWT | `eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*` | eyJhbG... |
| Bearer Token | `bearer\s+[a-zA-Z0-9_-]{20,}` (case insensitive) | |
| OAuth Access | `ya29\.[a-zA-Z0-9_-]+` | Google OAuth |
| OAuth Refresh | `1//[a-zA-Z0-9_-]+` | Google refresh |

### Database & Connection Strings

| Type | Pattern |
|------|---------|
| PostgreSQL | `postgres(ql)?://[^:]+:[^@]+@[^/]+/\w+` |
| MySQL | `mysql://[^:]+:[^@]+@[^/]+/\w+` |
| MongoDB | `mongodb(\+srv)?://[^:]+:[^@]+@[^/]+` |
| Redis | `redis://:[^@]+@[^:]+:\d+` |
| JDBC | `jdbc:[a-z]+://[^:]+:[^@]+@[^/]+` |
| SQLite | (with password) `sqlite://.*password=` |

### Private Keys & Certificates

| Type | Pattern |
|------|---------|
| RSA Private | `-----BEGIN RSA PRIVATE KEY-----` |
| EC Private | `-----BEGIN EC PRIVATE KEY-----` |
| OpenSSH Private | `-----BEGIN OPENSSH PRIVATE KEY-----` |
| PGP Private | `-----BEGIN PGP PRIVATE KEY BLOCK-----` |
| Generic Private | `-----BEGIN PRIVATE KEY-----` |
| PKCS8 | `-----BEGIN ENCRYPTED PRIVATE KEY-----` |

### Passwords & Secrets

| Type | Pattern |
|------|---------|
| Password field | `password\s*[:=]\s*['"]?[^'"\s]{8,}` (case insensitive) |
| Secret field | `secret\s*[:=]\s*['"]?[^'"\s]{8,}` (case insensitive) |
| API key field | `api[_-]?key\s*[:=]\s*['"]?[^'"\s]{16,}` (case insensitive) |
| Token field | `token\s*[:=]\s*['"]?[^'"\s]{20,}` (case insensitive) |

### Query Detection (for vault_hint response)

Detect when user/agent is asking for secrets:
- `what is my .* (api key|token|password|secret|credentials)`
- `give me .* (api key|token|password|secret|credentials)`
- `(api key|token|password|secret|credentials) for .*`
- `show .* (api key|token|password|secret|credentials)`
- `retrieve .* (api key|token|password|secret|credentials)`

## Web UI Components

### `/vault` page
- List all vault entries (show name, category, created_at — NOT values)
- Click to reveal (with confirmation)
- Copy to clipboard button
- Add/Edit/Delete entries
- Category filter

### Auto-detect on store
When user stores a memory via web UI that matches secret patterns:
```
⚠️ This looks like a sensitive credential.
Store in your secure vault instead?
[Yes, store in vault] [No, keep as memory]
```

## Implementation Files

1. `src/lib/db.ts` - Add vault table schema + CRUD
2. `src/lib/secrets.ts` - Pattern matching (enhance existing)
3. `src/app/api/vault/route.ts` - List/Create
4. `src/app/api/vault/[id]/route.ts` - Get/Update/Delete
5. `src/app/(dashboard)/vault/page.tsx` - Web UI
6. `src/lib/memories.ts` - Add vault_hint to context responses

## Security Requirements

- [ ] Reject API key auth on all vault routes (session only)
- [ ] Rate limit vault access (max 10 requests/minute)
- [ ] Audit log vault access
- [ ] Never log decrypted values
- [ ] Auto-expire clipboard copies (frontend)
