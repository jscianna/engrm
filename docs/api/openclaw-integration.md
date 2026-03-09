# FatHippo + OpenClaw Integration

Install once. Memory context works automatically across all your chats.

## Quick Start (Context Engine Plugin)

```bash
# 1. Install the plugin
openclaw plugins install @fathippo/context-engine

# 2. Set as the active context engine
openclaw config set plugins.slots.contextEngine=fathippo-context-engine

# 3. Set your API key
openclaw config set plugins.entries.fathippo-context-engine.config.apiKey=mem_xxx

# 4. Restart gateway
openclaw gateway restart
```

**Done.** Your agent now has persistent contextual memory.

## What Happens Automatically

| Event | Action |
|-------|--------|
| **Session starts** | FatHippo injects critical + relevant memories |
| **User sends messages** | Context engine captures useful insights |
| **Each turn** | FatHippo retrieves relevant context for prompt assembly |
| **Compaction** | Dream Cycle synthesis runs |
| **Subagent spawn/end** | Context is scoped and learnings are absorbed |

No manual API calls. No "remember this" commands. It just works.

## Works Across

- ✅ Telegram, Discord, WhatsApp, Slack
- ✅ Web, CLI, any OpenClaw channel
- ✅ Model switches (Claude → GPT → Gemini)
- ✅ Device changes (cloud-native)
- ✅ Gateway restarts (persistent)

## Configuration Options

```yaml
plugins:
  slots:
    contextEngine: fathippo-context-engine
  entries:
    fathippo-context-engine:
      enabled: true
      config:
        apiKey: mem_xxx                  # Required
        baseUrl: https://www.fathippo.ai/api # Optional
        injectCritical: true             # Optional (default: true)
        injectLimit: 20                  # Optional (default: 20)
        captureUserOnly: true            # Optional (default: true)
        dreamCycleOnCompact: true        # Optional (default: true)
```

## REST API (For Custom Integrations)

If you're not using OpenClaw, use the REST API directly:

```bash
# Get context for a message
curl -X POST "https://www.fathippo.ai/api/v1/simple/context" \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{"message": "What are my project deadlines?"}'

# Store a memory
curl -X POST "https://www.fathippo.ai/api/v1/simple/remember" \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{"text": "User prefers morning meetings"}'

# Search memories
curl -X POST "https://www.fathippo.ai/api/v1/search" \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{"query": "meeting preferences", "topK": 5}'
```
