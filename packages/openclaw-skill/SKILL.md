---
name: memry
description: Zero-knowledge memory for AI agents via MEMRY. Embeddings and encryption happen locally - server cannot read your data. Use when: (1) storing important information for later recall, (2) searching past memories/context, (3) user says "remember this", (4) building knowledge over time.
---

# MEMRY - Zero-Knowledge Memory

Store and recall memories with true zero-knowledge privacy:
- **Embeddings generated locally** (FastEmbed ONNX)
- **Content encrypted locally** (AES-256-GCM)
- **Server only sees vectors + encrypted blobs**

## Setup

1. **Get API Key**: https://memry-sand.vercel.app/dashboard/settings → "API Keys"
2. **Set Vault Password**: Choose a strong password for client-side encryption
3. **Configure** `~/.openclaw/secrets/memry.env`:

```bash
MEMRY_API_KEY=mem_xxx
MEMRY_API_URL=https://memry-sand.vercel.app
MEMRY_VAULT_PASSWORD=your-strong-password
```

4. **Install dependencies** (first time only):
```bash
pip3 install fastembed pycryptodome
```

## Quick Reference

```bash
# Store a memory (encrypted locally, server cannot read)
python3 scripts/memry_zk.py store "User prefers morning meetings"

# Store with metadata
python3 scripts/memry_zk.py store "Project deadline is March 15" --importance 8 --tags "project,deadline"

# Search memories (query embedded locally, server only sees vector)
python3 scripts/memry_zk.py search "meeting preferences"

# Get context for current task
python3 scripts/memry_zk.py context "scheduling a meeting"

# List recent memories
python3 scripts/memry_zk.py list --limit 10
```

## Privacy Guarantees

| What | Where It Happens | What Server Sees |
|------|------------------|------------------|
| Query embedding | Your device | Vector only (meaningless numbers) |
| Content encryption | Your device | Ciphertext only (unreadable) |
| Key derivation | Your device | Nothing (password never sent) |

**The MEMRY server cannot:**
- Read your memories
- Know what you're searching for
- Decrypt your content (even with database access)

## When to Store Memories

**DO store:**
- User preferences ("I prefer concise responses")
- Important facts ("John's timezone is SGT")
- Decisions made ("We decided to use React")
- Corrections ("Actually the meeting is at 3pm")
- Project context ("Working on MEMRY")

**DON'T store:**
- Transient info (weather, time)
- Sensitive credentials (use secrets instead)
- Large files (use file storage)

## Best Practices

1. **Store immediately** — When user shares important info, store it right away
2. **Be specific** — "John prefers 9am meetings" > "John likes mornings"
3. **Use importance** — 1-10 scale, higher = more likely to surface
4. **Search before storing** — Avoid duplicates
5. **Same vault password** — Use consistently across sessions for decryption

## Troubleshooting

**"Cannot decrypt - different vault"**
- Memory was stored with a different vault password
- Or memory is plaintext (not ZK encrypted)

**Slow first run**
- Model downloads on first use (~80MB)
- Subsequent runs use cached model (~200ms)

**Missing dependencies**
```bash
pip3 install fastembed pycryptodome
```
