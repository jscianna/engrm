# 🦛 FatHippo CLI

Your coding agent gets smarter every session — across every platform.

## Quick Start

```bash
npx fathippo setup
```

This single command:
1. Opens browser for authentication (or use `--key` for headless)
2. Detects installed coding platforms
3. Configures FatHippo MCP for each one

## Supported Platforms

| Platform | Config |
|---|---|
| Claude Code | `~/.claude.json` |
| Cursor | `~/.cursor/mcp.json` |
| Codex | `~/.codex/config.toml` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Zed | `~/.config/zed/settings.json` |
| VS Code | `~/.vscode/mcp.json` |
| OpenCode | `~/.config/opencode/config.json` |
| Antigravity | `~/.gemini/antigravity/mcp_config.json` |
| Trae | `~/.trae/mcp.json` |
| Qoder | `~/Library/Application Support/Qoder/SharedClientCache/mcp.json` |
| Hermes Agent | `~/.hermes/config.yaml` |
| OpenClaw | Context engine plugin |

## Commands

```bash
# Setup all platforms
npx fathippo setup

# Check what's configured
npx fathippo setup --status

# Run readiness diagnostics (auth, MCP, recall health)
npx fathippo doctor

# JSON output for CI/scripts
npx fathippo doctor --json

# Remove FatHippo from all platforms
npx fathippo setup --remove

# Configure only one platform
npx fathippo setup --platform "Claude Code"

# Store a memory
npx fathippo store "Always use connection pooling for Turso"

# Search memories
npx fathippo search "database connection"

# Initialize a project
npx fathippo init
```

## Authentication

By default, `setup` opens your browser for device-code authentication. For CI/headless:

```bash
npx fathippo setup --key mem_your_api_key_here
# Or via environment variable
FATHIPPO_API_KEY=mem_... npx fathippo setup
```

## What happens after setup?

Every connected coding agent automatically:
- 🧠 Recalls relevant patterns from past sessions
- 📝 Records coding traces for learning
- ⚡ Gets skill suggestions from solved problems
- 🔄 Submits feedback to improve pattern quality

Learn more at [fathippo.ai](https://fathippo.ai)
