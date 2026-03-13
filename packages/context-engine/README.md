# @fathippo/context-engine

FatHippo Context Engine for OpenClaw — persistent agent memory with hosted cognition or private local mode.

## Installation

```bash
openclaw plugins install @fathippo/context-engine
```

## Configuration

```yaml
# ~/.openclaw/config.yaml
plugins:
  slots:
    contextEngine: "fathippo-context-engine"
  entries:
    fathippo-context-engine:
      enabled: true
      config:
        mode: hosted                # hosted or local
        apiKey: "${FATHIPPO_API_KEY}" # Hosted mode only
        baseUrl: "https://fathippo.ai/api"
        # Optional settings
        injectCritical: true        # Auto-inject critical memories (default: true)
        injectLimit: 20             # Max memories per turn (default: 20)
        captureUserOnly: true       # Only capture user messages (default: true)
        dreamCycleOnCompact: true   # Run Dream Cycle on /compact in hosted mode
```

## What It Does

Instead of bolting memory onto OpenClaw, this makes FatHippo the **entire context layer**:

| Hook | What Happens |
|------|-------------|
| **bootstrap** | Loads hosted critical context or initializes local workspace memory |
| **ingest** | Captures user messages, filters noise, stores hosted or local memory |
| **assemble** | Queries hosted FatHippo or local store and injects relevant context per turn |
| **compact** | Runs hosted Dream Cycle or skips hosted compaction in local mode |
| **afterTurn** | Invalidates caches and captures hosted or local learning signals |
| **prepareSubagentSpawn** | Scopes memories for spawned agents |
| **onSubagentEnded** | Absorbs learnings from completed subagents |

## Features

- **Hosted mode** — Full FatHippo retrieval, cognition, sync, and receipts
- **Local mode** — Private on-device memory plus lightweight local workflow/fix learning
- **Semantic search** — Hosted hybrid search or local memory ranking
- **Dream Cycle** — Automatic synthesis, decay, and cleanup in hosted mode
- **Cross-device** — Hosted mode follows your account across devices

## API Key

Get your API key at [fathippo.ai](https://fathippo.ai)

## OpenClaw CLI Setup

```bash
openclaw plugins install @fathippo/context-engine
openclaw config set plugins.slots.contextEngine=fathippo-context-engine
openclaw config set plugins.entries.fathippo-context-engine.config.mode=hosted
openclaw config set plugins.entries.fathippo-context-engine.config.apiKey=mem_xxx
openclaw config set plugins.entries.fathippo-context-engine.config.baseUrl=https://fathippo.ai/api
openclaw config set plugins.entries.fathippo-context-engine.config.injectCritical=true
openclaw gateway restart
```

If OpenClaw warns that the manifest uses `fathippo-context-engine` while the entry hints `context-engine`, that warning is cosmetic. Keep using `fathippo-context-engine` for `plugins.slots.contextEngine` and `plugins.entries.*`.

## Links

- [FatHippo Docs](https://fathippo.ai/docs)
- [OpenClaw Plugins](https://docs.openclaw.ai/tools/plugin)
- [GitHub](https://github.com/jscianna/fathippo)
