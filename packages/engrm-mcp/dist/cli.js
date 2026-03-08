#!/usr/bin/env node
/**
 * MEMRY MCP Server CLI
 *
 * Usage:
 *   fathippo-mcp                    # Start MCP server (for Claude Desktop)
 *   fathippo-mcp --help             # Show help
 *
 * Environment variables:
 *   FATHIPPO_API_KEY           # Your FatHippo API key (required)
 *   FATHIPPO_API_URL           # API URL (default: https://fathippo.ai)
 *   FATHIPPO_VAULT_PASSWORD    # Vault password for encryption (required)
 */
import { runServer } from "./index.js";
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
    console.log(`
FATHIPPO MCP Server - Memory for AI Agents

Usage:
  fathippo-mcp           Start MCP server (for Claude Desktop, Cursor, etc.)

Environment variables (required):
  FATHIPPO_API_KEY          Your FatHippo API key
  FATHIPPO_VAULT_PASSWORD   Vault password for client-side encryption

Environment variables (optional):
  FATHIPPO_API_URL          API URL (default: https://fathippo.ai)

Privacy guarantees:
  - Embeddings generated locally (queries never leave your device)
  - Content encrypted client-side (server only sees ciphertext)
  - Server cannot read your memories or know what you search for

Claude Desktop configuration (~/.config/claude/claude_desktop_config.json):
  {
    "mcpServers": {
      "fathippo": {
        "command": "fathippo-mcp",
        "env": {
          "FATHIPPO_API_KEY": "mem_xxx",
          "FATHIPPO_VAULT_PASSWORD": "your-vault-password"
        }
      }
    }
  }
`);
    process.exit(0);
}
// Validate environment
if (!process.env.FATHIPPO_API_KEY) {
    console.error("Error: FATHIPPO_API_KEY environment variable is required");
    process.exit(1);
}
if (!process.env.FATHIPPO_VAULT_PASSWORD) {
    console.error("Error: FATHIPPO_VAULT_PASSWORD environment variable is required");
    console.error("This is used for client-side encryption. Server never sees it.");
    process.exit(1);
}
runServer().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
