import type {
  CognitiveContextResponse,
  ConstraintListResponse,
  IndexedMemoriesResponse,
} from "./client.js";

type FatHippoFetch = typeof fetch;

export type FatHippoRuntimeName =
  | "openclaw"
  | "claude"
  | "codex"
  | "cursor"
  | "custom";

export type FatHippoMessageRole = "system" | "user" | "assistant" | "tool";

export interface FatHippoRuntimeMetadata {
  runtime: FatHippoRuntimeName;
  runtimeVersion?: string;
  adapterVersion?: string;
  namespace?: string;
  workspaceId?: string;
  workspaceRoot?: string;
  installationId?: string;
  conversationId?: string;
  agentId?: string;
  model?: string;
}

export interface FatHippoConversationMessage {
  role: FatHippoMessageRole;
  content: string;
  timestamp?: string;
  toolName?: string;
  toolCallId?: string;
}

export interface FatHippoInjectedMemoryRef {
  id: string;
  title: string;
  text: string;
  type?: string;
  tier?: string;
  source: "critical" | "high" | "working" | "refresh" | "search";
}

export interface FatHippoSessionStartInput {
  firstMessage?: string;
  namespace?: string;
  metadata?: Record<string, unknown>;
  runtime?: Partial<FatHippoRuntimeMetadata>;
}

export interface FatHippoSessionStartOutput {
  sessionId: string;
  systemPromptAddition: string;
  injectedMemories: FatHippoInjectedMemoryRef[];
  tokensInjected?: number;
  criticalCount?: number;
  highCount?: number;
}

export interface FatHippoBuildContextInput {
  messages: FatHippoConversationMessage[];
  lastUserMessage?: string;
  sessionId?: string;
  conversationId?: string;
  maxCritical?: number;
  maxRelevant?: number;
  includeIndexed?: boolean;
  includeConstraints?: boolean;
  includeCognitive?: boolean;
  runtime?: Partial<FatHippoRuntimeMetadata>;
}

export interface FatHippoBuildContextOutput {
  systemPromptAddition: string;
  injectedMemories: FatHippoInjectedMemoryRef[];
  sensitiveOmitted?: number;
  evaluationId?: string;
  retrievalConfidence?: number;
  /** IDs of cognitive patterns injected into this context */
  injectedPatternIds?: string[];
  /** IDs of synthesized skills injected into this context */
  injectedSkillIds?: string[];
  /** IDs of traces injected into this context */
  injectedTraceIds?: string[];
  /** Application ID for this cognitive context retrieval */
  cognitiveApplicationId?: string;
}

export interface FatHippoRecordTurnInput {
  sessionId: string;
  messages: FatHippoConversationMessage[];
  turnNumber?: number;
  memoriesUsed?: string[];
  captureUserOnly?: boolean;
  captureConstraints?: boolean;
  captureTrace?: boolean;
  runtime?: Partial<FatHippoRuntimeMetadata>;
}

export interface FatHippoTurnCaptureSummary {
  stored: number;
  updated: number;
  merged: number;
  constraintsDetected: number;
  traceCaptured: boolean;
}

export interface FatHippoRecordTurnOutput {
  turnNumber: number;
  refreshNeeded: boolean;
  systemPromptAddition?: string;
  injectedMemories: FatHippoInjectedMemoryRef[];
  memoriesUsed: string[];
  captureSummary?: FatHippoTurnCaptureSummary;
}

export interface FatHippoRememberInput {
  text: string;
  title?: string;
  runtime?: Partial<FatHippoRuntimeMetadata>;
}

export interface FatHippoRememberOutput {
  memoryId?: string;
  stored: boolean;
  consolidated?: boolean;
  warning?: string;
}

export interface FatHippoSearchInput {
  query: string;
  limit?: number;
  since?: string;
  namespace?: string;
  runtime?: Partial<FatHippoRuntimeMetadata>;
}

export interface FatHippoSearchResult {
  id: string;
  title: string;
  text: string;
  score: number;
  memoryType?: string;
  provenance?: {
    source?: string;
    fileName?: string;
    sourceUrl?: string;
    createdAt?: string;
  };
}

export interface FatHippoSessionEndInput {
  sessionId: string;
  outcome?: "success" | "failure" | "abandoned";
  feedback?: string;
  runtime?: Partial<FatHippoRuntimeMetadata>;
}

export interface FatHippoSessionEndOutput {
  summary: string;
  suggestedMemories: Array<{
    content: string;
    memoryType: string;
    confidence: number;
  }>;
  memoriesReinforced: number;
  analytics?: {
    turns: number;
    memoriesUsed: number;
    outcome: string;
    duration: number | null;
  };
}

export interface FatHippoHostedRuntimeClientContract {
  startSession(input: FatHippoSessionStartInput): Promise<FatHippoSessionStartOutput>;
  buildContext(input: FatHippoBuildContextInput): Promise<FatHippoBuildContextOutput>;
  recordTurn(input: FatHippoRecordTurnInput): Promise<FatHippoRecordTurnOutput>;
  remember(input: FatHippoRememberInput): Promise<FatHippoRememberOutput>;
  search(input: FatHippoSearchInput): Promise<FatHippoSearchResult[]>;
  endSession(input: FatHippoSessionEndInput): Promise<FatHippoSessionEndOutput>;
}

export interface FatHippoHostedRuntimeClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: FatHippoFetch;
  runtime?: FatHippoRuntimeMetadata;
}

type ApiTierMemory = {
  id: string;
  title: string;
  text: string;
  type?: string;
  tier?: string;
  synthesizedFrom?: string[];
};

type SessionStartApiResponse = {
  sessionId: string;
  context?: {
    critical?: ApiTierMemory[];
    high?: ApiTierMemory[];
  };
  stats?: {
    tokensInjected?: number;
    criticalCount?: number;
    highCount?: number;
  };
};

type SessionTurnApiResponse = {
  turnNumber: number;
  refreshNeeded: boolean;
  newContext?: {
    critical?: ApiTierMemory[];
    high?: ApiTierMemory[];
  };
  memoriesUsed?: string[];
  captureSummary?: FatHippoTurnCaptureSummary;
};

type SessionEndApiResponse = FatHippoSessionEndOutput;

type RememberApiResponse = {
  id?: string;
  stored?: boolean;
  consolidated?: boolean;
  warning?: string;
};

type SearchApiResponse = Array<{
  id: string;
  score: number;
  provenance?: FatHippoSearchResult["provenance"];
  memory: {
    id: string;
    title: string;
    text: string;
    memoryType?: string;
  };
}>;

function normalizeApiBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (normalized.endsWith("/api/v1")) {
    return normalized.slice(0, -3);
  }
  if (normalized.endsWith("/api")) {
    return normalized;
  }
  return `${normalized}/api`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function pickLastUserMessage(messages: FatHippoConversationMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user" && isNonEmptyString(message.content)) {
      return message.content.trim();
    }
  }
  return "";
}

function formatMemoryList(memories: ApiTierMemory[]): string[] {
  return memories.map((memory) => {
    const title = memory.title.trim() || "Memory";
    const text = memory.text.trim();
    return text ? `- ${title}: ${text}` : `- ${title}`;
  });
}

function formatTieredContext(context: {
  critical?: ApiTierMemory[];
  working?: ApiTierMemory[];
  high?: ApiTierMemory[];
}): string {
  const sections: string[] = [];

  if ((context.critical?.length ?? 0) > 0) {
    sections.push(`## Critical Memory\n${formatMemoryList(context.critical ?? []).join("\n")}`);
  }

  if ((context.working?.length ?? 0) > 0) {
    sections.push(`## Working Memory\n${formatMemoryList(context.working ?? []).join("\n")}`);
  }

  if ((context.high?.length ?? 0) > 0) {
    sections.push(`## Relevant Memory\n${formatMemoryList(context.high ?? []).join("\n")}`);
  }

  return sections.join("\n\n");
}

function mapInjectedMemories(
  memories: ApiTierMemory[] | undefined,
  source: FatHippoInjectedMemoryRef["source"],
): FatHippoInjectedMemoryRef[] {
  return (memories ?? []).map((memory) => ({
    id: memory.id,
    title: memory.title,
    text: memory.text,
    type: memory.type,
    tier: memory.tier,
    source,
  }));
}

function looksLikeCodingQuery(query: string): boolean {
  const codingKeywords = [
    // Existing
    "bug",
    "error",
    "fix",
    "debug",
    "implement",
    "build",
    "create",
    "refactor",
    "function",
    "class",
    "api",
    "endpoint",
    "database",
    "query",
    "test",
    "deploy",
    "config",
    "install",
    "code",
    "script",
    "migration",
    // Architecture & planning
    "architecture",
    "design",
    "pattern",
    "structure",
    "module",
    "component",
    "service",
    "layer",
    "schema",
    "model",
    "upgrade",
    "optimize",
    "performance",
    // General development
    "update",
    "change",
    "modify",
    "add",
    "remove",
    "delete",
    "move",
    "rename",
    "split",
    "merge",
    "integrate",
    "setup",
    "configure",
    "release",
    "review",
    "check",
    "verify",
    "validate",
    "lint",
    // Problem-solving
    "how to",
    "how do",
    "best way",
    "approach",
    "strategy",
    "improve",
    "clean up",
    "simplify",
    "help with",
    "issue",
    "problem",
    "trouble",
    "struggling",
    // Data & infrastructure
    "table",
    "column",
    "index",
    "cache",
    "queue",
    "worker",
    "cron",
    "webhook",
    "docker",
    "container",
    "server",
    "cluster",
  ];
  const normalized = query.toLowerCase();
  return codingKeywords.some((keyword) => normalized.includes(keyword));
}

function formatIndexedContext(indexed: IndexedMemoriesResponse | null): string {
  if (!indexed || indexed.count <= 0 || !indexed.contextFormat.trim()) {
    return "";
  }
  return `## Indexed Memory\n${indexed.contextFormat}`;
}

function formatConstraintContext(constraints: ConstraintListResponse | null): string {
  return constraints?.contextFormat?.trim() ?? "";
}

function formatCognitiveContext(data: CognitiveContextResponse | null): string {
  if (!data) {
    return "";
  }

  const sections = new Map<string, string>();
  if (data.workflow && data.workflow.steps.length > 0) {
    const stepLines = data.workflow.steps.map((step) => `- ${step}`).join("\n");
    const explorationNote = data.workflow.exploration ? " exploratory" : "";
    sections.set(
      "workflow",
      `## Recommended Workflow\n${stepLines}\n\nStrategy: ${data.workflow.title} (${data.workflow.rationale}${explorationNote})`,
    );
  }

  const localPatterns = (data.patterns ?? []).filter((pattern) => pattern.scope !== "global");
  const globalPatterns = (data.patterns ?? []).filter((pattern) => pattern.scope === "global");

  // Prevention-oriented pattern formatting
  function formatPatternAsPreventionRule(pattern: { domain: string; approach: string; confidence: number; id?: string }): string {
    const confidence_pct = Math.round(pattern.confidence * 100);
    return `  - ✓ DO: ${pattern.approach.slice(0, 160)} [${pattern.domain}, ${confidence_pct}% confidence]`;
  }

  if (localPatterns.length > 0) {
    sections.set(
      "local_patterns",
      `## Prevention Rules (from past experience)\n${localPatterns
        .map((pattern) => formatPatternAsPreventionRule(pattern))
        .join("\n")}`,
    );
  }

  if (globalPatterns.length > 0) {
    sections.set(
      "global_patterns",
      `## Global Prevention Rules\n${globalPatterns
        .map((pattern) => formatPatternAsPreventionRule(pattern))
        .join("\n")}`,
    );
  }

  if ((data.traces?.length ?? 0) > 0) {
    sections.set(
      "traces",
      `## Past Similar Problems\n${data.traces
        .map((trace) => {
          const icon = trace.outcome === "success" ? "✓" : trace.outcome === "failed" ? "✗" : "~";
          const solution = trace.solution ? ` -> ${trace.solution.slice(0, 80)}...` : "";
          return `- ${icon} ${trace.problem.slice(0, 80)}${solution}`;
        })
        .join("\n")}`,
    );
  }

  if ((data.skills?.length ?? 0) > 0) {
    sections.set(
      "skills",
      `## Available Skills (call get_skill_detail for full procedure)\n${(data.skills ?? [])
        .map((skill) => `- [${skill.id}] ${skill.name}: ${skill.description} (${Math.round(skill.successRate * 100)}% success)`)
        .join("\n")}`,
    );
  }

  const orderedSections = [
    sections.get("workflow"),
    ...(data.policy?.sectionOrder ?? ["local_patterns", "global_patterns", "traces", "skills"]).map((key) =>
      sections.get(key),
    ),
  ].filter((section): section is string => Boolean(section?.trim()));

  return orderedSections.join("\n\n");
}

function joinContextSections(sections: Array<string | null | undefined>): string {
  return sections
    .map((section) => section?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function parseNumberHeader(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export class FatHippoHostedRuntimeClient implements FatHippoHostedRuntimeClientContract {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FatHippoFetch;
  private readonly defaultRuntime: FatHippoRuntimeMetadata;

  constructor(options: FatHippoHostedRuntimeClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = normalizeApiBaseUrl(options.baseUrl);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.defaultRuntime = {
      runtime: "custom",
      ...options.runtime,
    };
  }

  async startSession(input: FatHippoSessionStartInput): Promise<FatHippoSessionStartOutput> {
    const response = await this.requestJson<SessionStartApiResponse>("/v1/sessions/start", {
      method: "POST",
      runtime: input.runtime,
      body: JSON.stringify({
        firstMessage: input.firstMessage,
        namespace: input.namespace ?? this.resolveRuntime(input.runtime).namespace,
        metadata: input.metadata,
      }),
    });

    const injectedMemories = [
      ...mapInjectedMemories(response.context?.critical, "critical"),
      ...mapInjectedMemories(response.context?.high, "high"),
    ];

    return {
      sessionId: response.sessionId,
      systemPromptAddition: formatTieredContext(response.context ?? {}),
      injectedMemories,
      tokensInjected: response.stats?.tokensInjected,
      criticalCount: response.stats?.criticalCount,
      highCount: response.stats?.highCount,
    };
  }

  async buildContext(input: FatHippoBuildContextInput): Promise<FatHippoBuildContextOutput> {
    const runtime = this.resolveRuntime(input.runtime);
    const message = input.lastUserMessage?.trim() || pickLastUserMessage(input.messages);
    const simpleContextPromise = this.requestText("/v1/simple/context", {
      method: "POST",
      runtime: input.runtime,
      body: JSON.stringify({
        message,
        conversationId: input.conversationId ?? runtime.conversationId,
        namespace: runtime.namespace,
        maxCritical: input.maxCritical,
        maxRelevant: input.maxRelevant,
      }),
    });

    const indexedPromise =
      input.includeIndexed === false
        ? Promise.resolve<IndexedMemoriesResponse | null>(null)
        : this.requestJson<IndexedMemoriesResponse>("/v1/indexed", {
            method: "GET",
            runtime: input.runtime,
          }).catch(() => null);

    const constraintsPromise =
      input.includeConstraints === false
        ? Promise.resolve<ConstraintListResponse | null>(null)
        : this.requestJson<ConstraintListResponse>("/v1/cognitive/constraints", {
            method: "GET",
            runtime: input.runtime,
          }).catch(() => null);

    const cognitivePromise =
      input.includeCognitive === false || !message || !looksLikeCodingQuery(message)
        ? Promise.resolve<CognitiveContextResponse | null>(null)
        : this.requestJson<CognitiveContextResponse>("/v1/cognitive/traces/relevant", {
            method: "POST",
            runtime: input.runtime,
            body: JSON.stringify({
              sessionId:
                input.sessionId ??
                input.conversationId ??
                runtime.conversationId ??
                "runtime-build-context",
              endpoint: "runtime-adapter.buildContext",
              problem: message,
              limit: 3,
              adaptivePolicy: true,
            }),
          }).catch(() => null);

    const [response, indexed, constraints, cognitive] = await Promise.all([
      simpleContextPromise,
      indexedPromise,
      constraintsPromise,
      cognitivePromise,
    ]);

    const injected_pattern_ids = (cognitive?.patterns ?? []).map(p => p.id);
    const injected_skill_ids = (cognitive?.skills ?? []).map(s => s.id);
    const injected_trace_ids = (cognitive?.traces ?? []).map(t => t.id);

    return {
      systemPromptAddition: joinContextSections([
        response.text,
        formatConstraintContext(constraints),
        formatIndexedContext(indexed),
        formatCognitiveContext(cognitive),
      ]),
      injectedMemories: [],
      sensitiveOmitted: parseNumberHeader(response.headers, "X-FatHippo-Sensitive-Omitted"),
      evaluationId: response.headers.get("X-FatHippo-Eval-Id") ?? undefined,
      retrievalConfidence: parseNumberHeader(response.headers, "X-FatHippo-Retrieval-Confidence"),
      injectedPatternIds: injected_pattern_ids.length > 0 ? injected_pattern_ids : undefined,
      injectedSkillIds: injected_skill_ids.length > 0 ? injected_skill_ids : undefined,
      injectedTraceIds: injected_trace_ids.length > 0 ? injected_trace_ids : undefined,
      cognitiveApplicationId: cognitive?.applicationId ?? undefined,
    };
  }

  async recordTurn(input: FatHippoRecordTurnInput): Promise<FatHippoRecordTurnOutput> {
    const response = await this.requestJson<SessionTurnApiResponse>(
      `/v1/sessions/${encodeURIComponent(input.sessionId)}/turn`,
      {
        method: "POST",
        runtime: input.runtime,
        body: JSON.stringify({
          turnNumber: input.turnNumber,
          messages: input.messages,
          memoriesUsed: input.memoriesUsed ?? [],
          captureUserOnly: input.captureUserOnly,
          captureConstraints: input.captureConstraints,
          captureTrace: input.captureTrace,
        }),
      },
    );

    const injectedMemories = [
      ...mapInjectedMemories(response.newContext?.critical, "refresh"),
      ...mapInjectedMemories(response.newContext?.high, "refresh"),
    ];
    const systemPromptAddition = response.newContext
      ? formatTieredContext(response.newContext)
      : undefined;

    return {
      turnNumber: response.turnNumber,
      refreshNeeded: response.refreshNeeded,
      systemPromptAddition: systemPromptAddition || undefined,
      injectedMemories,
      memoriesUsed: response.memoriesUsed ?? input.memoriesUsed ?? [],
      captureSummary: response.captureSummary,
    };
  }

  async remember(input: FatHippoRememberInput): Promise<FatHippoRememberOutput> {
    const response = await this.requestJson<RememberApiResponse>("/v1/simple/remember", {
      method: "POST",
      runtime: input.runtime,
      body: JSON.stringify({
        text: input.text,
        title: input.title,
      }),
    });

    return {
      memoryId: response.id,
      stored: response.stored !== false,
      consolidated: response.consolidated,
      warning: response.warning,
    };
  }

  async search(input: FatHippoSearchInput): Promise<FatHippoSearchResult[]> {
    const runtime = this.resolveRuntime(input.runtime);
    const response = await this.requestJson<SearchApiResponse>("/v1/search", {
      method: "POST",
      runtime: input.runtime,
      body: JSON.stringify({
        query: input.query,
        topK: input.limit,
        since: input.since,
        namespace: input.namespace ?? runtime.namespace,
      }),
    });

    return response.map((result) => ({
      id: result.memory.id || result.id,
      title: result.memory.title,
      text: result.memory.text,
      score: result.score,
      memoryType: result.memory.memoryType,
      provenance: result.provenance,
    }));
  }

  async endSession(input: FatHippoSessionEndInput): Promise<FatHippoSessionEndOutput> {
    return this.requestJson<SessionEndApiResponse>(
      `/v1/sessions/${encodeURIComponent(input.sessionId)}/end`,
      {
        method: "POST",
        runtime: input.runtime,
        body: JSON.stringify({
          outcome: input.outcome,
          feedback: input.feedback,
        }),
      },
    );
  }

  private resolveRuntime(
    runtime?: Partial<FatHippoRuntimeMetadata>,
  ): FatHippoRuntimeMetadata {
    return {
      ...this.defaultRuntime,
      ...runtime,
      runtime: runtime?.runtime ?? this.defaultRuntime.runtime,
    };
  }

  private buildHeaders(runtime?: Partial<FatHippoRuntimeMetadata>): Record<string, string> {
    const resolved = this.resolveRuntime(runtime);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "X-Fathippo-Runtime": resolved.runtime,
    };

    if (resolved.runtimeVersion) {
      headers["X-Fathippo-Runtime-Version"] = resolved.runtimeVersion;
    }
    if (resolved.adapterVersion) {
      headers["X-Fathippo-Adapter-Version"] = resolved.adapterVersion;
    }
    if (resolved.namespace) {
      headers["X-Fathippo-Namespace"] = resolved.namespace;
    }
    if (resolved.workspaceId) {
      headers["X-Fathippo-Workspace-Id"] = resolved.workspaceId;
    }
    if (resolved.workspaceRoot) {
      headers["X-Fathippo-Workspace-Root"] = resolved.workspaceRoot;
    }
    if (resolved.installationId) {
      headers["X-Fathippo-Installation-Id"] = resolved.installationId;
    }
    if (resolved.conversationId) {
      headers["X-Fathippo-Conversation-Id"] = resolved.conversationId;
    }
    if (resolved.agentId) {
      headers["X-Fathippo-Agent-Id"] = resolved.agentId;
    }
    if (resolved.model) {
      headers["X-Fathippo-Model"] = resolved.model;
    }

    return headers;
  }

  private async requestJson<T>(
    path: string,
    init: {
      method: "POST" | "GET";
      body?: string;
      runtime?: Partial<FatHippoRuntimeMetadata>;
    },
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: init.method,
      headers: this.buildHeaders(init.runtime),
      body: init.body,
    });

    if (!response.ok) {
      const error = await response.text().catch(() => "Unknown error");
      throw new Error(`FatHippo request failed with ${response.status}: ${error}`);
    }

    return response.json() as Promise<T>;
  }

  private async requestText(
    path: string,
    init: {
      method: "POST" | "GET";
      body?: string;
      runtime?: Partial<FatHippoRuntimeMetadata>;
    },
  ): Promise<{ text: string; headers: Headers }> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: init.method,
      headers: this.buildHeaders(init.runtime),
      body: init.body,
    });

    if (!response.ok) {
      const error = await response.text().catch(() => "Unknown error");
      throw new Error(`FatHippo request failed with ${response.status}: ${error}`);
    }

    return {
      text: await response.text(),
      headers: response.headers,
    };
  }
}

export function createFatHippoHostedRuntimeClient(
  options: FatHippoHostedRuntimeClientOptions,
): FatHippoHostedRuntimeClient {
  return new FatHippoHostedRuntimeClient(options);
}
