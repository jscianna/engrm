# fathippo-mcp

Zero-knowledge MCP server for FatHippo. Your queries and memories never leave your device unencrypted.

## Privacy Guarantees

- **Client-side embeddings**: Queries are embedded locally using transformers.js. The server only receives vectors, never your search text.
- **Client-side encryption**: Memories are encrypted with AES-256-GCM before upload. The server only stores ciphertext.
- **Zero-knowledge**: The FatHippo server cannot read your memories or know what you're searching for.

## Installation

```bash
npm install -g fathippo-mcp
```

## Configuration

### Environment Variables

```bash
FatHippo_API_KEY=mem_xxx           # Required: Your FatHippo API key
FatHippo_VAULT_PASSWORD=xxx        # Required: Password for client-side encryption
FatHippo_API_URL=https://...       # Optional: API URL (defaults to fathippo.ai)

# Auto-namespace (optional) - isolates memories per chat/project
FatHippo_NAMESPACE=my-project      # Or use FatHippo_CHAT_ID / FatHippo_SESSION_ID
```

### Auto-Namespace for Chat Isolation

Memories can be automatically isolated by chat context. Set `FatHippo_NAMESPACE` and all store/search operations will be scoped to that namespace:

```bash
# Different chats → different namespaces → isolated memories
FatHippo_NAMESPACE="deals-chat"      # Memories only visible in deals chat
FatHippo_NAMESPACE="gnkscan-project" # Memories only visible in gnkscan context
```

For OpenClaw, you can set this dynamically per session:
```bash
FatHippo_NAMESPACE="${chat_id}"       # Use Telegram/Discord chat ID
FatHippo_NAMESPACE="${conversation_label}"  # Use conversation label
```

Use `global: true` in search/context tools to search across ALL namespaces.

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "fathippo": {
      "command": "fathippo-mcp",
      "env": {
        "FatHippo_API_KEY": "mem_xxx",
        "FatHippo_VAULT_PASSWORD": "your-secure-password"
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
| `fathippo_store` | Store a memory (encrypted locally, vector computed locally) |
| `fathippo_search` | Semantic search (query embedded locally, server only sees vector) |
| `fathippo_context` | Get relevant context for current conversation |
| `fathippo_list` | List recent memories |
| `fathippo_delete` | Delete a memory by ID |

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Device (Private)                     │
├─────────────────────────────────────────────────────────────┤
│  Claude Desktop                                              │
│       │                                                      │
│       ▼                                                      │
│  fathippo-mcp                                                   │
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
│                    FatHippo Server (Blind)                      │
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
