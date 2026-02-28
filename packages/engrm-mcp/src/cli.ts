#!/usr/bin/env node
/**
 * MEMRY MCP Server CLI
 * 
 * Usage:
 *   memry-mcp                    # Start MCP server (for Claude Desktop)
 *   memry-mcp --help             # Show help
 * 
 * Environment variables:
 *   ENGRM_API_KEY           # Your MEMRY API key (required)
 *   ENGRM_API_URL           # API URL (default: https://memry-sand.vercel.app)
 *   ENGRM_VAULT_PASSWORD    # Vault password for encryption (required)
 */

import { runServer } from "./index.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
MEMRY MCP Server - Zero-Knowledge Memory for AI Agents

Usage:
  memry-mcp              Start MCP server (for Claude Desktop, Cursor, etc.)

Environment variables (required):
  ENGRM_API_KEY          Your MEMRY API key
  ENGRM_VAULT_PASSWORD   Vault password for client-side encryption

Environment variables (optional):
  ENGRM_API_URL          API URL (default: https://memry-sand.vercel.app)

Privacy guarantees:
  - Embeddings generated locally (queries never leave your device)
  - Content encrypted client-side (server only sees ciphertext)
  - Server cannot read your memories or know what you search for

Claude Desktop configuration (~/.config/claude/claude_desktop_config.json):
  {
    "mcpServers": {
      "memry": {
        "command": "memry-mcp",
        "env": {
          "ENGRM_API_KEY": "mem_xxx",
          "ENGRM_VAULT_PASSWORD": "your-vault-password"
        }
      }
    }
  }
`);
  process.exit(0);
}

// Validate environment
if (!process.env.ENGRM_API_KEY) {
  console.error("Error: ENGRM_API_KEY environment variable is required");
  process.exit(1);
}

if (!process.env.ENGRM_VAULT_PASSWORD) {
  console.error("Error: ENGRM_VAULT_PASSWORD environment variable is required");
  console.error("This is used for client-side encryption. Server never sees it.");
  process.exit(1);
}

runServer().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
