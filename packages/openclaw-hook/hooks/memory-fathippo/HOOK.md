---
name: memory-fathippo
description: "Auto-recall FatHippo memories on conversation start and trigger keywords"
homepage: https://fathippo.ai/docs/openclaw
metadata:
  openclaw:
    emoji: "🧠"
    events: ["message:received"]
    requires:
      config: ["hooks.internal.entries.memory-fathippo.config.apiKey"]
---

# FatHippo Memory Hook

Automatically fetches relevant memories from [FatHippo](https://fathippo.ai) when conversations start or trigger keywords appear.

## Installation

```bash
openclaw hooks install fathippo-openclaw
openclaw hooks enable memory-fathippo
```

## Configuration

Add your FatHippo API key to OpenClaw config:

```bash
openclaw config set hooks.internal.entries.memory-fathippo.config.apiKey "mem_your_key_here"
```

Or manually in `~/.openclaw/openclaw.json`:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "memory-fathippo": {
          "enabled": true,
          "config": {
            "apiKey": "mem_your_api_key"
          }
        }
      }
    }
  }
}
```

Get your API key at [fathippo.ai/dashboard](https://fathippo.ai/dashboard).

## What It Does

1. **Session start**: Fetches context on first message
2. **Trigger keywords**: "remember", "what did we decide", "previously"
3. **Project names**: Configurable trigger words
4. **Periodic refresh**: Max once per 5 minutes

Writes context to `<workspace>/ENGRM_CONTEXT.md` for agent reference.

## Skips

- Short messages (<5 chars)
- Trivial: "hi", "ok", "thanks"
- Commands: /status, /new
