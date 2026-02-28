/**
 * Engrm MCP Server - Zero-Knowledge Memory for AI Agents
 *
 * Privacy guarantees:
 * - Embeddings generated locally (queries never leave device)
 * - Content encrypted client-side (server only sees ciphertext)
 * - Server cannot read your memories or know what you search for
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { embedLocal, initEmbeddings } from "./embeddings.js";
import { encryptLocal, decryptLocal, getVaultPassword } from "./crypto.js";
import { storeZkMemory, searchByVector, listMemories, deleteMemory } from "./api.js";
const TOOLS = [
    {
        name: "memry_store",
        description: "Store a memory for later recall. Use for important facts, preferences, decisions, or anything worth remembering. Memories are auto-isolated by chat/namespace. Identity memories ('I am', 'I live in') are stored globally and never auto-deleted. Regular memories decay over time if not accessed - frequently used memories stay, forgotten ones are eventually archived/deleted.",
        inputSchema: {
            type: "object",
            properties: {
                content: {
                    type: "string",
                    description: "The content to remember",
                },
                title: {
                    type: "string",
                    description: "Short title/summary (optional, auto-generated if omitted)",
                },
                importance: {
                    type: "number",
                    description: "Importance 1-10 (default 5)",
                },
                tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Tags for categorization",
                },
                namespace: {
                    type: "string",
                    description: "Override auto-namespace (optional, defaults to current chat context)",
                },
            },
            required: ["content"],
        },
    },
    {
        name: "memry_search",
        description: "Search memories semantically. Use to recall relevant information before responding. Searches current chat + global identity by default. Memories that are frequently searched stay active; unused memories gradually archive. The system self-maintains - no manual cleanup needed.",
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "What to search for",
                },
                limit: {
                    type: "number",
                    description: "Max results (default 5)",
                },
                namespace: {
                    type: "string",
                    description: "Override auto-namespace (optional, defaults to current chat context)",
                },
                global: {
                    type: "boolean",
                    description: "Search across ALL namespaces (ignores namespace filter)",
                },
            },
            required: ["query"],
        },
    },
    {
        name: "memry_context",
        description: "Get relevant context for the current conversation. Call this before responding to complex questions.",
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Current topic/question to get context for",
                },
                maxResults: {
                    type: "number",
                    description: "Max memories to include (default 5)",
                },
                global: {
                    type: "boolean",
                    description: "Search across ALL namespaces (default: current chat only)",
                },
            },
            required: ["query"],
        },
    },
    {
        name: "memry_list",
        description: "List recent memories in current namespace",
        inputSchema: {
            type: "object",
            properties: {
                limit: {
                    type: "number",
                    description: "Max results (default 10)",
                },
                namespace: {
                    type: "string",
                    description: "Override auto-namespace (optional)",
                },
            },
        },
    },
    {
        name: "memry_delete",
        description: "Delete a memory by ID",
        inputSchema: {
            type: "object",
            properties: {
                id: {
                    type: "string",
                    description: "Memory ID to delete",
                },
            },
            required: ["id"],
        },
    },
];
async function handleStore(params) {
    const vaultPassword = getVaultPassword();
    if (!vaultPassword) {
        return "Error: ENGRM_VAULT_PASSWORD not set. Cannot encrypt memories.";
    }
    const title = params.title || params.content.slice(0, 100);
    // Encrypt locally - server never sees plaintext
    const encryptedTitle = JSON.stringify(encryptLocal(title, vaultPassword));
    const encryptedContent = JSON.stringify(encryptLocal(params.content, vaultPassword));
    // Generate embedding locally - query text never leaves device
    const vector = await embedLocal(params.content);
    const result = await storeZkMemory({
        encryptedTitle,
        encryptedContent,
        vector,
        metadata: {
            importance: params.importance || 5,
            tags: params.tags || [],
        },
        namespace: params.namespace, // Will use env auto-namespace if undefined
    });
    return `✓ Stored memory: ${result.id}`;
}
async function handleSearch(params) {
    const vaultPassword = getVaultPassword();
    if (!vaultPassword) {
        return "Error: ENGRM_VAULT_PASSWORD not set. Cannot decrypt results.";
    }
    // Generate embedding locally - search query never leaves device
    const vector = await embedLocal(params.query);
    // If global=true, don't pass namespace (search all)
    const namespace = params.global ? undefined : params.namespace;
    const { results } = await searchByVector({
        vector,
        topK: params.limit || 5,
        namespace,
    });
    if (results.length === 0) {
        return "No relevant memories found.";
    }
    // Decrypt results locally
    const decrypted = results.map((r, i) => {
        try {
            const title = decryptLocal(JSON.parse(r.encryptedTitle), vaultPassword);
            const content = decryptLocal(JSON.parse(r.encryptedContent), vaultPassword);
            return `[${i + 1}] (${(r.score * 100).toFixed(0)}% match) ${title}\n${content}`;
        }
        catch {
            return `[${i + 1}] (${(r.score * 100).toFixed(0)}% match) [Decryption failed]`;
        }
    });
    return decrypted.join("\n\n");
}
async function handleContext(params) {
    const result = await handleSearch({
        query: params.query,
        limit: params.maxResults || 5,
        global: params.global,
    });
    if (result.startsWith("No relevant") || result.startsWith("Error:")) {
        return result;
    }
    return `Relevant memories for context:\n\n${result}`;
}
async function handleList(params) {
    const vaultPassword = getVaultPassword();
    if (!vaultPassword) {
        return "Error: ENGRM_VAULT_PASSWORD not set. Cannot decrypt memories.";
    }
    const { memories } = await listMemories({
        limit: params.limit || 10,
        namespace: params.namespace,
    });
    if (memories.length === 0) {
        return "No memories found.";
    }
    const decrypted = memories.map((m, i) => {
        try {
            const title = decryptLocal(JSON.parse(m.encryptedTitle), vaultPassword);
            return `[${i + 1}] ${m.id}: ${title}`;
        }
        catch {
            return `[${i + 1}] ${m.id}: [Decryption failed]`;
        }
    });
    return decrypted.join("\n");
}
async function handleDelete(params) {
    await deleteMemory(params.id);
    return `✓ Deleted memory: ${params.id}`;
}
export async function createServer() {
    // Pre-load embedding model
    await initEmbeddings();
    const server = new Server({
        name: "memry-mcp",
        version: "0.1.0",
    }, {
        capabilities: {
            tools: {},
        },
    });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: TOOLS,
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            let result;
            switch (name) {
                case "memry_store":
                    result = await handleStore(args);
                    break;
                case "memry_search":
                    result = await handleSearch(args);
                    break;
                case "memry_context":
                    result = await handleContext(args);
                    break;
                case "memry_list":
                    result = await handleList(args);
                    break;
                case "memry_delete":
                    result = await handleDelete(args);
                    break;
                default:
                    result = `Unknown tool: ${name}`;
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
    return server;
}
export async function runServer() {
    const server = await createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[memry-mcp] Server running");
}
