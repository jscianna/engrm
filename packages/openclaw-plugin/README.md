# @fathippo/memory

Cloud-native encrypted memory for OpenClaw agents. Install once, remember forever.

## Why FatHippo?

| Feature | memory-core | memory-lancedb | **@fathippo/memory** |
|---------|-------------|----------------|-------------------|
| Storage | Local files | Local DB | **Cloud (Turso)** |
| Encryption | ❌ | ❌ | **AES-256-GCM** |
| Cross-device | ❌ | ❌ | **✅** |
| Auto-recall | ❌ | ✅ | **✅** |
| Auto-capture | ❌ | ✅ | **✅** |
| Tiered memory | ❌ | ❌ | **Critical/High/Normal** |

## Installation

```bash
# Install
openclaw plugins install @fathippo/memory

# Configure your API key
openclaw config set plugins.entries.fathippo-memory.config.apiKey "mem_your_key"

# Enable as memory slot
openclaw config set plugins.slots.memory fathippo-memory

# Restart
openclaw gateway restart
```

## Configuration

```yaml
# ~/.openclaw/config.yaml
plugins:
  slots:
    memory: fathippo-memory
  entries:
    fathippo-memory:
      enabled: true
      config:
        apiKey: mem_xxx  # Your FatHippo API key
        autoRecall: true  # Inject memories automatically
        autoCapture: true # Store insights automatically
```

## How It Works

### Auto-Recall (before_agent_start)
When a conversation starts, FatHippo automatically:
1. Analyzes the user's first message
2. Retrieves relevant memories (critical + matched)
3. Injects them into the system prompt

Your agent knows the user's preferences, past decisions, and context — automatically.

### Auto-Capture (agent_end)
After each conversation, FatHippo automatically:
1. Scans user messages for important content
2. Detects preferences, decisions, facts, entities
3. Stores them (with duplicate detection)

No manual "remember this" needed.

## Tools

| Tool | Description |
|------|-------------|
| `memory_recall` | Search memories by query |
| `memory_store` | Explicitly store a memory |
| `memory_forget` | Delete a memory (GDPR) |

## Security

- **Encrypted at rest**: AES-256-GCM with per-user keys
- **Prompt injection protection**: Filters malicious patterns
- **Self-poisoning prevention**: Only captures user messages

## Get Started

1. Create account at [fathippo.ai](https://fathippo.ai)
2. Get your API key from the dashboard
3. Install the plugin
4. Configure and restart OpenClaw

Your agent now has permanent memory.

## Links

- **Website**: https://fathippo.ai
- **Docs**: https://fathippo.ai/docs/guides/openclaw
- **GitHub**: https://github.com/jscianna/fathippo
