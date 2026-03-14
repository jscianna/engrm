# FatHippo MCP Starter Configs

These files are meant to be copy-paste starters for each supported host.

Replace these placeholders before pasting:

- `mem_xxx` with your FatHippo API key
- `my-project` with the shared namespace you want Codex, Claude, Cursor, and OpenClaw to use

That namespace will be created automatically the first time the hosted lifecycle or memory flows use it through the FatHippo runtime headers.

Each host has two pieces:

- An MCP server config
- A small instruction/rules snippet so the host actually uses the lifecycle tools automatically

## Codex

- MCP config: `codex/config.toml`
- Project instructions: `codex/AGENTS.snippet.md`

## Claude Desktop

- MCP config: `claude-desktop/claude_desktop_config.json`
- Project instructions: `claude-desktop/project-instructions.md`

## Cursor

- MCP config: `cursor/mcp.json`
- Rules snippet: `cursor/rules.md`
