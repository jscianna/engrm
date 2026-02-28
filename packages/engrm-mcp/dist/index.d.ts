/**
 * MEMRY MCP Server - Zero-Knowledge Memory for AI Agents
 *
 * Privacy guarantees:
 * - Embeddings generated locally (queries never leave device)
 * - Content encrypted client-side (server only sees ciphertext)
 * - Server cannot read your memories or know what you search for
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
export declare function createServer(): Promise<Server>;
export declare function runServer(): Promise<void>;
