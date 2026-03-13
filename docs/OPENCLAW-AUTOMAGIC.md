# FatHippo + OpenClaw: Automagic Integration

## Vision
Install once. Agent remembers forever. No manual API calls.

## How It Works

### Level 1: Plugin-Based (Current)
OpenClaw loads the FatHippo context engine and injects memory automatically.
```
User installs plugin → OpenClaw loads context engine → FatHippo injects and captures memory
```
**Pros:** Works today
**Cons:** Requires OpenClaw plugin configuration

### Level 2: Config Integration (Proposed)
OpenClaw config enables FatHippo automatically.
```yaml
# ~/.openclaw/config.yaml
memory:
  provider: fathippo
  apiKey: ${FATHIPPO_API_KEY}
  auto:
    contextInjection: true   # Inject at session start
    insightExtraction: true  # Store on important messages
    sessionTracking: true    # Track conversation state
```

**How it would work:**
1. Session starts → OpenClaw calls `/simple/context` → injects into system prompt
2. User sends message → OpenClaw detects importance → calls `/simple/remember`
3. Session ends → OpenClaw calls `/sessions/end` → extracts final insights

**Pros:** True zero-config for users
**Cons:** Requires OpenClaw changes

### Level 3: MCP Server (Future)
FatHippo as Model Context Protocol server.
```yaml
mcpServers:
  fathippo:
    command: npx fathippo-mcp
    env:
      FATHIPPO_API_KEY: mem_xxx
```

Agent automatically has memory tools available.

---

## Implementation Plan

### Phase 1: Hosted Plugin (Now)
- [x] `@fathippo/fathippo-context-engine` published
- [x] Context engine slot mapping
- [x] Automatic hosted context injection and capture

### Phase 2: OpenClaw Plugin (Next)
- [ ] Expand `@fathippo/fathippo-context-engine` with more zero-config hooks
- [ ] Config-based auto-injection
- [ ] Hooks: onSessionStart, onMessage, onSessionEnd
- [ ] Zero code required after config

### Phase 3: MCP Integration (Future)
- [ ] `fathippo-mcp` server package
- [ ] Tools: remember, recall, context
- [ ] Works with any MCP-compatible client

---

## For Users Today

Until deeper OpenClaw hooks ship, use the context engine plugin:

1. **Install the plugin:**
```bash
openclaw plugins install @fathippo/fathippo-context-engine
openclaw config set plugins.slots.contextEngine fathippo-context-engine
openclaw config set plugins.entries.fathippo-context-engine.config.mode hosted
openclaw config set plugins.entries.fathippo-context-engine.config.apiKey mem_xxx
openclaw config set plugins.entries.fathippo-context-engine.config.baseUrl https://fathippo.ai/api
openclaw config set plugins.entries.fathippo-context-engine.config.injectCritical true
openclaw gateway restart
```

2. **OpenClaw automatically:**
- Queries FatHippo at conversation start (if relevant)
- Stores insights during conversation
- Tracks memory usage through the context engine slot

---

## What "Automagic" Means

| Level | User Action | Agent Behavior |
|-------|-------------|----------------|
| **Manual** | Call APIs explicitly | Only when told |
| **Plugin** | Install plugin | Automatic context injection |
| **Config** | Add 3 lines to config | Automatic hooks |
| **MCP** | Enable server | Native tool access |

We're building toward deeper Config/MCP hooks. The plugin works today.
