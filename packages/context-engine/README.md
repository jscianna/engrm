# @fathippo/context-engine

FatHippo Context Engine for OpenClaw — encrypted agent memory with semantic search, Dream Cycle synthesis, and tiered intelligence.

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
        apiKey: "${FATHIPPO_API_KEY}"
        # Optional settings
        injectCritical: true        # Auto-inject critical memories (default: true)
        injectLimit: 20             # Max memories per turn (default: 20)
        captureUserOnly: true       # Only capture user messages (default: true)
        dreamCycleOnCompact: true   # Run Dream Cycle on /compact (default: true)
```

## What It Does

Instead of bolting memory onto OpenClaw, this makes FatHippo the **entire context layer**:

| Hook | What Happens |
|------|-------------|
| **bootstrap** | Loads critical memories + recent context on session start |
| **ingest** | Captures user messages, filters noise, stores to FatHippo |
| **assemble** | Queries FatHippo, injects relevant memories per turn |
| **compact** | Runs Dream Cycle (synthesis, decay) instead of lossy compaction |
| **afterTurn** | Invalidates caches, triggers async processing |
| **prepareSubagentSpawn** | Scopes memories for spawned agents |
| **onSubagentEnded** | Absorbs learnings from completed subagents |

## Features

- **Encrypted at rest** — AES-256-GCM, per-user keys
- **Semantic search** — Vector + BM25 hybrid search
- **Tiered intelligence** — Critical/high/normal/low importance
- **Dream Cycle** — Automatic synthesis, decay, and cleanup
- **Cross-device** — Cloud-native, works across all your agents

## API Key

Get your API key at [fathippo.com](https://www.fathippo.com)

## Links

- [FatHippo Docs](https://www.fathippo.com/docs)
- [OpenClaw Plugins](https://docs.openclaw.ai/tools/plugin)
- [GitHub](https://github.com/jscianna/fathippo)
