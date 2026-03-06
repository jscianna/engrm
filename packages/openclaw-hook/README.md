# @engrm/openclaw-hook (DEPRECATED)

> ⚠️ **Deprecated**: Use `@engrm/openclaw-memory` instead for full features (auto-recall + auto-capture + tools).
>
> ```bash
> openclaw plugins install @engrm/openclaw-memory
> ```

---

Lightweight OpenClaw hook for [Engrm](https://engrm.xyz) - recall only, no auto-capture.

## Installation

```bash
openclaw hooks install @engrm/openclaw-hook
openclaw hooks enable memory-engrm
```

## Configuration

Add your Engrm API key:

```bash
openclaw config set hooks.internal.entries.memory-engrm.config.apiKey "mem_your_key"
```

Get your API key at [engrm.xyz/dashboard](https://engrm.xyz/dashboard).

### Optional: Custom Trigger Words

Add project names or keywords that should trigger context fetch:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "memory-engrm": {
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

The hook automatically fetches relevant memories from Engrm when:

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
