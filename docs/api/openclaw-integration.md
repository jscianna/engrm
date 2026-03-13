# FatHippo + OpenClaw Integration

Install once. FatHippo then improves OpenClaw quietly over time.

OpenClaw users only install `@fathippo/context-engine`. The `@fathippo/local`, `@fathippo/hosted`, and `@fathippo/cognition` packages are developer package boundaries, not separate end-user installs.

## Quick Start (Hosted Mode)

```bash
# 1. Install the plugin
openclaw plugins install @fathippo/context-engine

# 2. Set as the active context engine
openclaw config set plugins.slots.contextEngine=fathippo-context-engine

# 3. Configure hosted mode
openclaw config set plugins.entries.fathippo-context-engine.config.mode=hosted
openclaw config set plugins.entries.fathippo-context-engine.config.apiKey=mem_xxx
openclaw config set plugins.entries.fathippo-context-engine.config.baseUrl=https://fathippo.ai/api
openclaw config set plugins.entries.fathippo-context-engine.config.injectCritical=true

# 4. Restart gateway
openclaw gateway restart
```

**Done.** Your OpenClaw agent now gets hosted retrieval, deeper cognition, dashboard receipts, sync/import features, and last-seen plugin version tracking.

If OpenClaw shows a warning like `plugin id mismatch (manifest uses "fathippo-context-engine", entry hints "context-engine")`, that is currently cosmetic. Keep using `fathippo-context-engine` for `plugins.slots.contextEngine` and `plugins.entries.*`.

## Quick Start (Local-Only Mode, No API Key)

```bash
# 1. Install the plugin
openclaw plugins install @fathippo/context-engine

# 2. Set as the active context engine
openclaw config set plugins.slots.contextEngine=fathippo-context-engine

# 3. Force local-only mode
openclaw config set plugins.entries.fathippo-context-engine.config.mode=local

# 4. Restart gateway
openclaw gateway restart
```

This stores and reuses local memory on the machine running OpenClaw and applies lightweight private workflow/fix learning. It does **not** use hosted cognition, sync/import features, or report plugin version back to the hosted FatHippo dashboard. Local mode stores its data in the configured local file on that machine.

## What Happens Automatically

| Event | Action |
|-------|--------|
| **Session starts** | FatHippo injects relevant memories and learned workflow hints |
| **User sends messages** | Context engine captures useful insights |
| **Each turn** | FatHippo retrieves relevant context for prompt assembly |
| **Compaction** | Hosted mode can run Dream Cycle synthesis; local mode keeps compaction local-only |
| **Subagent spawn/end** | Context is scoped and learnings are absorbed |

No manual API calls. No "remember this" commands. It just works.

Hosted mode gives the full FatHippo experience. Local-only mode keeps data private on the machine and supports memory plus lightweight local fix/workflow reuse, but not hosted sync/imports or account-backed cognition.

## Works Across

- ✅ Telegram, Discord, WhatsApp, Slack
- ✅ Web, CLI, any OpenClaw channel
- ✅ Model switches (Claude → GPT → Gemini)
- ✅ Device changes (hosted mode)
- ✅ Gateway restarts (persistent)

## Configuration Options

```yaml
plugins:
  slots:
    contextEngine: fathippo-context-engine
  entries:
    fathippo-context-engine:
      enabled: true
      config:
        mode: hosted                     # hosted or local
        apiKey: mem_xxx                  # Hosted mode only
        baseUrl: https://www.fathippo.ai/api # Optional
        injectCritical: true             # Optional (default: true)
        injectLimit: 20                  # Optional (default: 20)
        captureUserOnly: true            # Optional (default: true)
        dreamCycleOnCompact: true        # Optional (default: true)
        localProfileId: my-openclaw      # Optional (local mode)
        localStoragePath: ~/.openclaw/fathippo-local.json # Optional (local mode)
```

## Version Visibility

- Hosted mode automatically reports the plugin id, version, and mode on API requests.
- If `OPENCLAW_PUBLISHED_PLUGIN_VERSION` is configured on the FatHippo server, the dashboard can also show whether an update is available.
- Local-only mode stays private and does not check in with the hosted dashboard, so version/update badges are only authoritative for hosted connections.

## REST API (For Custom Integrations)

If you're not using OpenClaw, use the REST API directly:

```bash
# Get context for a message
curl -X POST "https://www.fathippo.ai/api/v1/simple/context" \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{"message": "What are my project deadlines?"}'

# Store a memory
curl -X POST "https://www.fathippo.ai/api/v1/simple/remember" \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{"text": "User prefers morning meetings"}'

# Search memories
curl -X POST "https://www.fathippo.ai/api/v1/search" \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{"query": "meeting preferences", "topK": 5}'
```
