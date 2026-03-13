# @fathippo/mcp-server

FatHippo MCP server for Cursor, Claude Desktop, and other MCP-compatible clients.

## Installation

```bash
npm install -g @fathippo/mcp-server
```

Or use directly with npx:

```bash
npx @fathippo/mcp-server
```

## Configuration

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "fathippo": {
      "command": "npx",
      "args": ["@fathippo/mcp-server"],
      "env": {
        "FATHIPPO_API_KEY": "mem_xxx"
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
        "FATHIPPO_API_KEY": "mem_xxx"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `remember` | Store a memory (text, optional title) |
| `recall` | Get relevant context for a message |
| `search` | Search memories by query |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FATHIPPO_API_KEY` | Yes | Your FatHippo API key |
| `FATHIPPO_BASE_URL` | No | API base URL (default: `https://fathippo.ai/api`) |

## Get Your API Key

Sign up at [fathippo.ai](https://fathippo.ai) to get your API key.

## Links

- [FatHippo Website](https://fathippo.ai)
- [FatHippo Docs](https://fathippo.ai/docs)
- [MCP Protocol](https://modelcontextprotocol.io)
