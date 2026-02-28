# Engrm Architecture

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AGENT SIDE                                      │
│                        (Your Device / Client)                                │
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │ Conversation │───▶│  Heuristic   │───▶│   Local      │───▶│   Local   │ │
│  │   Context    │    │   Scoring    │    │  Embedding   │    │ Encryption│ │
│  └──────────────┘    └──────────────┘    └──────────────┘    └─────┬─────┘ │
│                              │                   │                  │       │
│                              │                   │                  │       │
│                       score >= 6.0?        FastEmbed           AES-256-GCM  │
│                              │               ONNX             + vault key   │
│                              │                   │                  │       │
└──────────────────────────────┼───────────────────┼──────────────────┼───────┘
                               │                   │                  │
                               ▼                   ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                   HTTPS                                      │
│                                                                             │
│              { embedding: [0.1, 0.2, ...], content: "a8f3c2..." }           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Engrm SERVER                                     │
│                        (Zero-Knowledge Store)                                │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         CANNOT READ:                                  │  │
│  │                                                                       │  │
│  │    • Memory content (encrypted ciphertext only)                      │  │
│  │    • Search queries (receives embedding vector only)                 │  │
│  │    • Vault password (never transmitted)                              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────────┐  │
│  │   Turso    │    │  Vector    │    │   Graph    │    │    Arweave     │  │
│  │  Database  │    │  Search    │    │   Links    │    │   (Permanent)  │  │
│  └────────────┘    └────────────┘    └────────────┘    └────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Heuristic Scoring Engine

```
                            INPUT TEXT
                                │
                                ▼
    ┌───────────────────────────────────────────────────────────┐
    │                    SIGNAL DETECTION                        │
    │                                                            │
    │   ┌─────────────────┐  ┌─────────────────┐               │
    │   │ Explicit (+3.0) │  │ Decision (+2.0) │               │
    │   │ "remember this" │  │ "decided to..." │               │
    │   │ "my name is..." │  │ "going with..." │               │
    │   └────────┬────────┘  └────────┬────────┘               │
    │            │                    │                         │
    │   ┌────────┴────────┐  ┌────────┴────────┐               │
    │   │Correction (+1.5)│  │ Emotional (+1.5)│               │
    │   │ "actually..."   │  │ HIGH AROUSAL    │               │
    │   │ "no wait..."    │  │ "amazing!!!"    │               │
    │   └────────┬────────┘  └────────┬────────┘               │
    │            │                    │                         │
    │   ┌────────┴────────┐  ┌────────┴────────┐               │
    │   │ Temporal (+1.0) │  │  Causal (+1.0)  │               │
    │   │ "January 5th"   │  │ "because..."    │               │
    │   │ "next Tuesday"  │  │ "therefore..."  │               │
    │   └────────┬────────┘  └────────┬────────┘               │
    │            │                    │                         │
    │   ┌────────┴────────┐  ┌────────┴────────┐               │
    │   │Completion (+1.0)│  │ Entities (+2.0) │               │
    │   │ "done", "shipped│  │ Names, dates,   │               │
    │   │ "failed"        │  │ URLs, emails    │               │
    │   └────────┬────────┘  └────────┬────────┘               │
    │            │                    │                         │
    └────────────┼────────────────────┼─────────────────────────┘
                 │                    │
                 ▼                    ▼
    ┌────────────────────────────────────────────────────────────┐
    │                    TYPE DETECTION                          │
    │                                                            │
    │  constraint │ identity │ relationship │ preference         │
    │     1.3×    │   1.2×   │    1.1×     │    1.0×            │
    │                                                            │
    │  how_to    │   fact   │    event                          │
    │   1.0×     │   0.9×   │    0.8×                           │
    └────────────────────────────────────────────────────────────┘
                                │
                                ▼
    ┌────────────────────────────────────────────────────────────┐
    │              FINAL SCORE = base × multiplier               │
    │                                                            │
    │              score >= 6.0  ──▶  STORE                     │
    │              score <  6.0  ──▶  SKIP                      │
    └────────────────────────────────────────────────────────────┘
```

## Reinforcement ("Fire Together, Wire Together")

```
                         NEW MEMORY
                             │
                             ▼
                   ┌───────────────────┐
                   │  Embed Locally    │
                   │  (384-dim vector) │
                   └─────────┬─────────┘
                             │
                             ▼
                   ┌───────────────────┐
                   │ Find Similar      │
                   │ (cosine search)   │
                   └─────────┬─────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
    similarity > 0.85              similarity <= 0.85
              │                             │
              ▼                             ▼
    ┌─────────────────┐           ┌─────────────────┐
    │   REINFORCE     │           │   CREATE NEW    │
    │                 │           │                 │
    │ • EMA strength  │           │ • strength: 1.0 │
    │ • mention_count+│           │ • mention: 1    │
    │ • merge entities│           │ • set halflife  │
    └─────────────────┘           └─────────────────┘
              │
              ▼
    ┌─────────────────────────────────────────┐
    │           FREQUENCY BOOST               │
    │                                         │
    │   1st mention:  1.0× (base)            │
    │   2nd mention:  1.4× (+40%)            │
    │   3rd-5th:      +20% each              │
    │   6th+:         +5% each (log)         │
    │   Maximum:      2.5× cap               │
    │                                         │
    │   Example (dog "Rex" mentioned 5×):    │
    │   0.6 → 0.84 → 0.97 → 1.08 → 1.13     │
    └─────────────────────────────────────────┘
```

## Memory Decay (Ebbinghaus Forgetting Curve)

```
    STRENGTH
       │
    1.0┤ ●────────╮
       │          ╰────╮
    0.8┤               ╰───╮
       │                   ╰──╮
    0.6┤                      ╰──╮
       │                         ╰──╮
    0.4┤                            ╰──╮
       │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─╰─ ─ ARCHIVE THRESHOLD (0.3)
    0.2┤                                  ╰──╮
       │                                      ╰───▶ DELETE after 30 days
    0.0┤
       └──────────────────────────────────────────▶ TIME
          │        │         │          │
          0      halflife  2×half    3×half


    ┌───────────────────────────────────────────────────────────┐
    │                TYPE-SPECIFIC HALFLIVES                    │
    │                                                           │
    │   constraint ████████████████████████████████████ 180 days│
    │   how_to     ████████████████████████████ 120 days       │
    │   identity   ████████████████████████████ 120 days       │
    │   fact       ██████████████████████ 90 days              │
    │   preference ███████████████ 60 days                     │
    │   relationship ██████████ 30 days                        │
    │   event      ████ 14 days                                │
    └───────────────────────────────────────────────────────────┘


    ┌───────────────────────────────────────────────────────────┐
    │                    DECAY FORMULA                          │
    │                                                           │
    │   strength = base × (0.9 ^ (days_since_access / halflife))│
    │                                                           │
    │   ACCESS RESETS CLOCK  ──▶  strength stays high          │
    │   NO ACCESS            ──▶  strength decays              │
    └───────────────────────────────────────────────────────────┘
```

## Memory Graph (Associative Links)

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                        MEMORY GRAPH                             │
    │                                                                 │
    │                     ┌─────────┐                                │
    │            ┌────────│ "John's │────────┐                       │
    │            │similar │ TZ: SGT"│        │similar                │
    │            ▼        └─────────┘        ▼                       │
    │      ┌─────────┐                  ┌─────────┐                  │
    │      │"prefers │                  │"morning │                  │
    │      │  dark   │◀──── similar ───▶│meetings"│                  │
    │      │ theme"  │                  │         │                  │
    │      └─────────┘                  └────┬────┘                  │
    │                                        │                        │
    │                                        │ extends                │
    │                                        ▼                        │
    │                                  ┌─────────┐                   │
    │                                  │"schedule│                   │
    │                                  │calls 9am│                   │
    │                                  │ SGT"    │                   │
    │                                  └─────────┘                   │
    │                                                                 │
    │   LINK TYPES:                                                  │
    │   ─── similar ───   Same topic/concept                        │
    │   ─── extends ───   Adds detail to another                    │
    │   ─── updates ───   Supersedes/corrects                       │
    │   ─── contradicts   Conflicts with                            │
    │                                                                 │
    │   CO-RETRIEVAL STRENGTHENING:                                  │
    │   When memories surface together, edge weight += 0.5           │
    │   (Fire together, wire together)                               │
    └─────────────────────────────────────────────────────────────────┘
```

## Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│    CONVERSATION                                                             │
│    "My name is John, I work at Web3.com Ventures.                          │
│     I prefer morning meetings, around 9am SGT."                            │
│         │                                                                   │
│         ▼                                                                   │
│    ┌─────────────────────────────────────────────┐                         │
│    │          HEURISTIC EXTRACTION               │                         │
│    │                                             │                         │
│    │  "My name is John" ──▶ identity, score 7.2 │                         │
│    │  "I work at Web3.com" ──▶ identity, 6.8    │                         │
│    │  "prefer morning" ──▶ preference, 6.5      │                         │
│    │  "9am SGT" ──▶ fact, 6.1                   │                         │
│    └─────────────────────────────────────────────┘                         │
│         │                                                                   │
│         ▼                                                                   │
│    ┌─────────────────────────────────────────────┐                         │
│    │           LOCAL PROCESSING                  │                         │
│    │                                             │                         │
│    │  embed() ──▶ [0.12, -0.34, 0.56, ...]      │                         │
│    │  encrypt(vault_key) ──▶ "a8f3c2b1..."      │                         │
│    └─────────────────────────────────────────────┘                         │
│         │                                                                   │
│         │  { embedding: [...], ciphertext: "..." }                         │
│         ▼                                                                   │
│    ┌─────────────────────────────────────────────┐                         │
│    │              Engrm SERVER                   │                         │
│    │                                             │                         │
│    │  1. Check similarity (vector search)        │                         │
│    │  2. If similar > 0.85: REINFORCE           │                         │
│    │  3. Else: CREATE new memory                │                         │
│    │  4. Auto-link similar memories             │                         │
│    │  5. Queue for Arweave (permanent)          │                         │
│    └─────────────────────────────────────────────┘                         │
│         │                                                                   │
│         ▼                                                                   │
│    ┌─────────────────────────────────────────────┐                         │
│    │            LATER: RETRIEVAL                 │                         │
│    │                                             │                         │
│    │  Agent asks: "What time zone is the user?" │                         │
│    │         │                                   │                         │
│    │         ▼                                   │                         │
│    │  embed("timezone") ──▶ vector              │                         │
│    │  search(vector) ──▶ top 5 memories         │                         │
│    │  decrypt(vault_key) ──▶ plaintext          │                         │
│    │         │                                   │                         │
│    │         ▼                                   │                         │
│    │  "John is in SGT (GMT+8)"                  │                         │
│    └─────────────────────────────────────────────┘                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Security Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ZERO-KNOWLEDGE MODEL                              │
│                                                                             │
│   YOUR DEVICE                           Engrm SERVER                        │
│   ──────────                            ────────────                        │
│                                                                             │
│   ┌──────────────┐                      ┌──────────────┐                   │
│   │ Plaintext    │                      │ Ciphertext   │                   │
│   │ "John is in  │   ─────encrypt────▶  │ "a8f3c2b1..." │                   │
│   │  Singapore"  │                      │ (unreadable) │                   │
│   └──────────────┘                      └──────────────┘                   │
│                                                                             │
│   ┌──────────────┐                      ┌──────────────┐                   │
│   │ Query text   │                      │ Query vector │                   │
│   │ "timezone?"  │   ─────embed──────▶  │ [0.1, 0.2,..]│                   │
│   │              │                      │ (meaningless)│                   │
│   └──────────────┘                      └──────────────┘                   │
│                                                                             │
│   ┌──────────────┐                                                         │
│   │ Vault Key    │   ────NEVER SENT────▶  ❌                               │
│   │ (password)   │                                                         │
│   └──────────────┘                                                         │
│                                                                             │
│   ═══════════════════════════════════════════════════════════════════════  │
│                                                                             │
│   EVEN WITH FULL DATABASE ACCESS, SERVER CANNOT:                           │
│                                                                             │
│   ❌ Read your memories                                                    │
│   ❌ Know what you searched for                                            │
│   ❌ Decrypt your content                                                  │
│   ❌ Derive your vault password                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```
