---
name: memry
description: Zero-knowledge memory for AI agents via MEMRY. Embeddings and encryption happen locally - server cannot read your data. Features auto-extraction with heuristic scoring. Use when: (1) storing important information, (2) searching past memories, (3) user says "remember this", (4) extracting memories from conversations.
---

# MEMRY - Zero-Knowledge Memory

Store and recall memories with true zero-knowledge privacy:
- **Embeddings generated locally** (FastEmbed ONNX)
- **Content encrypted locally** (AES-256-GCM)
- **Server only sees vectors + encrypted blobs**
- **Heuristic scoring** (no LLM needed)
- **Auto-reinforcement** (repeated mentions strengthen memories)

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

## Commands

### Manual Storage & Search

```bash
# Store a memory (encrypted locally)
python3 scripts/memry.py store "User prefers morning meetings"

# Store with metadata
python3 scripts/memry.py store "Project deadline is March 15" --importance 8 --tags "project,deadline"

# Search memories (query embedded locally)
python3 scripts/memry.py search "meeting preferences"

# Get context for current task
python3 scripts/memry.py context "scheduling a meeting"

# List recent memories
python3 scripts/memry.py list --limit 10
```

### Auto-Extraction (NEW)

Extract memories from conversations using heuristic scoring:

```bash
# Score a single text
python3 scripts/auto_extract.py --text "My name is John and I work at Web3.com Ventures"

# Dry run (score only, don't store)
python3 scripts/auto_extract.py --text "User prefers dark themes" --dry-run

# Extract from conversation JSON
echo '{"messages": [{"role": "user", "content": "Remember that I'm allergic to shellfish"}]}' | python3 scripts/auto_extract.py

# With namespace
python3 scripts/auto_extract.py --text "..." --namespace "personal"
```

### Heuristics Testing

```bash
# Test the heuristics engine directly
python3 scripts/heuristics.py "I decided to use React for the frontend"
# Output: Score: 7.2, Type: decision, Should store: True, Signals: decision, entity_rich
```

## Heuristic Scoring

Memories are scored 0-10 using deterministic heuristics (no LLM):

| Signal | Points | Examples |
|--------|--------|----------|
| Explicit markers | +3.0 | "remember this", "my name is", "I prefer" |
| Decision markers | +2.0 | "decided", "going with", "committed to" |
| Correction signals | +1.5 | "actually", "no wait", "I meant" |
| Emotional intensity | +1.5 | High arousal words, !!!, ALL CAPS |
| Temporal specificity | +1.0 | "January 5th", "next Tuesday" |
| Causality | +1.0 | "because", "therefore", "as a result" |
| Task completion | +1.0 | "done", "shipped", "finished", "failed" |
| Entity density | +2.0 | Named entities per sentence |

**Threshold: ≥6.0 to store**

### Memory Types

Each type has different importance multipliers and decay rates:

| Type | Multiplier | Halflife | Triggers |
|------|-----------|----------|----------|
| Constraint | 1.3× | 180d | "cannot", "allergic", "deadline" |
| Identity | 1.2× | 120d | "I am", "my job is", "I work at" |
| Relationship | 1.1× | 30d | "my friend", "colleague", "met with" |
| Preference | 1.0× | 60d | "I prefer", "favorite", "hate" |
| How-to | 1.0× | 120d | "how to", "the steps are" |
| Fact | 0.9× | 90d | "is located", "has property" |
| Event | 0.8× | 14d | "yesterday", "happened", "met" |

**Safety Rule:** Constraints with "allergic", "emergency", "medical" get +2.0 boost.

## Reinforcement

Repeated mentions strengthen memories instead of creating duplicates:

| Mentions | Strength |
|----------|----------|
| 1st | 1.0× (base) |
| 2nd | 1.4× (+40%) |
| 3rd-5th | +20% each |
| 6th+ | +5% each |
| Maximum | 2.5× cap |

## When to Store

**DO store (auto or manual):**
- User preferences ("I prefer concise responses")
- Identity info ("My name is John", "I work at...")
- Important decisions ("We decided to use React")
- Constraints ("I'm allergic to shellfish", "Deadline is Friday")
- Corrections ("Actually the meeting is at 3pm")
- How-tos ("To deploy, run git push")

**DON'T store:**
- Transient info (weather, current time)
- Credentials (use secrets instead)
- Large files (use file storage)
- Generic chit-chat

## Privacy Guarantees

| What | Where | Server Sees |
|------|-------|-------------|
| Query embedding | Your device | Vector only |
| Content encryption | Your device | Ciphertext only |
| Key derivation | Your device | Nothing |
| Heuristic scoring | Your device | Nothing |

**The server cannot:**
- Read your memories
- Know what you're searching for
- Decrypt your content
- See what you're scoring

## Troubleshooting

**"Cannot decrypt - different vault"**
- Memory was stored with different password
- Use same `MEMRY_VAULT_PASSWORD` consistently

**Slow first run**
- Model downloads on first use (~80MB)
- Subsequent runs use cache (~200ms)

**Score too low**
- Add explicit markers: "remember that..."
- Include more context/entities
- Check heuristics output with `--dry-run`

**Missing dependencies**
```bash
pip3 install fastembed pycryptodome
```

## Files

```
scripts/
├── memry.py         # Main ZK CLI (store, search, context, list)
├── auto_extract.py  # Auto-extraction with heuristics
├── heuristics.py    # Heuristics engine (importable)
└── memry_plaintext.py # Non-ZK fallback (not recommended)
```
