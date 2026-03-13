#!/usr/bin/env node
/**
 * FatHippo MCP Server
 *
 * Provides memory tools for Cursor, Claude Desktop, and other MCP clients.
 *
 * Usage:
 *   npx @fathippo/mcp-server
 *
 * Environment:
 *   FATHIPPO_API_KEY - Your FatHippo API key (required)
 *   FATHIPPO_BASE_URL - API base URL (optional, defaults to https://fathippo.com/api)
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
const API_KEY = process.env.FATHIPPO_API_KEY;
const BASE_URL = process.env.FATHIPPO_BASE_URL || "https://fathippo.com/api";
if (!API_KEY) {
    console.error("Error: FATHIPPO_API_KEY environment variable is required");
    console.error("Get your API key at https://fathippo.com");
    process.exit(1);
}
// Tool definitions
const TOOLS = [
    {
        name: "remember",
        description: "Store a memory in FatHippo. Use this to save important information, decisions, preferences, or context that should persist across sessions.",
        inputSchema: {
            type: "object",
            properties: {
                text: {
                    type: "string",
                    description: "The content to remember",
                },
                title: {
                    type: "string",
                    description: "Optional title for the memory",
                },
            },
            required: ["text"],
        },
    },
    {
        name: "recall",
        description: "Get relevant context from FatHippo for a given message. Returns memories that are semantically related to the input.",
        inputSchema: {
            type: "object",
            properties: {
                message: {
                    type: "string",
                    description: "The message to find relevant context for",
                },
            },
            required: ["message"],
        },
    },
    {
        name: "search",
        description: "Search memories in FatHippo. Returns memories matching the query.",
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search query",
                },
                limit: {
                    type: "number",
                    description: "Maximum number of results (default: 10)",
                },
            },
            required: ["query"],
        },
    },
];
// API client
async function apiRequest(path, body) {
    const response = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const error = await response.text().catch(() => "Unknown error");
        throw new Error(`FatHippo API error: ${response.status} - ${error}`);
    }
    return response.json();
}
// Tool handlers
async function handleRemember(args) {
    const result = await apiRequest("/v1/simple/remember", {
        text: args.text,
        title: args.title,
    });
    return `Memory stored (id: ${result.id})`;
}
async function handleRecall(args) {
    const result = await apiRequest("/v1/simple/context", {
        message: args.message,
    });
    if (!result.memories?.length) {
        return "No relevant memories found.";
    }
    const formatted = result.memories
        .map((m, i) => `${i + 1}. ${m.title || "Memory"}\n   ${m.content}`)
        .join("\n\n");
    return `Found ${result.memories.length} relevant memories:\n\n${formatted}`;
}
async function handleSearch(args) {
    const result = await apiRequest("/v1/search", {
        query: args.query,
        limit: args.limit || 10,
    });
    if (!result.results?.length) {
        return "No memories found matching your query.";
    }
    const formatted = result.results
        .map((r, i) => `${i + 1}. [${Math.round(r.score * 100)}%] ${r.memory.title || "Memory"}\n   ${r.memory.content}`)
        .join("\n\n");
    return `Found ${result.results.length} memories:\n\n${formatted}`;
}
// Create and run server
async function main() {
    const server = new Server({
        name: "fathippo",
        version: "0.1.0",
    }, {
        capabilities: {
            tools: {},
        },
    });
    // List tools handler
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: TOOLS,
    }));
    // Call tool handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            let result;
            switch (name) {
                case "remember":
                    result = await handleRemember(args);
                    break;
                case "recall":
                    result = await handleRecall(args);
                    break;
                case "search":
                    result = await handleSearch(args);
                    break;
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
            return {
                content: [{ type: "text", text: result }],
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return {
                content: [{ type: "text", text: `Error: ${message}` }],
                isError: true,
            };
        }
    });
    // Connect via stdio
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("FatHippo MCP server running");
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map