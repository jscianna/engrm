---
name: memory-engrm
description: "Auto-recall Engrm memories on conversation start and trigger keywords"
homepage: https://engrm.xyz/docs/openclaw
metadata:
  openclaw:
    emoji: "🧠"
    events: ["message:received"]
    requires:
      config: ["hooks.internal.entries.memory-engrm.config.apiKey"]
---

# Engrm Memory Hook

Automatically fetches relevant memories from [Engrm](https://engrm.xyz) when conversations start or trigger keywords appear.

## Installation

```bash
openclaw hooks install engrm-openclaw
openclaw hooks enable memory-engrm
```

## Configuration

Add your Engrm API key to OpenClaw config:

```bash
openclaw config set hooks.internal.entries.memory-engrm.config.apiKey "mem_your_key_here"
```

Or manually in `~/.openclaw/openclaw.json`:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "memory-engrm": {
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

Get your API key at [engrm.xyz/dashboard](https://engrm.xyz/dashboard).

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
