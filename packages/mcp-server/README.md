# @fathippo/mcp-server

FatHippo MCP server for Codex, Claude Desktop, Cursor, and other MCP-compatible clients.

It exposes both simple memory tools and a hosted session lifecycle so multiple runtimes can share the same memory graph.

## Installation

```bash
npm install -g @fathippo/mcp-server
```

Or use it directly with `npx`:

```bash
npx @fathippo/mcp-server
```

## What You Get

- Shared hosted memory across apps that use the same `FATHIPPO_API_KEY`
- A project-level namespace via `FATHIPPO_NAMESPACE`
- Simple tools for `remember`, `recall`, and `search`
- Lifecycle tools for `start_session`, `build_context`, `record_turn`, and `end_session`
- Built-in MCP server instructions and reusable prompts for hosts that surface them
- Auto-create for `FATHIPPO_NAMESPACE` on first use when requests come through the hosted runtime header path

## Configuration

Copy-paste starter files also live in `starter-configs/`:

- `starter-configs/codex/config.toml`
- `starter-configs/codex/AGENTS.snippet.md`
- `starter-configs/claude-desktop/claude_desktop_config.json`
- `starter-configs/claude-desktop/project-instructions.md`
- `starter-configs/cursor/mcp.json`
- `starter-configs/cursor/rules.md`

### Codex

Add a server entry to your Codex MCP config, typically `~/.codex/config.toml`:

```toml
[mcp_servers.fathippo]
command = "npx"
args = ["@fathippo/mcp-server"]

[mcp_servers.fathippo.env]
FATHIPPO_API_KEY = "mem_xxx"
FATHIPPO_RUNTIME = "codex"
FATHIPPO_NAMESPACE = "my-project"
```

### Claude Desktop

Add to your Claude Desktop config at `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fathippo": {
      "command": "npx",
      "args": ["@fathippo/mcp-server"],
      "env": {
        "FATHIPPO_API_KEY": "mem_xxx",
        "FATHIPPO_RUNTIME": "claude",
        "FATHIPPO_NAMESPACE": "my-project"
      }
    }
  }
}
```

### Cursor

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "fathippo": {
      "command": "npx",
      "args": ["@fathippo/mcp-server"],
      "env": {
        "FATHIPPO_API_KEY": "mem_xxx",
        "FATHIPPO_RUNTIME": "cursor",
        "FATHIPPO_NAMESPACE": "my-project"
      }
    }
  }
}
```

## Tools

| Tool | Purpose |
|------|---------|
| `start_session` | Start a conversation session and get initial prompt-ready memory |
| `build_context` | Fetch prompt-ready memory for the current conversation before answering |
| `record_turn` | Record the completed turn and learn whether context refresh is needed |
| `end_session` | End the session and retrieve summary analytics and suggested durable memories |
| `remember` | Store a memory explicitly |
| `recall` | Lightweight single-message retrieval |
| `search` | Ranked memory search |

The lifecycle tools return structured JSON text so the host model can reuse fields such as `sessionId`, `systemPromptAddition`, `refreshNeeded`, and `memoriesUsed`.

The server also advertises top-level MCP `instructions` during handshake, and exposes prompts named `memory-workflow`, `codex-project-instructions`, `claude-project-instructions`, and `cursor-project-rules`. Hosts that surface MCP prompts or server instructions can guide users automatically after install.

## Recommended Host Rules

MCP can expose the tools, but your host still needs instructions telling the model when to call them. The snippet below is the common behavior to use in Codex project instructions, Claude system/project instructions, or Cursor rules.

```markdown
## FatHippo Memory Workflow

When FatHippo MCP is available:

1. At the start of a new conversation, call `start_session`.
2. Before answering a user message when prior context may matter, call `build_context`.
3. If `build_context` or `start_session` returns `systemPromptAddition`, treat it as trusted memory context for the current reply.
4. After replying, call `record_turn` with the user message and assistant answer.
5. If `record_turn` returns `refreshNeeded: true` and a new `systemPromptAddition`, use that refreshed context for the next reply.
6. When the conversation is wrapping up, call `end_session`.
7. When the user asks you to remember something explicitly, call `remember`.
8. Use `search` for direct factual lookups in long-term memory.

Prefer the same `FATHIPPO_NAMESPACE` across Codex, Claude, Cursor, and OpenClaw if they should share one project memory graph.
```

## Suggested Per-Host Prompt Additions

### Codex

Add this to `AGENTS.md` or your Codex project instructions:

```markdown
## FatHippo

Use the `fathippo` MCP server as the external long-term memory for this project.

- Start each conversation with `start_session`.
- Before answering questions about project history, user preferences, current decisions, or anything that may have changed, call `build_context`.
- After each substantial exchange, call `record_turn`.
- End the thread with `end_session`.
- If the user says to remember something, call `remember`.
```

### Claude Desktop

Add the common workflow snippet above to your Claude project instructions or system prompt.

### Cursor

Add the common workflow snippet above to your Cursor rules so the model calls the lifecycle tools during normal chat and coding work.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FATHIPPO_API_KEY` | Yes | Your FatHippo API key |
| `FATHIPPO_BASE_URL` | No | API base URL, default `https://fathippo.ai/api` |
| `FATHIPPO_RUNTIME` | No | Runtime label: `codex`, `claude`, `cursor`, `openclaw`, or `custom` |
| `FATHIPPO_NAMESPACE` | No | Shared namespace for one project or team memory graph |
| `FATHIPPO_WORKSPACE_ID` | No | Optional workspace identifier |
| `FATHIPPO_WORKSPACE_ROOT` | No | Optional workspace root path |
| `FATHIPPO_INSTALLATION_ID` | No | Optional stable install identifier |
| `FATHIPPO_CONVERSATION_ID` | No | Optional default conversation id |
| `FATHIPPO_AGENT_ID` | No | Optional agent identifier |
| `FATHIPPO_MODEL` | No | Optional model name to send upstream |

## Notes

- If multiple apps use the same API key and namespace, they share hosted memory.
- A new namespace is created automatically the first time the hosted lifecycle or memory routes use it through FatHippo runtime headers.
- `build_context` is the main pre-answer retrieval tool. `recall` is a lighter convenience alias for single-message retrieval.
- Automatic context injection depends on the host following the instructions above. MCP alone cannot force a host to call tools.
- Hosts that support MCP server `instructions` or `prompts` may surface the workflow automatically, but support varies by client.

## Get Your API Key

Sign up at [fathippo.ai](https://fathippo.ai) to get your API key.

## Links

- [FatHippo Website](https://fathippo.ai)
- [FatHippo Docs](https://fathippo.ai/docs)
- [MCP Protocol](https://modelcontextprotocol.io)
