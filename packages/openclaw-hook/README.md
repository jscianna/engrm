# @fathippo/openclaw-hook

🦛 **Auto-recall FatHippo memories in OpenClaw agents**

This hook automatically queries your FatHippo memory on every session start, so your agent always has relevant historical context.

## Quick Start

```bash
# Install the hook
openclaw hooks install @fathippo/openclaw-hook

# Enable it
openclaw hooks enable fathippo-recall

# Configure your API key
openclaw config set hooks.internal.entries.fathippo-recall.env.FATHIPPO_API_KEY "mem_your_key_here"

# Restart gateway
openclaw gateway restart
```

## What It Does

1. **On every session bootstrap** → Queries FatHippo with your workspace context
2. **Retrieves relevant memories** → Based on MEMORY.md, daily notes, or session info
3. **Writes to FATHIPPO_CONTEXT.md** → Automatically injected into agent context
4. **Agent starts smart** → No manual "check your memory" needed

## Why?

AI agents are goldfish. Every session starts fresh with zero memory of past conversations.

FatHippo fixes this by storing insights (not transcripts) and recalling them when relevant. This hook makes that recall **automatic** — your agent just knows things.

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FATHIPPO_API_KEY` | Your FatHippo API key | Required |
| `FATHIPPO_API_URL` | Custom API endpoint | `https://fathippo.ai/api/v1/simple/context` |

### OpenClaw Config

```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "fathippo-recall": {
          "enabled": true,
          "env": {
            "FATHIPPO_API_KEY": "mem_xxx"
          }
        }
      }
    }
  }
}
```

## Requirements

- OpenClaw 2026.3.0+
- FatHippo account ([sign up](https://fathippo.ai))

## License

MIT
