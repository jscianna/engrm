---
name: fathippo-recall
description: "Auto-recalls relevant FatHippo memories on session bootstrap"
metadata:
  openclaw:
    emoji: "🦛"
    events: ["agent:bootstrap"]
    requires:
      env: ["FATHIPPO_API_KEY"]
---

# FatHippo Recall Hook

Automatically queries FatHippo memory on every session bootstrap and injects relevant context into your agent's workspace.

## What It Does

1. Fires on every `agent:bootstrap` event (new session or context refresh)
2. Queries FatHippo `/api/v1/simple/context` with recent conversation context
3. Writes retrieved memories to `FATHIPPO_CONTEXT.md` in your workspace
4. Your agent sees pre-fetched memories automatically in project context

## Installation

```bash
openclaw hooks install @fathippo/openclaw-hook
openclaw hooks enable fathippo-recall
```

## Configuration

Set your FatHippo API key in the hook entry:

```bash
openclaw config set hooks.internal.entries.fathippo-recall.env.FATHIPPO_API_KEY "mem_your_key_here"
```

Or add to your `openclaw.json`:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "fathippo-recall": {
          "enabled": true,
          "env": {
            "FATHIPPO_API_KEY": "mem_your_key_here"
          }
        }
      }
    }
  }
}
```

## How It Works

The hook extracts context from your workspace bootstrap files (like `MEMORY.md` or daily notes) and uses that to query FatHippo for relevant memories. The results are written to `FATHIPPO_CONTEXT.md` which gets injected into your agent's context automatically.

This means your agent starts every session with relevant historical context — no manual recall needed.

## Requirements

- OpenClaw 2026.3.0+
- FatHippo API key (get one at https://fathippo.ai)
- `hooks.internal.enabled: true` in your OpenClaw config
