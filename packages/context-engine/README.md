# @fathippo/fathippo-context-engine

FatHippo Context Engine for OpenClaw.

## Install

Hosted:

```bash
npx @fathippo/connect openclaw
```

Local:

```bash
npx @fathippo/connect openclaw --local
```

The one-command installer installs the plugin, configures OpenClaw, and uses a browser-link login flow for hosted mode.

## Manual fallback

```bash
openclaw plugins install @fathippo/fathippo-context-engine
openclaw config set plugins.slots.contextEngine fathippo-context-engine
openclaw config set plugins.entries.fathippo-context-engine.config.mode hosted
openclaw config set plugins.entries.fathippo-context-engine.config.apiKey mem_xxx
openclaw config set plugins.entries.fathippo-context-engine.config.baseUrl https://fathippo.ai/api
openclaw gateway restart
```

## Configuration

```yaml
plugins:
  slots:
    contextEngine: "fathippo-context-engine"
  entries:
    fathippo-context-engine:
      enabled: true
      config:
        mode: hosted
        apiKey: "${FATHIPPO_API_KEY}"
        baseUrl: "https://fathippo.ai/api"
        namespace: "my-project"
        installationId: "oc_machine_01"
        injectCritical: true
        injectLimit: 20
        dreamCycleOnCompact: true
```

`captureUserOnly: true` is still supported as a legacy escape hatch, but full-turn capture is now the default.

## Runtime behavior

| Hook | Behavior |
| --- | --- |
| `bootstrap` | Starts a hosted FatHippo session or initializes local workspace memory |
| `assemble` | Builds memory context before every non-trivial reply |
| `afterTurn` | Records the completed exchange, stores durable memories, and captures learning signals |
| `compact` | Runs Dream Cycle in hosted mode when enabled |
| `prepareSubagentSpawn` | Reuses the same memory scope for spawned agents |
| `onSubagentEnded` | Best-effort closes hosted child sessions |

Hosted mode uses the runtime session APIs (`startSession`, `buildContext`, `recordTurn`, `endSession`) instead of direct one-off memory calls.

## Features

- Hosted mode with account-backed retrieval, cognition, and dashboard receipts
- Local mode with on-device memory and lightweight local workflow learning
- Per-turn context recall before replies
- Full-turn capture after replies
- Dream Cycle compaction in hosted mode

If you previously installed `@fathippo/context-engine`, reinstall from `@fathippo/fathippo-context-engine` so OpenClaw discovers the matching package name and plugin id cleanly.
