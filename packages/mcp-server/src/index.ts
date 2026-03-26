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

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  createFatHippoHostedRuntimeClient,
  type FatHippoBuildContextInput,
  type FatHippoConversationMessage,
  type FatHippoHostedRuntimeClientContract,
  type FatHippoRememberInput,
  type FatHippoRuntimeMetadata,
  type FatHippoRuntimeName,
  type FatHippoSearchInput,
  type FatHippoSessionEndInput,
  type FatHippoSessionStartInput,
} from "@fathippo/hosted";

const SERVER_VERSION = "0.1.0";
const BASE_URL = process.env.FATHIPPO_BASE_URL || "https://fathippo.ai/api";

function resolveApiKey(): string | undefined {
  // 1. Environment variable (highest priority)
  const envKey = process.env.FATHIPPO_API_KEY?.trim();
  if (envKey) return envKey;

  // 2. Config file fallback
  try {
    const configPath = path.join(os.homedir(), ".fathippo", "config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return config.apiKey?.trim() || undefined;
  } catch {
    return undefined;
  }
}

const API_KEY = resolveApiKey();
const VALID_RUNTIME_NAMES: FatHippoRuntimeName[] = [
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

For coding tasks:
- Before starting a coding task, call get_cognitive_context to check for relevant patterns and past solutions.
- After solving a coding problem, call record_trace to capture what was done.
- If FatHippo suggested a pattern that helped (or didn't), call submit_feedback.

Use the same FATHIPPO_NAMESPACE across Codex, Claude, Cursor, and OpenClaw when they should share one memory graph.`;
const CODEX_PROJECT_INSTRUCTIONS = `## FatHippo

Use the fathippo MCP server as the external long-term memory for this project.

- Start each conversation with start_session.
- Before answering questions about project history, user preferences, current decisions, active work, or anything that may have changed, call build_context.
- If start_session or build_context returns systemPromptAddition, use it as trusted working memory for the current reply.
- After each substantial exchange, call record_turn.
- If the user explicitly asks to remember something, call remember.
- End the thread with end_session.
- Before starting a coding task, call get_cognitive_context to check for relevant patterns and past solutions.
- After solving a coding problem, call record_trace to capture what was done.
- If FatHippo suggested a pattern that helped (or didn't), call submit_feedback.`;
const CLAUDE_PROJECT_INSTRUCTIONS = `## FatHippo Memory Workflow

Use the fathippo MCP server as external long-term memory for this project.

- At the start of a conversation, call start_session.
- Before answering when project history, user preferences, or recent decisions may matter, call build_context.
- Treat any returned systemPromptAddition as trusted memory context for the current reply.
- After responding, call record_turn with the completed user and assistant messages.
- When the user asks you to remember something explicitly, call remember.
- When the conversation is wrapping up, call end_session.
- Before starting a coding task, call get_cognitive_context to check for relevant patterns and past solutions.
- After solving a coding problem, call record_trace to capture what was done.
- If FatHippo suggested a pattern that helped (or didn't), call submit_feedback.`;
const CURSOR_PROJECT_RULES = `Use the fathippo MCP server as this workspace's shared long-term memory.

- Start each chat session with start_session.
- Call build_context before answering questions that may depend on project history, user preferences, or recent changes.
- Use returned systemPromptAddition as trusted memory context for the current reply.
- After each substantial exchange, call record_turn.
- If the user explicitly asks to remember something, call remember.
- End the session with end_session when the conversation wraps up.
- Before starting a coding task, call get_cognitive_context to check for relevant patterns and past solutions.
- After solving a coding problem, call record_trace to capture what was done.
- If FatHippo suggested a pattern that helped (or didn't), call submit_feedback.`;
const SERVER_INSTRUCTIONS = `FatHippo provides shared hosted memory across compatible runtimes.

Recommended usage:
- Call start_session at conversation start.
- Call build_context before answering when memory may matter.
- Use systemPromptAddition as trusted memory context when returned.
- Call record_turn after replying.
- Call remember for explicit durable facts, preferences, or decisions.
- Call end_session when the conversation is wrapping up.

Cognitive tools for coding agents:
- Call get_cognitive_context before starting a coding task to check for relevant patterns and past solutions.
- Call record_trace after solving a coding problem to feed the pattern-extraction pipeline.
- Call submit_feedback to report whether a suggested pattern actually helped.

This server also exposes prompts named memory-workflow, codex-project-instructions, claude-project-instructions, and cursor-project-rules for copy-paste host setup.`;

function readEnvString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function isRuntimeName(value: string | undefined): value is FatHippoRuntimeName {
  return value !== undefined && VALID_RUNTIME_NAMES.includes(value as FatHippoRuntimeName);
}

function getDefaultRuntime(): FatHippoRuntimeMetadata {
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
const runtimeClient: FatHippoHostedRuntimeClientContract =
  createFatHippoHostedRuntimeClient({
    apiKey: API_KEY ?? "",
    baseUrl: BASE_URL,
    runtime: DEFAULT_RUNTIME,
  });

if (!API_KEY) {
  console.error("Error: FATHIPPO_API_KEY environment variable is required");
  console.error("Get your API key at https://fathippo.ai");
  process.exit(1);
}

type RuntimeAwareArgs = {
  namespace?: string;
  conversationId?: string;
  runtime?: Partial<FatHippoRuntimeMetadata>;
};

type RememberArgs = RuntimeAwareArgs & {
  text: string;
  title?: string;
};

type RecallArgs = RuntimeAwareArgs & {
  message: string;
  maxCritical?: number;
  maxRelevant?: number;
};

type SearchArgs = RuntimeAwareArgs & {
  query: string;
  limit?: number;
  since?: string;
};

type StartSessionArgs = RuntimeAwareArgs & {
  firstMessage?: string;
  metadata?: Record<string, unknown>;
};

type BuildContextArgs = RuntimeAwareArgs & {
  messages?: FatHippoConversationMessage[];
  lastUserMessage?: string;
  maxCritical?: number;
  maxRelevant?: number;
};

type RecordTurnArgs = RuntimeAwareArgs & {
  sessionId: string;
  messages: FatHippoConversationMessage[];
  turnNumber?: number;
  memoriesUsed?: string[];
};

type EndSessionArgs = RuntimeAwareArgs & {
  sessionId: string;
  outcome?: "success" | "failure" | "abandoned";
  feedback?: string;
};

type RecordTraceArgs = RuntimeAwareArgs & {
  sessionId?: string;
  type?: string;
  problem: string;
  reasoning?: string;
  solution?: string;
  outcome: "success" | "partial" | "failed";
  technologies?: string[];
  errorMessages?: string[];
  filesModified?: string[];
  toolsUsed?: string[];
};

type GetCognitiveContextArgs = RuntimeAwareArgs & {
  problem: string;
  technologies?: string[];
  sessionId?: string;
  limit?: number;
};

type SubmitFeedbackArgs = RuntimeAwareArgs & {
  patternId: string;
  traceId: string;
  outcome: "success" | "failure";
  notes?: string;
};

type GetSkillDetailArgs = RuntimeAwareArgs & {
  skillId: string;
  section?: "full" | "procedure" | "pitfalls" | "verification" | "whenToUse";
};

type CreateSkillArgs = RuntimeAwareArgs & {
  sessionId?: string;
  name: string;
  description: string;
  whenToUse?: string;
  procedure: string[];
  pitfalls?: string[];
  verification?: string;
  technologies?: string[];
  category?: string;
};

type GetWriteLedgerArgs = RuntimeAwareArgs & {
  window?: "1h" | "24h" | "7d";
  reasonCode?: string;
  mcpOnly?: boolean;
  limit?: number;
};

// Session-scoped rate limiting for create_skill
const session_skill_counts = new Map<string, number>();
const MAX_SKILLS_PER_SESSION = 3;

function scanSkillContent(skill: CreateSkillArgs): string | null {
  const all_text = [
    skill.name,
    skill.description,
    skill.whenToUse ?? '',
    ...(skill.procedure ?? []),
    ...(skill.pitfalls ?? []),
    skill.verification ?? '',
  ].join(' ');

  if (/curl\s+.*\|/.test(all_text)) return "Suspicious: pipe to curl detected";
  if (/wget\s+.*-O/.test(all_text)) return "Suspicious: wget output redirect detected";
  if (/https?:\/\//i.test(all_text)) {
    const urls = all_text.match(/https?:\/\/[^\s"')]+/gi) ?? [];
    const safe_domains = ['github.com', 'stackoverflow.com', 'docs.', 'developer.mozilla.org', 'npmjs.com', 'pypi.org', 'fathippo.ai'];
    const suspicious = urls.filter(u => !safe_domains.some(d => u.includes(d)));
    if (suspicious.length > 0) return `Suspicious URLs: ${suspicious.join(', ')}`;
  }
  if (/(?:env|process\.env|os\.environ)\s*\[.*(?:key|token|secret|password)/i.test(all_text)) {
    return "Suspicious: environment variable access pattern";
  }
  if (/(?:eval|exec|Function)\s*\(/.test(all_text)) {
    return "Suspicious: code execution pattern";
  }
  if (/base64/i.test(all_text) && /decode/i.test(all_text)) {
    return "Suspicious: base64 decode pattern";
  }
  return null;
}

const runtimeSchema = {
  type: "object",
  description:
    "Optional runtime metadata. Use this when you want to override env defaults per call.",
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
} as const;

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
} as const;

const runtimeAwareProperties = {
  namespace: {
    type: "string",
    description:
      "Optional shared namespace. If omitted, the server uses FATHIPPO_NAMESPACE or the account default.",
  },
  conversationId: {
    type: "string",
    description:
      "Optional conversation id. Useful when the host can provide a stable thread id.",
  },
  runtime: runtimeSchema,
} as const;

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: "start_session",
    description:
      "Start a FatHippo session for the current conversation and get initial context to inject into the working prompt.",
    inputSchema: {
      type: "object" as const,
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
    description:
      "Build prompt-ready context for the current conversation. Call this before answering when prior memory may matter.",
    inputSchema: {
      type: "object" as const,
      properties: {
        messages: {
          type: "array",
          description:
            "Conversation messages so far. Provide this when possible so retrieval is grounded in the current thread.",
          items: messageSchema,
        },
        lastUserMessage: {
          type: "string",
          description:
            "Optional last user message. Required if messages are omitted.",
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
    description:
      "Record a completed conversation turn. Returns whether context should be refreshed and any new prompt-ready memory.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sessionId: {
          type: "string",
          description: "Active FatHippo session id.",
        },
        messages: {
          type: "array",
          description:
            "Messages for the turn that was just completed, usually the user message and the assistant reply.",
          items: messageSchema,
        },
        turnNumber: {
          type: "number",
          description: "Optional explicit turn number.",
        },
        memoriesUsed: {
          type: "array",
          description:
            "Optional ids of memories that materially influenced the answer.",
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
    description:
      "End the current FatHippo session and return summary analytics plus any suggested durable memories.",
    inputSchema: {
      type: "object" as const,
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
    description:
      "Store a memory in FatHippo. Use this to save important information, decisions, preferences, or context that should persist across sessions.",
    inputSchema: {
      type: "object" as const,
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
    description:
      "Lightweight convenience tool to get relevant context for a single message.",
    inputSchema: {
      type: "object" as const,
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
    description:
      "Search memories in FatHippo. Returns ranked memories matching the query.",
    inputSchema: {
      type: "object" as const,
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
  {
    name: "record_trace",
    description:
      "Record a coding trace — captures what problem was solved, how, and whether it worked. FatHippo uses these to extract patterns and synthesize reusable skills over time.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sessionId: {
          type: "string",
          description: "Active session id.",
        },
        type: {
          type: "string",
          description: "Trace type: coding_turn, debugging, refactoring, building.",
          default: "coding_turn",
        },
        problem: {
          type: "string",
          description: "What problem was being solved.",
        },
        reasoning: {
          type: "string",
          description: "How the problem was approached and what was tried.",
        },
        solution: {
          type: "string",
          description: "What ultimately fixed it (if successful).",
        },
        outcome: {
          type: "string",
          enum: ["success", "partial", "failed"],
          description: "Did it work?",
        },
        technologies: {
          type: "array",
          items: { type: "string" },
          description: "Technologies/frameworks involved.",
        },
        errorMessages: {
          type: "array",
          items: { type: "string" },
          description: "Error messages encountered.",
        },
        filesModified: {
          type: "array",
          items: { type: "string" },
          description: "Files that were changed.",
        },
        toolsUsed: {
          type: "array",
          items: { type: "string" },
          description: "Tools/commands used during the fix.",
        },
        ...runtimeAwareProperties,
      },
      required: ["problem", "outcome"],
      additionalProperties: false,
    },
  },
  {
    name: "get_cognitive_context",
    description:
      "Get relevant coding patterns, synthesized skills, and past traces for the problem you're working on. Call this when starting a coding task to see if FatHippo has learned solutions from similar past problems.",
    inputSchema: {
      type: "object" as const,
      properties: {
        problem: {
          type: "string",
          description: "Description of the current problem or task.",
        },
        technologies: {
          type: "array",
          items: { type: "string" },
          description: "Technologies/frameworks involved.",
        },
        sessionId: {
          type: "string",
          description: "Optional session id for application tracking.",
        },
        limit: {
          type: "number",
          description: "Max traces to return. Default 5.",
        },
        ...runtimeAwareProperties,
      },
      required: ["problem"],
      additionalProperties: false,
    },
  },
  {
    name: "get_skill_detail",
    description:
      "Load the full content of a FatHippo skill. Call when you see a relevant skill in context and want the full procedure, pitfalls, and verification.",
    inputSchema: {
      type: "object" as const,
      properties: {
        skillId: {
          type: "string",
          description: "ID of the skill.",
        },
        section: {
          type: "string",
          enum: ["full", "procedure", "pitfalls", "verification", "whenToUse"],
          description: "Load specific section. Default: full.",
        },
        ...runtimeAwareProperties,
      },
      required: ["skillId"],
      additionalProperties: false,
    },
  },
  {
    name: "create_skill",
    description:
      "Save a reusable skill from what you just learned. Call after solving complex problems (5+ steps), finding working paths through dead ends, or discovering non-trivial workflows. Skills are shared across all connected platforms.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Short name (e.g., 'Fix Turso connection pool exhaustion').",
        },
        description: {
          type: "string",
          description: "One-line description.",
        },
        whenToUse: {
          type: "string",
          description: "Trigger conditions.",
        },
        procedure: {
          type: "array",
          items: { type: "string" },
          description: "Steps that worked.",
        },
        pitfalls: {
          type: "array",
          items: { type: "string" },
          description: "What didn't work.",
        },
        verification: {
          type: "string",
          description: "How to verify it worked.",
        },
        technologies: {
          type: "array",
          items: { type: "string" },
          description: "Tech involved.",
        },
        category: {
          type: "string",
          description: "Category (debugging, deployment, database, etc.).",
        },
        ...runtimeAwareProperties,
      },
      required: ["name", "description", "procedure"],
      additionalProperties: false,
    },
  },
  {
    name: "submit_feedback",
    description:
      "Report whether a pattern or skill from FatHippo actually helped solve the problem. This feedback improves pattern confidence scores over time.",
    inputSchema: {
      type: "object" as const,
      properties: {
        patternId: {
          type: "string",
          description: "ID of the pattern to give feedback on.",
        },
        traceId: {
          type: "string",
          description: "ID of the trace this feedback relates to.",
        },
        outcome: {
          type: "string",
          enum: ["success", "failure"],
          description: "Did the pattern/skill help?",
        },
        notes: {
          type: "string",
          description: "Optional notes about what worked or didn't.",
        },
        ...runtimeAwareProperties,
      },
      required: ["patternId", "traceId", "outcome"],
      additionalProperties: false,
    },
  },
  {
    name: "get_write_ledger",
    description:
      "Query the memory write decision ledger. Shows what was accepted, rejected, merged, or updated — with reason codes and policy details. Useful for auditing and debugging memory writes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        window: {
          type: "string",
          enum: ["1h", "24h", "7d"],
          description: "Time window. Defaults to 24h.",
        },
        reasonCode: {
          type: "string",
          description: "Filter by reason code (e.g. 'stored', 'rejected_low_quality', 'rejected_secret').",
        },
        mcpOnly: {
          type: "boolean",
          description: "If true, only show writes that originated from an MCP runtime.",
        },
        limit: {
          type: "number",
          description: "Max entries to return. Default 50, max 200.",
        },
        ...runtimeAwareProperties,
      },
      additionalProperties: false,
    },
  },
];

function mergeRuntime(args: RuntimeAwareArgs): Partial<FatHippoRuntimeMetadata> | undefined {
  const merged: Partial<FatHippoRuntimeMetadata> = {
    ...DEFAULT_RUNTIME,
    ...args.runtime,
    namespace: args.namespace ?? args.runtime?.namespace ?? DEFAULT_RUNTIME.namespace,
    conversationId:
      args.conversationId ?? args.runtime?.conversationId ?? DEFAULT_RUNTIME.conversationId,
  };

  const entries = Object.entries(merged).filter(([, value]) => {
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    return value !== undefined;
  });

  return entries.length > 0
    ? (Object.fromEntries(entries) as Partial<FatHippoRuntimeMetadata>)
    : undefined;
}

function toJsonText(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

function normalizeMessages(
  messages: FatHippoConversationMessage[] | undefined,
  lastUserMessage: string | undefined,
): FatHippoConversationMessage[] {
  if (messages?.length) {
    return messages;
  }

  if (lastUserMessage?.trim()) {
    return [{ role: "user", content: lastUserMessage.trim() }];
  }

  throw new Error("Provide either messages or lastUserMessage.");
}

// Tool handlers
async function handleStartSession(args: StartSessionArgs): Promise<string> {
  const input: FatHippoSessionStartInput = {
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

async function handleBuildContext(args: BuildContextArgs): Promise<string> {
  const input: FatHippoBuildContextInput = {
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

async function handleRecordTurn(args: RecordTurnArgs): Promise<string> {
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

async function handleEndSession(args: EndSessionArgs): Promise<string> {
  const input: FatHippoSessionEndInput = {
    sessionId: args.sessionId,
    outcome: args.outcome,
    feedback: args.feedback,
    runtime: mergeRuntime(args),
  };
  const result = await runtimeClient.endSession(input);

  return toJsonText(result);
}

async function handleRemember(args: RememberArgs): Promise<string> {
  const input: FatHippoRememberInput = {
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
    audit: result.audit,
  });
}

async function handleRecall(args: RecallArgs): Promise<string> {
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

async function handleSearch(args: SearchArgs): Promise<string> {
  const input: FatHippoSearchInput = {
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

async function handleRecordTrace(args: RecordTraceArgs): Promise<string> {
  const runtime = mergeRuntime(args);
  const response = await fetch(`${BASE_URL}/v1/cognitive/traces`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionId: args.sessionId ?? runtime?.conversationId ?? `mcp_${Date.now()}`,
      type: args.type ?? "coding_turn",
      problem: args.problem,
      reasoning: args.reasoning ?? "",
      solution: args.solution,
      outcome: args.outcome,
      context: {
        technologies: args.technologies ?? [],
        errorMessages: args.errorMessages ?? [],
      },
      filesModified: args.filesModified ?? [],
      toolsUsed: args.toolsUsed ?? [],
      durationMs: 0,
      sanitized: true,
      sanitizedAt: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to record trace: ${response.status} ${text}`);
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    return toJsonText({ error: "Failed to parse response JSON from record_trace" });
  }
  return toJsonText(result);
}

async function handleGetCognitiveContext(args: GetCognitiveContextArgs): Promise<string> {
  const runtime = mergeRuntime(args);
  const response = await fetch(`${BASE_URL}/v1/cognitive/traces/relevant`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      problem: args.problem,
      sessionId: args.sessionId ?? runtime?.conversationId ?? `mcp_${Date.now()}`,
      endpoint: "mcp-server",
      limit: args.limit ?? 5,
      context: {
        technologies: args.technologies ?? [],
      },
      adaptivePolicy: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to get cognitive context: ${response.status} ${text}`);
  }

  let result: Record<string, unknown>;
  try {
    result = await response.json() as Record<string, unknown>;
  } catch {
    return toJsonText({ error: "Failed to parse response JSON from get_cognitive_context" });
  }

  // Format into a readable summary for the agent
  const parts: string[] = [];
  const traces = Array.isArray(result.traces) ? result.traces as Array<Record<string, unknown>> : [];
  const patterns = Array.isArray(result.patterns) ? result.patterns as Array<Record<string, unknown>> : [];
  const skills = Array.isArray(result.skills) ? result.skills as Array<Record<string, unknown>> : [];
  const workflow = (typeof result.workflow === "object" && result.workflow !== null)
    ? result.workflow as Record<string, unknown>
    : null;
  const workflow_steps = workflow && Array.isArray(workflow.steps) ? workflow.steps as string[] : [];

  if (traces.length > 0) {
    parts.push("## Past Similar Problems");
    for (const trace of traces) {
      const outcome = String(trace.outcome ?? "");
      const icon = outcome === "success" ? "✓" : outcome === "failed" ? "✗" : "~";
      const problem = String(trace.problem ?? "");
      const solution = trace.solution ? String(trace.solution) : "";
      parts.push(`- ${icon} ${problem}${solution ? ` → ${solution}` : ""}`);
    }
  }

  if (patterns.length > 0) {
    parts.push("\n## Learned Patterns");
    for (const pattern of patterns) {
      const confidence = Number(pattern.confidence ?? 0);
      parts.push(
        `- [${String(pattern.domain ?? "unknown")}] ${String(pattern.approach ?? "") } (${Math.round(confidence * 100)}% confidence)`,
      );
    }
  }

  if (skills.length > 0) {
    parts.push("\n## Synthesized Skills");
    for (const skill of skills) {
      const success_rate = Number(skill.successRate ?? 0);
      parts.push(`- ${String(skill.name ?? "skill")}: ${String(skill.description ?? "")} (${Math.round(success_rate * 100)}% success)`);
    }
  }

  if (workflow_steps.length > 0) {
    parts.push("\n## Recommended Workflow");
    for (const step of workflow_steps) {
      parts.push(`- ${step}`);
    }
  }

  return toJsonText({
    applicationId: result.applicationId,
    summary:
      parts.length > 0
        ? parts.join("\n")
        : "No relevant patterns or traces found yet. Record traces after solving problems to build up the knowledge base.",
    raw: {
      traceCount: traces.length,
      patternCount: patterns.length,
      skillCount: skills.length,
      hasWorkflow: !!workflow,
    },
  });
}

async function handleSubmitFeedback(args: SubmitFeedbackArgs): Promise<string> {
  const response = await fetch(`${BASE_URL}/v1/cognitive/patterns/feedback`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      patternId: args.patternId,
      traceId: args.traceId,
      outcome: args.outcome,
      notes: args.notes,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to submit feedback: ${response.status} ${text}`);
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    return toJsonText({ error: "Failed to parse response JSON from submit_feedback" });
  }
  return toJsonText(result);
}

async function handleGetSkillDetail(args: GetSkillDetailArgs): Promise<string> {
  const response = await fetch(`${BASE_URL}/v1/cognitive/skills/${encodeURIComponent(args.skillId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to get skill: ${response.status} ${text}`);
  }

  let result: Record<string, unknown>;
  try {
    result = await response.json() as Record<string, unknown>;
  } catch {
    return toJsonText({ error: "Failed to parse response JSON from get_skill_detail" });
  }
  const skill = result.skill as Record<string, unknown> | undefined;
  if (!skill) {
    throw new Error("Skill not found");
  }

  const section = args.section ?? "full";
  const content = (skill.content ?? {}) as Record<string, unknown>;
  const procedure = Array.isArray(content.procedure) ? content.procedure as string[] : [];
  const pitfalls = Array.isArray(content.commonPitfalls) ? content.commonPitfalls as string[] : [];

  if (section === "full") {
    const parts: string[] = [
      `# ${skill.name}`,
      `**Description:** ${skill.description}`,
      `**Success Rate:** ${Math.round(Number(skill.successRate ?? 0) * 100)}%`,
      `**Status:** ${skill.status}`,
    ];
    if (content.whenToUse) parts.push(`\n## When To Use\n${content.whenToUse}`);
    if (procedure.length) {
      parts.push(`\n## Procedure\n${procedure.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
    }
    if (pitfalls.length) {
      parts.push(`\n## Common Pitfalls\n${pitfalls.map((s: string) => `- ${s}`).join("\n")}`);
    }
    if (content.verification) parts.push(`\n## Verification\n${content.verification}`);
    return toJsonText({ skillId: skill.id, name: skill.name, content: parts.join("\n") });
  }

  // Return a specific section
  const sectionMap: Record<string, unknown> = {
    procedure: content.procedure,
    pitfalls: content.commonPitfalls,
    verification: content.verification,
    whenToUse: content.whenToUse,
  };
  return toJsonText({ skillId: skill.id, name: skill.name, section, content: sectionMap[section] ?? null });
}

async function handleCreateSkill(args: CreateSkillArgs): Promise<string> {
  // Rate limit
  const session_key = args.sessionId ?? args.conversationId ?? "default";
  const count = session_skill_counts.get(session_key) ?? 0;
  if (count >= MAX_SKILLS_PER_SESSION) {
    return toJsonText({ error: "Rate limit: max 3 skills per session. Existing skills can be improved via feedback instead." });
  }

  // Content scan
  const scan_result = scanSkillContent(args);
  if (scan_result) {
    return toJsonText({ error: `Skill rejected: ${scan_result}` });
  }

  const response = await fetch(`${BASE_URL}/v1/cognitive/skills`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: args.name,
      description: args.description,
      whenToUse: args.whenToUse,
      procedure: args.procedure,
      pitfalls: args.pitfalls,
      verification: args.verification,
      technologies: args.technologies,
      category: args.category ?? "agent-created",
      source: "agent-explicit",
      status: "pending_review",
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to create skill: ${response.status} ${text}`);
  }

  session_skill_counts.set(session_key, count + 1);
  let result: Record<string, unknown>;
  try {
    result = await response.json() as Record<string, unknown>;
  } catch {
    return toJsonText({ error: "Failed to parse response JSON from create_skill" });
  }
  return toJsonText({
    created: true,
    skillId: (result.skill as Record<string, unknown> | undefined)?.id,
    status: "pending_review",
    message: `Skill "${args.name}" saved in review status. It will be suggested across platforms once validated by successful usage.`,
  });
}

async function handleGetWriteLedger(args: GetWriteLedgerArgs): Promise<string> {
  const params = new URLSearchParams();
  params.set("window", args.window ?? "24h");
  if (args.reasonCode) params.set("reason_code", args.reasonCode);
  if (args.mcpOnly) params.set("mcp_only", "true");
  params.set("limit", String(Math.min(args.limit ?? 50, 200)));

  const response = await fetch(`${BASE_URL}/v1/audit/decisions?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to get write ledger: ${response.status} ${text}`);
  }

  let ledger: Record<string, unknown>;
  try {
    ledger = await response.json() as Record<string, unknown>;
  } catch {
    return toJsonText({ error: "Failed to parse write ledger response" });
  }

  // Format into a readable summary
  const entries = Array.isArray(ledger.entries) ? ledger.entries as Array<Record<string, unknown>> : [];
  const totals = (ledger.totals ?? {}) as Record<string, number>;
  const window = (ledger.window ?? {}) as Record<string, string>;

  const parts: string[] = [];
  parts.push(`## Write Decision Ledger`);
  parts.push(`**Window:** ${window.since ?? "?"} → ${window.until ?? "now"}`);
  parts.push(`**MCP writes:** ${ledger.mcpCount ?? 0} | **Direct writes:** ${ledger.directCount ?? 0}`);

  const decisionTotals = (ledger.decisionTotals ?? {}) as Record<string, number>;
  if (Object.keys(decisionTotals).length > 0) {
    parts.push("\n### Outcome Breakdown");
    for (const [decision, count] of Object.entries(decisionTotals)) {
      parts.push(`- ${decision}: ${count}`);
    }
  }

  if (Object.keys(totals).length > 0) {
    parts.push("\n### Reason Breakdown");
    for (const [code, count] of Object.entries(totals)) {
      parts.push(`- ${code}: ${count}`);
    }
  }

  if (entries.length > 0) {
    parts.push(`\n### Recent Entries (${entries.length})`);
    for (const entry of entries.slice(0, 20)) {
      const icon = entry.decision === "accepted" ? "✓" : entry.decision === "rejected" ? "✗" : "~";
      const runtime = entry.runtime ? ` [${entry.runtime}]` : "";
      const policy = entry.policyCode ? ` · ${entry.policyCode}` : "";
      const source = entry.sourceType ? ` · ${entry.sourceType}` : "";
      const preview = String(entry.textPreview ?? "").slice(0, 80);
      parts.push(`- ${icon} **${entry.reasonCode}**${policy}${source}${runtime}: ${preview}`);
    }
    if (entries.length > 20) {
      parts.push(`\n_(${entries.length - 20} more entries not shown)_`);
    }
  } else {
    parts.push("\n_No write decisions in this window._");
  }

  return toJsonText({
    summary: parts.join("\n"),
    raw: ledger,
  });
}

type PromptDefinition = {
  title: string;
  description: string;
  text: string;
};

const PROMPTS: Record<string, PromptDefinition> = {
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
  const server = new Server(
    {
      name: "fathippo",
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
      },
      instructions: SERVER_INSTRUCTIONS,
    },
  );

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
    const promptName = request.params?.name;
    if (!promptName) {
      throw new Error("Missing prompt name in request params");
    }
    const prompt = PROMPTS[promptName];

    if (!prompt) {
      throw new Error(`Unknown prompt: ${promptName}`);
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
    if (!request.params) {
      throw new Error("Missing request params");
    }
    const { name, arguments: args } = request.params;

    try {
      const toolArgs = (args ?? {}) as Record<string, unknown>;
      let result: string;

      switch (name) {
        case "start_session":
          result = await handleStartSession(toolArgs as StartSessionArgs);
          break;
        case "build_context":
          result = await handleBuildContext(toolArgs as BuildContextArgs);
          break;
        case "record_turn":
          result = await handleRecordTurn(toolArgs as RecordTurnArgs);
          break;
        case "end_session":
          result = await handleEndSession(toolArgs as EndSessionArgs);
          break;
        case "remember":
          result = await handleRemember(toolArgs as RememberArgs);
          break;
        case "recall":
          result = await handleRecall(toolArgs as RecallArgs);
          break;
        case "search":
          result = await handleSearch(toolArgs as SearchArgs);
          break;
        case "record_trace":
          result = await handleRecordTrace(toolArgs as RecordTraceArgs);
          break;
        case "get_cognitive_context":
          result = await handleGetCognitiveContext(toolArgs as GetCognitiveContextArgs);
          break;
        case "submit_feedback":
          result = await handleSubmitFeedback(toolArgs as SubmitFeedbackArgs);
          break;
        case "get_skill_detail":
          result = await handleGetSkillDetail(toolArgs as GetSkillDetailArgs);
          break;
        case "create_skill":
          result = await handleCreateSkill(toolArgs as CreateSkillArgs);
          break;
        case "get_write_ledger":
          result = await handleGetWriteLedger(toolArgs as GetWriteLedgerArgs);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error) {
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
