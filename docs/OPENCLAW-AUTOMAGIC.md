# Engrm + OpenClaw: Automagic Integration

## Vision
Install once. Agent remembers forever. No manual API calls.

## How It Works

### Level 1: Skill-Based (Current)
Agent reads SKILL.md and follows automatic behaviors.
```
User installs skill → Agent reads instructions → Agent calls Engrm APIs
```
**Pros:** Works today
**Cons:** Depends on agent following instructions

### Level 2: Config Integration (Proposed)
OpenClaw config enables Engrm automatically.
```yaml
# ~/.openclaw/config.yaml
memory:
  provider: engrm
  apiKey: ${ENGRM_API_KEY}
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
Engrm as Model Context Protocol server.
```yaml
mcpServers:
  engrm:
    command: npx engrm-mcp
    env:
      ENGRM_API_KEY: mem_xxx
```

Agent automatically has memory tools available.

---

## Implementation Plan

### Phase 1: Enhanced Skill (Now)
- [x] SKILL.md with automatic behaviors
- [x] Clear triggers for when to query/store
- [ ] OpenClaw recognizes `engrm` skill and prioritizes loading

### Phase 2: OpenClaw Plugin (Next)
- [ ] `openclaw-plugin-engrm` npm package
- [ ] Config-based auto-injection
- [ ] Hooks: onSessionStart, onMessage, onSessionEnd
- [ ] Zero code required after config

### Phase 3: MCP Integration (Future)
- [ ] `engrm-mcp` server package
- [ ] Tools: remember, recall, context
- [ ] Works with any MCP-compatible client

---

## For Users Today

Until Level 2/3 ship, use the skill:

1. **Install skill:**
```bash
# Copy to your skills folder
cp -r engrm-skill ~/.openclaw/skills/engrm
```

2. **Add to AGENTS.md or TOOLS.md:**
```markdown
### Engrm Memory
API Key: mem_xxx
Skill loaded. Auto-query on project/preference topics.
```

3. **Agent automatically:**
- Queries Engrm at conversation start (if relevant)
- Stores insights during conversation
- Logs search misses for improvement

---

## What "Automagic" Means

| Level | User Action | Agent Behavior |
|-------|-------------|----------------|
| **Manual** | Call APIs explicitly | Only when told |
| **Skill** | Install skill | Follows instructions |
| **Config** | Add 3 lines to config | Automatic hooks |
| **MCP** | Enable server | Native tool access |

We're building toward Config/MCP. Skill works today.
