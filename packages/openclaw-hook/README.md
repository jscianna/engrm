# @fathippo/openclaw-hook (DEPRECATED)

> ⚠️ **Deprecated**: Use `@fathippo/openclaw-memory` instead for full features (auto-recall + auto-capture + tools).
>
> ```bash
> openclaw plugins install @fathippo/openclaw-memory
> ```

---

Lightweight OpenClaw hook for [FatHippo](https://fathippo.ai) - recall only, no auto-capture.

## Installation

```bash
openclaw hooks install @fathippo/openclaw-hook
openclaw hooks enable memory-fathippo
```

## Configuration

Add your FatHippo API key:

```bash
openclaw config set hooks.internal.entries.memory-fathippo.config.apiKey "mem_your_key"
```

Get your API key at [fathippo.ai/dashboard](https://fathippo.ai/dashboard).

### Optional: Custom Trigger Words

Add project names or keywords that should trigger context fetch:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "memory-fathippo": {
          "enabled": true,
          "config": {
            "apiKey": "mem_your_key",
            "triggerWords": ["myproject", "acme", "product-name"]
          }
        }
      }
    }
  }
}
```

## How It Works

The hook automatically fetches relevant memories from FatHippo when:

1. **Conversation starts** - First message triggers context fetch
2. **Trigger keywords appear** - "remember", "what did we decide", "previously", etc.
3. **Custom words match** - Your configured project names
4. **Periodic refresh** - Every 5 minutes for long conversations

Context is written to `<workspace>/ENGRM_CONTEXT.md` for agent reference.

## Skips

To minimize API calls, the hook skips:
- Short messages (<5 chars)
- Trivial messages: "hi", "ok", "thanks"
- Commands: /status, /new

## License

MIT
