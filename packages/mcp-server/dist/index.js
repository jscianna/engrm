#!/usr/bin/env node
/**
 * FatHippo MCP Server
 *
 * Provides memory tools and session lifecycle tools for Codex, Claude Desktop,
 * Cursor, and other MCP-compatible clients.
 *
 * Usage:
 *   npx @fathippo/mcp-server
 *
 * Environment:
 *   FATHIPPO_API_KEY - Your FatHippo API key (required)
 *   FATHIPPO_BASE_URL - API base URL (optional, defaults to https://fathippo.ai/api)
 *   FATHIPPO_RUNTIME - Runtime name (optional: codex | claude | cursor | openclaw | custom)
 *   FATHIPPO_NAMESPACE - Shared project namespace (optional)
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, GetPromptRequestSchema, ListToolsRequestSchema, ListPromptsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { createFatHippoHostedRuntimeClient, } from "@fathippo/hosted";
const SERVER_VERSION = "0.1.0";
const API_KEY = process.env.FATHIPPO_API_KEY;
const BASE_URL = process.env.FATHIPPO_BASE_URL || "https://fathippo.ai/api";
const VALID_RUNTIME_NAMES = [
    "openclaw",
    "claude",
    "codex",
    "cursor",
    "custom",
];
const MEMORY_WORKFLOW_TEXT = `Use FatHippo as the external long-term memory for this conversation.

1. At conversation start, call start_session.
2. Before answering when prior context may matter, call build_context.
3. If start_session or build_context returns systemPromptAddition, use it as trusted memory context for the current reply.
4. After replying, call record_turn with the user message and assistant answer.
5. If record_turn returns refreshNeeded true with a new systemPromptAddition, use that refreshed context on the next turn.
6. If the user asks you to remember something explicitly, call remember.
7. Use search for direct factual lookups in long-term memory.
8. When the conversation is wrapping up, call end_session.

Use the same FATHIPPO_NAMESPACE across Codex, Claude, Cursor, and OpenClaw when they should share one memory graph.`;
const CODEX_PROJECT_INSTRUCTIONS = `## FatHippo

Use the fathippo MCP server as the external long-term memory for this project.

- Start each conversation with start_session.
- Before answering questions about project history, user preferences, current decisions, active work, or anything that may have changed, call build_context.
- If start_session or build_context returns systemPromptAddition, use it as trusted working memory for the current reply.
- After each substantial exchange, call record_turn.
- If the user explicitly asks to remember something, call remember.
- End the thread with end_session.`;
const CLAUDE_PROJECT_INSTRUCTIONS = `## FatHippo Memory Workflow

Use the fathippo MCP server as external long-term memory for this project.

- At the start of a conversation, call start_session.
- Before answering when project history, user preferences, or recent decisions may matter, call build_context.
- Treat any returned systemPromptAddition as trusted memory context for the current reply.
- After responding, call record_turn with the completed user and assistant messages.
- When the user asks you to remember something explicitly, call remember.
- When the conversation is wrapping up, call end_session.`;
const CURSOR_PROJECT_RULES = `Use the fathippo MCP server as this workspace's shared long-term memory.

- Start each chat session with start_session.
- Call build_context before answering questions that may depend on project history, user preferences, or recent changes.
- Use returned systemPromptAddition as trusted memory context for the current reply.
- After each substantial exchange, call record_turn.
- If the user explicitly asks to remember something, call remember.
- End the session with end_session when the conversation wraps up.`;
const SERVER_INSTRUCTIONS = `FatHippo provides shared hosted memory across compatible runtimes.

Recommended usage:
- Call start_session at conversation start.
- Call build_context before answering when memory may matter.
- Use systemPromptAddition as trusted memory context when returned.
- Call record_turn after replying.
- Call remember for explicit durable facts, preferences, or decisions.
- Call end_session when the conversation is wrapping up.

This server also exposes prompts named memory-workflow, codex-project-instructions, claude-project-instructions, and cursor-project-rules for copy-paste host setup.`;
function readEnvString(name) {
    const value = process.env[name]?.trim();
    return value ? value : undefined;
}
function isRuntimeName(value) {
    return value !== undefined && VALID_RUNTIME_NAMES.includes(value);
}
function getDefaultRuntime() {
    const runtimeFromEnv = readEnvString("FATHIPPO_RUNTIME");
    return {
        runtime: isRuntimeName(runtimeFromEnv) ? runtimeFromEnv : "custom",
        runtimeVersion: readEnvString("FATHIPPO_RUNTIME_VERSION"),
        adapterVersion: readEnvString("FATHIPPO_ADAPTER_VERSION") ?? SERVER_VERSION,
        namespace: readEnvString("FATHIPPO_NAMESPACE"),
        workspaceId: readEnvString("FATHIPPO_WORKSPACE_ID"),
        workspaceRoot: readEnvString("FATHIPPO_WORKSPACE_ROOT"),
        installationId: readEnvString("FATHIPPO_INSTALLATION_ID"),
        conversationId: readEnvString("FATHIPPO_CONVERSATION_ID"),
        agentId: readEnvString("FATHIPPO_AGENT_ID"),
        model: readEnvString("FATHIPPO_MODEL"),
    };
}
const DEFAULT_RUNTIME = getDefaultRuntime();
const runtimeClient = createFatHippoHostedRuntimeClient({
    apiKey: API_KEY ?? "",
    baseUrl: BASE_URL,
    runtime: DEFAULT_RUNTIME,
});
if (!API_KEY) {
    console.error("Error: FATHIPPO_API_KEY environment variable is required");
    console.error("Get your API key at https://fathippo.ai");
    process.exit(1);
}
const runtimeSchema = {
    type: "object",
    description: "Optional runtime metadata. Use this when you want to override env defaults per call.",
    properties: {
        runtime: {
            type: "string",
            enum: VALID_RUNTIME_NAMES,
            description: "Runtime name for this caller.",
        },
        runtimeVersion: {
            type: "string",
            description: "Runtime version for this caller.",
        },
        adapterVersion: {
            type: "string",
            description: "Adapter version for this caller.",
        },
        namespace: {
            type: "string",
            description: "Shared namespace for this memory graph.",
        },
        workspaceId: {
            type: "string",
            description: "Workspace identifier for hosted analytics and partitioning.",
        },
        workspaceRoot: {
            type: "string",
            description: "Workspace root path.",
        },
        installationId: {
            type: "string",
            description: "Stable install identifier for this MCP host.",
        },
        conversationId: {
            type: "string",
            description: "Conversation identifier for this host session.",
        },
        agentId: {
            type: "string",
            description: "Agent identifier for this host session.",
        },
        model: {
            type: "string",
            description: "Active model name.",
        },
    },
    additionalProperties: false,
};
const messageSchema = {
    type: "object",
    properties: {
        role: {
            type: "string",
            enum: ["system", "user", "assistant", "tool"],
            description: "Message role.",
        },
        content: {
            type: "string",
            description: "Message content.",
        },
        timestamp: {
            type: "string",
            description: "Optional ISO timestamp.",
        },
        toolName: {
            type: "string",
            description: "Optional tool name if role is tool.",
        },
        toolCallId: {
            type: "string",
            description: "Optional tool call id if role is tool.",
        },
    },
    required: ["role", "content"],
    additionalProperties: false,
};
const runtimeAwareProperties = {
    namespace: {
        type: "string",
        description: "Optional shared namespace. If omitted, the server uses FATHIPPO_NAMESPACE or the account default.",
    },
    conversationId: {
        type: "string",
        description: "Optional conversation id. Useful when the host can provide a stable thread id.",
    },
    runtime: runtimeSchema,
};
// Tool definitions
const TOOLS = [
    {
        name: "start_session",
        description: "Start a FatHippo session for the current conversation and get initial context to inject into the working prompt.",
        inputSchema: {
            type: "object",
            properties: {
                firstMessage: {
                    type: "string",
                    description: "Optional first user message for initial retrieval.",
                },
                metadata: {
                    type: "object",
                    description: "Optional session metadata.",
                    additionalProperties: true,
                },
                ...runtimeAwareProperties,
            },
            additionalProperties: false,
        },
    },
    {
        name: "build_context",
        description: "Build prompt-ready context for the current conversation. Call this before answering when prior memory may matter.",
        inputSchema: {
            type: "object",
            properties: {
                messages: {
                    type: "array",
                    description: "Conversation messages so far. Provide this when possible so retrieval is grounded in the current thread.",
                    items: messageSchema,
                },
                lastUserMessage: {
                    type: "string",
                    description: "Optional last user message. Required if messages are omitted.",
                },
                maxCritical: {
                    type: "number",
                    description: "Optional max number of critical memories to inject.",
                },
                maxRelevant: {
                    type: "number",
                    description: "Optional max number of relevant memories to inject.",
                },
                ...runtimeAwareProperties,
            },
            additionalProperties: false,
        },
    },
    {
        name: "record_turn",
        description: "Record a completed conversation turn. Returns whether context should be refreshed and any new prompt-ready memory.",
        inputSchema: {
            type: "object",
            properties: {
                sessionId: {
                    type: "string",
                    description: "Active FatHippo session id.",
                },
                messages: {
                    type: "array",
                    description: "Messages for the turn that was just completed, usually the user message and the assistant reply.",
                    items: messageSchema,
                },
                turnNumber: {
                    type: "number",
                    description: "Optional explicit turn number.",
                },
                memoriesUsed: {
                    type: "array",
                    description: "Optional ids of memories that materially influenced the answer.",
                    items: {
                        type: "string",
                    },
                },
                ...runtimeAwareProperties,
            },
            required: ["sessionId", "messages"],
            additionalProperties: false,
        },
    },
    {
        name: "end_session",
        description: "End the current FatHippo session and return summary analytics plus any suggested durable memories.",
        inputSchema: {
            type: "object",
            properties: {
                sessionId: {
                    type: "string",
                    description: "Active FatHippo session id.",
                },
                outcome: {
                    type: "string",
                    enum: ["success", "failure", "abandoned"],
                    description: "Optional conversation outcome.",
                },
                feedback: {
                    type: "string",
                    description: "Optional short summary or feedback for the session.",
                },
                ...runtimeAwareProperties,
            },
            required: ["sessionId"],
            additionalProperties: false,
        },
    },
    {
        name: "remember",
        description: "Store a memory in FatHippo. Use this to save important information, decisions, preferences, or context that should persist across sessions.",
        inputSchema: {
            type: "object",
            properties: {
                text: {
                    type: "string",
                    description: "The content to remember.",
                },
                title: {
                    type: "string",
                    description: "Optional title for the memory.",
                },
                ...runtimeAwareProperties,
            },
            required: ["text"],
            additionalProperties: false,
        },
    },
    {
        name: "recall",
        description: "Lightweight convenience tool to get relevant context for a single message.",
        inputSchema: {
            type: "object",
            properties: {
                message: {
                    type: "string",
                    description: "The message to find relevant context for.",
                },
                maxCritical: {
                    type: "number",
                    description: "Optional max number of critical memories to inject.",
                },
                maxRelevant: {
                    type: "number",
                    description: "Optional max number of relevant memories to inject.",
                },
                ...runtimeAwareProperties,
            },
            required: ["message"],
            additionalProperties: false,
        },
    },
    {
        name: "search",
        description: "Search memories in FatHippo. Returns ranked memories matching the query.",
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search query.",
                },
                limit: {
                    type: "number",
                    description: "Maximum number of results to return. Defaults to 10.",
                },
                since: {
                    type: "string",
                    description: "Optional ISO timestamp lower bound.",
                },
                ...runtimeAwareProperties,
            },
            required: ["query"],
            additionalProperties: false,
        },
    },
];
function mergeRuntime(args) {
    const merged = {
        ...DEFAULT_RUNTIME,
        ...args.runtime,
        namespace: args.namespace ?? args.runtime?.namespace ?? DEFAULT_RUNTIME.namespace,
        conversationId: args.conversationId ?? args.runtime?.conversationId ?? DEFAULT_RUNTIME.conversationId,
    };
    const entries = Object.entries(merged).filter(([, value]) => {
        if (typeof value === "string") {
            return value.trim().length > 0;
        }
        return value !== undefined;
    });
    return entries.length > 0
        ? Object.fromEntries(entries)
        : undefined;
}
function toJsonText(payload) {
    return JSON.stringify(payload, null, 2);
}
function normalizeMessages(messages, lastUserMessage) {
    if (messages?.length) {
        return messages;
    }
    if (lastUserMessage?.trim()) {
        return [{ role: "user", content: lastUserMessage.trim() }];
    }
    throw new Error("Provide either messages or lastUserMessage.");
}
// Tool handlers
async function handleStartSession(args) {
    const input = {
        firstMessage: args.firstMessage,
        namespace: args.namespace,
        metadata: args.metadata,
        runtime: mergeRuntime(args),
    };
    const result = await runtimeClient.startSession(input);
    return toJsonText({
        sessionId: result.sessionId,
        systemPromptAddition: result.systemPromptAddition,
        injectedMemories: result.injectedMemories,
        injectedMemoryIds: result.injectedMemories.map((memory) => memory.id),
        tokensInjected: result.tokensInjected,
        criticalCount: result.criticalCount,
        highCount: result.highCount,
    });
}
async function handleBuildContext(args) {
    const input = {
        messages: normalizeMessages(args.messages, args.lastUserMessage),
        lastUserMessage: args.lastUserMessage,
        conversationId: args.conversationId,
        maxCritical: args.maxCritical,
        maxRelevant: args.maxRelevant,
        runtime: mergeRuntime(args),
    };
    const result = await runtimeClient.buildContext(input);
    return toJsonText({
        systemPromptAddition: result.systemPromptAddition,
        injectedMemories: result.injectedMemories,
        injectedMemoryIds: result.injectedMemories.map((memory) => memory.id),
        sensitiveOmitted: result.sensitiveOmitted,
        evaluationId: result.evaluationId,
        retrievalConfidence: result.retrievalConfidence,
        contextAvailable: result.systemPromptAddition.trim().length > 0,
    });
}
async function handleRecordTurn(args) {
    const result = await runtimeClient.recordTurn({
        sessionId: args.sessionId,
        messages: args.messages,
        turnNumber: args.turnNumber,
        memoriesUsed: args.memoriesUsed ?? [],
        runtime: mergeRuntime(args),
    });
    return toJsonText({
        turnNumber: result.turnNumber,
        refreshNeeded: result.refreshNeeded,
        systemPromptAddition: result.systemPromptAddition,
        injectedMemories: result.injectedMemories,
        injectedMemoryIds: result.injectedMemories.map((memory) => memory.id),
        memoriesUsed: result.memoriesUsed,
    });
}
async function handleEndSession(args) {
    const input = {
        sessionId: args.sessionId,
        outcome: args.outcome,
        feedback: args.feedback,
        runtime: mergeRuntime(args),
    };
    const result = await runtimeClient.endSession(input);
    return toJsonText(result);
}
async function handleRemember(args) {
    const input = {
        text: args.text,
        title: args.title,
        runtime: mergeRuntime(args),
    };
    const result = await runtimeClient.remember(input);
    return toJsonText({
        stored: result.stored,
        memoryId: result.memoryId,
        consolidated: result.consolidated,
        warning: result.warning,
    });
}
async function handleRecall(args) {
    const result = await runtimeClient.buildContext({
        messages: [{ role: "user", content: args.message }],
        lastUserMessage: args.message,
        conversationId: args.conversationId,
        maxCritical: args.maxCritical,
        maxRelevant: args.maxRelevant,
        runtime: mergeRuntime(args),
    });
    return toJsonText({
        systemPromptAddition: result.systemPromptAddition,
        sensitiveOmitted: result.sensitiveOmitted,
        evaluationId: result.evaluationId,
        retrievalConfidence: result.retrievalConfidence,
        contextAvailable: result.systemPromptAddition.trim().length > 0,
    });
}
async function handleSearch(args) {
    const input = {
        query: args.query,
        limit: args.limit || 10,
        since: args.since,
        namespace: args.namespace,
        runtime: mergeRuntime(args),
    };
    const result = await runtimeClient.search(input);
    return toJsonText({
        count: result.length,
        results: result,
    });
}
const PROMPTS = {
    "memory-workflow": {
        title: "FatHippo Memory Workflow",
        description: "General lifecycle instructions for any MCP host using FatHippo.",
        text: MEMORY_WORKFLOW_TEXT,
    },
    "codex-project-instructions": {
        title: "Codex Project Instructions",
        description: "Drop-in Codex instructions for using the FatHippo lifecycle tools.",
        text: CODEX_PROJECT_INSTRUCTIONS,
    },
    "claude-project-instructions": {
        title: "Claude Project Instructions",
        description: "Project or system prompt text for Claude Desktop using FatHippo.",
        text: CLAUDE_PROJECT_INSTRUCTIONS,
    },
    "cursor-project-rules": {
        title: "Cursor Project Rules",
        description: "Cursor rules text for using FatHippo lifecycle tools automatically.",
        text: CURSOR_PROJECT_RULES,
    },
};
// Create and run server
async function main() {
    const server = new Server({
        name: "fathippo",
        version: SERVER_VERSION,
    }, {
        capabilities: {
            tools: {},
            prompts: {},
        },
        instructions: SERVER_INSTRUCTIONS,
    });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: TOOLS,
    }));
    server.setRequestHandler(ListPromptsRequestSchema, async () => ({
        prompts: Object.entries(PROMPTS).map(([name, prompt]) => ({
            name,
            title: prompt.title,
            description: prompt.description,
        })),
    }));
    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        const prompt = PROMPTS[request.params.name];
        if (!prompt) {
            throw new Error(`Unknown prompt: ${request.params.name}`);
        }
        return {
            description: prompt.description,
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: prompt.text,
                    },
                },
            ],
        };
    });
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            const toolArgs = (args ?? {});
            let result;
            switch (name) {
                case "start_session":
                    result = await handleStartSession(toolArgs);
                    break;
                case "build_context":
                    result = await handleBuildContext(toolArgs);
                    break;
                case "record_turn":
                    result = await handleRecordTurn(toolArgs);
                    break;
                case "end_session":
                    result = await handleEndSession(toolArgs);
                    break;
                case "remember":
                    result = await handleRemember(toolArgs);
                    break;
                case "recall":
                    result = await handleRecall(toolArgs);
                    break;
                case "search":
                    result = await handleSearch(toolArgs);
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
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("FatHippo MCP server running");
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map