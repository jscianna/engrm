---
name: memory-engrm
description: "Smart context recall from Engrm - fetches relevant memories on conversation start and trigger keywords"
metadata:
  openclaw:
    emoji: "🧠"
    events: ["message:received"]
    requires:
      env: ["ENGRM_API_KEY"]
---

# Engrm Memory Hook

Smart context recall from Engrm memory. Only fetches when likely useful to minimize API calls.

## What It Does

1. **Session start**: Fetches context on first message of conversation
2. **Trigger keywords**: Fetches when "remember", "what did we decide", project names appear
3. **Periodic refresh**: Max once per 5 minutes for substantive messages
4. Writes context to `~/clawd/ENGRM_CONTEXT.md` for agent reference

## Skips

- Short messages (<10 chars)
- Trivial messages (hi, ok, thanks)
- Commands (/status, /new)

## Configuration

Set in your OpenClaw config:

```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "memory-engrm": {
          "enabled": true,
          "env": {
            "ENGRM_API_KEY": "mem_your_api_key_here"
          }
        }
      }
    }
  }
}
```

## Requirements

- `ENGRM_API_KEY` environment variable or hook config
