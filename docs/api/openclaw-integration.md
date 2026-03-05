# Engrm + OpenClaw Integration

Install once. Memory works automatically across all your chats.

## Quick Start (Plugin)

```bash
# 1. Install the plugin
openclaw plugins install @engrm/memory

# 2. Set your API key
openclaw config set plugins.entries.memory-engrm.config.apiKey=mem_xxx

# 3. Enable as memory provider
openclaw config set plugins.slots.memory=memory-engrm

# 4. Restart gateway
openclaw gateway restart
```

**Done.** Your agent now has persistent memory across all channels.

## What Happens Automatically

| Event | Action |
|-------|--------|
| **Session starts** | Engrm injects relevant memories into context |
| **User states preference** | Auto-captured and stored |
| **Decision is made** | Auto-captured and stored |
| **User corrects agent** | Learned and stored |
| **Session ends** | Insights extracted and saved |

No manual API calls. No "remember this" commands. It just works.

## Works Across

- ✅ Telegram, Discord, WhatsApp, Slack
- ✅ Web, CLI, any OpenClaw channel
- ✅ Model switches (Claude → GPT → Gemini)
- ✅ Device changes (cloud-native)
- ✅ Gateway restarts (persistent)

## Configuration Options

```yaml
# ~/.openclaw/config.yaml
plugins:
  slots:
    memory: memory-engrm
  entries:
    memory-engrm:
      enabled: true
      config:
        apiKey: mem_xxx           # Required
        baseUrl: https://www.engrm.xyz/api/v1  # Optional
        autoRecall: true          # Inject context at session start
        autoCapture: true         # Store insights automatically
        recallLimit: 5            # Max memories to inject
        captureMaxChars: 2000     # Max chars for auto-capture
```

## What Gets Stored (Cognitive, Not Data Dump)

**Stored:**
- "User prefers concise responses"
- "Decided to use PostgreSQL"
- "User's timezone is Singapore"
- "Correction: deadline is March 15"

**Not stored:**
- Casual chit-chat
- Every message verbatim
- Temporary debugging
- Questions without insights

## Manual Tools (Optional)

The plugin also registers tools you can use explicitly:

| Tool | Description |
|------|-------------|
| `memory_recall` | Search memories by query |
| `memory_store` | Explicitly store something |
| `memory_forget` | Delete a memory (GDPR) |

## REST API (For Custom Integrations)

If you're not using OpenClaw, use the REST API directly:

```bash
# Get context for a message
curl -X POST "https://www.engrm.xyz/api/v1/simple/context" \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{"message": "What are my project deadlines?"}'

# Store a memory
curl -X POST "https://www.engrm.xyz/api/v1/simple/remember" \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{"text": "User prefers morning meetings"}'

# Search memories
curl -X POST "https://www.engrm.xyz/api/v1/search" \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{"query": "meeting preferences", "topK": 5}'
```

## Security

- **Encrypted at rest:** AES-256-GCM with per-user keys
- **Encrypted in transit:** HTTPS
- **Prompt injection protection:** Memories wrapped in safe tags
- **Self-poisoning prevention:** Only user messages captured

*Note: LLM-based features (entity extraction, consolidation) currently use external providers. Confidential compute roadmap in progress.*

## Get Started

1. Create account at [engrm.xyz](https://engrm.xyz)
2. Get your API key from dashboard
3. Run the 3 commands above
4. Your agent now remembers everything
