/**
 * FatHippo MCP Server - Zero-Knowledge Memory for AI Agents
 *
 * Privacy notes:
 * - Content can be encrypted client-side before API storage.
 * - Search queries are sent to FatHippo APIs for retrieval.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
export declare function createServer(): Promise<Server>;
export declare function runServer(): Promise<void>;
