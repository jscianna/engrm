# memry-mcp

Zero-knowledge MCP server for MEMRY. Your queries and memories never leave your device unencrypted.

## Privacy Guarantees

- **Client-side embeddings**: Queries are embedded locally using transformers.js. The server only receives vectors, never your search text.
- **Client-side encryption**: Memories are encrypted with AES-256-GCM before upload. The server only stores ciphertext.
- **Zero-knowledge**: The MEMRY server cannot read your memories or know what you're searching for.

## Installation

```bash
npm install -g memry-mcp
```

## Configuration

### Environment Variables

```bash
MEMRY_API_KEY=mem_xxx           # Required: Your MEMRY API key
MEMRY_VAULT_PASSWORD=xxx        # Required: Password for client-side encryption
MEMRY_API_URL=https://...       # Optional: API URL (defaults to memry-sand.vercel.app)
```

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "memry": {
      "command": "memry-mcp",
      "env": {
        "MEMRY_API_KEY": "mem_xxx",
        "MEMRY_VAULT_PASSWORD": "your-secure-password"
      }
    }
  }
}
```

### Cursor / Other MCP Clients

Configure similarly using your client's MCP server settings.

## Tools

| Tool | Description |
|------|-------------|
| `memry_store` | Store a memory (encrypted locally, vector computed locally) |
| `memry_search` | Semantic search (query embedded locally, server only sees vector) |
| `memry_context` | Get relevant context for current conversation |
| `memry_list` | List recent memories |
| `memry_delete` | Delete a memory by ID |

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Device (Private)                     │
├─────────────────────────────────────────────────────────────┤
│  Claude Desktop                                              │
│       │                                                      │
│       ▼                                                      │
│  memry-mcp                                                   │
│       │                                                      │
│       ├──► Embed query locally (transformers.js)             │
│       │    "meeting preferences" → [0.12, -0.34, ...]        │
│       │                                                      │
│       ├──► Encrypt content locally (AES-256-GCM)             │
│       │    "John prefers mornings" → "aGVsbG8gd29ybGQ..."    │
│       │                                                      │
│       ▼                                                      │
└───────┬─────────────────────────────────────────────────────┘
        │  Only vectors + encrypted blobs
        ▼
┌─────────────────────────────────────────────────────────────┐
│                    MEMRY Server (Blind)                      │
├─────────────────────────────────────────────────────────────┤
│  • Receives vector [0.12, -0.34, ...] (can't know meaning)   │
│  • Stores encrypted blob (can't decrypt)                     │
│  • Does vector similarity search                             │
│  • Returns encrypted results                                 │
└─────────────────────────────────────────────────────────────┘
```

## First Run

On first run, the embedding model (~80MB) will be downloaded. Subsequent runs use the cached model.

## License

MIT
