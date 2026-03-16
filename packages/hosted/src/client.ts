/**
 * Shared FatHippo hosted API client.
 *
 * Runtime-specific adapters should depend on this package instead of
 * reimplementing hosted HTTP calls locally.
 */

const DEFAULT_BASE_URL = "https://fathippo.ai/api";

export interface FatHippoClientOptions {
  apiKey?: string;
  baseUrl?: string;
  mode?: "auto" | "hosted" | "local";
  pluginVersion?: string;
  pluginId?: string;
  runtime?: string;
  namespace?: string;
  installationId?: string;
  workspaceId?: string;
  additionalHeaders?: Record<string, string>;
}

export interface Memory {
  id: string;
  title: string;
  content: string;
  userId: string;
  memoryType?: string;
  importanceTier?: "critical" | "high" | "normal" | "low";
  importance?: number;
  entities?: string[];
  createdAt: string;
  updatedAt: string;
  accessCount?: number;
  lastAccessedAt?: string;
  absorbed?: boolean;
  absorbedIntoSynthesisId?: string | null;
}

export interface SearchResult {
  memory: Memory;
  score: number;
  matchType?: "vector" | "bm25" | "hybrid";
}

export interface SynthesizedMemory {
  id: string;
  userId: string;
  title: string;
  content: string;
  sourceMemoryIds: string[];
  theme?: string;
  createdAt: string;
}

export interface CriticalMemoriesResponse {
  memories: Memory[];
  syntheses: SynthesizedMemory[];
}

export interface RememberParams {
  content: string;
  title?: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchParams {
  query: string;
  limit?: number;
  excludeAbsorbed?: boolean;
  conversationId?: string;
}

export interface DreamCycleParams {
  processCompleted?: boolean;
  processEphemeral?: boolean;
  synthesizeCritical?: boolean;
  applyDecay?: boolean;
  updateGraph?: boolean;
}

export interface IndexedMemory {
  index: string;
  summary: string;
  content?: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  accessCount: number;
}

export interface IndexedMemoriesResponse {
  indices: IndexedMemory[];
  contextFormat: string;
  count: number;
}

export interface CognitiveTrace {
  id: string;
  type: string;
  problem: string;
  reasoning: string;
  solution?: string;
  outcome: string;
  context: { technologies?: string[] };
  createdAt?: string;
}

export interface CognitivePattern {
  id: string;
  scope: "local" | "global" | "org";
  domain: string;
  approach: string;
  confidence: number;
  score?: number;
}

export interface CognitiveSkill {
  id: string;
  name: string;
  description: string;
  scope: "local" | "global";
  status: string;
  successRate: number;
}

export interface CognitiveContextResponse {
  applicationId?: string;
  policy?: {
    key: string;
    contextKey: string;
    rationale: string;
    exploration: boolean;
    score: number;
    traceLimit: number;
    patternLimit: number;
    skillLimit: number;
    sectionOrder: Array<"local_patterns" | "global_patterns" | "traces" | "skills">;
  } | null;
  workflow?: {
    key: string;
    contextKey: string;
    rationale: string;
    exploration: boolean;
    score: number;
    title: string;
    steps: string[];
  } | null;
  traces: CognitiveTrace[];
  patterns: CognitivePattern[];
  skills?: CognitiveSkill[];
}

export interface ConstraintListResponse {
  constraints: Array<{
    id: string;
    rule: string;
    triggers: string[];
    severity: "critical" | "warning";
    createdAt: string;
  }>;
  count: number;
  contextFormat?: string;
}

export interface ConstraintCreateResponse {
  detected?: boolean;
  alreadyExists?: boolean;
  message?: string;
  rule?: string;
  constraint?: {
    id: string;
    rule: string;
    triggers: string[];
    severity: "critical" | "warning";
  };
}

export interface CognitiveTraceCaptureInput {
  sessionId: string;
  type: string;
  problem: string;
  context?: Record<string, unknown>;
  reasoning?: string;
  approaches?: Array<{
    description: string;
    result: "worked" | "failed" | "partial";
    learnings?: string;
  }>;
  solution?: string;
  outcome: string;
  heuristicOutcome?: string;
  automatedOutcome?: string;
  automatedSignals?: Record<string, unknown>;
  errorMessage?: string;
  toolsUsed?: string[];
  filesModified?: string[];
  durationMs?: number;
  sanitized: boolean;
  sanitizedAt?: string;
  shareEligible?: boolean;
  notes?: string;
  applicationId?: string | null;
  repoSignals?: Record<string, unknown>;
  resolutionKind?: string;
  toolCalls?: unknown[];
  toolResults?: unknown[];
  verificationCommands?: string[];
  retryCount?: number;
  verificationResults?: Record<string, unknown>;
  verificationSummary?: Record<string, unknown>;
  materializedPatternId?: string | null;
  materializedSkillId?: string | null;
  baselineGroupKey?: string | null;
  acceptedTraceId?: string | null;
}

export interface CognitiveTraceCaptureResponse {
  trace: {
    id: string;
    sessionId: string;
    type: string;
    problem: string;
    outcome: string;
    outcomeSource?: string;
    outcomeConfidence?: number;
    shareEligible?: boolean;
    context: Record<string, unknown>;
    automatedSignals: Record<string, unknown>;
    createdAt: string;
  };
  applicationId?: string | null;
  matchedPatterns?: Array<{
    id: string;
    domain: string;
    approach: string;
    confidence: number;
    score?: number;
    scope: "local" | "global" | "org";
  }>;
}

export interface CognitivePatternExtractionResponse {
  ran: boolean;
  reason?: string;
  localPatterns?: number;
  globalPatterns?: number;
  orgId?: string | null;
  orgPromotedPatterns?: number;
  touchedPatternIds?: string[];
  promotedPatternIds?: string[];
}

export interface CognitiveSkillSynthesisResponse {
  ran: boolean;
  reason?: string;
  count?: number;
  skills?: Array<{
    id: string;
    name: string;
    scope: "local" | "global";
    status: string;
    successRate: number;
  }>;
}

function mapMemoryRecord(record: {
  id: string;
  title: string;
  text: string;
  userId?: string;
  type?: string;
  memoryType?: string;
  tier?: string;
  importanceTier?: string;
  createdAt: string;
  accessCount?: number;
  absorbed?: boolean;
  absorbedIntoSynthesisId?: string | null;
}): Memory {
  return {
    id: record.id,
    title: record.title,
    content: record.text,
    userId: record.userId ?? "",
    memoryType: record.memoryType ?? record.type,
    importanceTier:
      (record.importanceTier as Memory["importanceTier"]) ??
      (record.tier as Memory["importanceTier"]) ??
      "normal",
    createdAt: record.createdAt,
    updatedAt: record.createdAt,
    accessCount: record.accessCount,
    absorbed: record.absorbed,
    absorbedIntoSynthesisId: record.absorbedIntoSynthesisId,
  };
}

export class FatHippoClient {
  private apiKey: string;
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(options: FatHippoClientOptions) {
    this.apiKey = options.apiKey ?? "";
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    const runtimeHeaders: Record<string, string> = {};
    if (options.runtime) {
      runtimeHeaders["X-Fathippo-Runtime"] = options.runtime;
    }
    if (options.namespace) {
      runtimeHeaders["X-Fathippo-Namespace"] = options.namespace;
    }
    if (options.installationId) {
      runtimeHeaders["X-Fathippo-Installation-Id"] = options.installationId;
    }
    if (options.workspaceId) {
      runtimeHeaders["X-Fathippo-Workspace-Id"] = options.workspaceId;
    }

    this.headers = {
      "X-Fathippo-Plugin-Id": options.pluginId ?? "fathippo-context-engine",
      "X-Fathippo-Plugin-Version": options.pluginVersion ?? "unknown",
      "X-Fathippo-Plugin-Mode": options.mode === "local" ? "local" : "hosted",
      ...runtimeHeaders,
      ...(options.additionalHeaders ?? {}),
    };
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...this.headers,
        ...(options.headers ?? {}),
      },
    });

    if (!response.ok) {
      const error = await response.text().catch(() => "Unknown error");
      throw new Error(`FatHippo API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<T>;
  }

  async remember(params: RememberParams): Promise<Memory> {
    const response = await this.request<{
      memory: {
        id: string;
        title: string;
        text: string;
        userId: string;
        memoryType?: string;
        importanceTier?: string;
        createdAt: string;
        accessCount?: number;
        absorbed?: boolean;
        absorbedIntoSynthesisId?: string | null;
      };
    }>("/v1/memories", {
      method: "POST",
      body: JSON.stringify(params),
    });

    return mapMemoryRecord(response.memory);
  }

  async search(params: SearchParams): Promise<SearchResult[]> {
    const response = await this.request<
      Array<{
        score: number;
        vectorScore?: number;
        bm25Score?: number;
        memory: {
          id: string;
          title: string;
          text: string;
          userId: string;
          memoryType?: string;
          importanceTier?: string;
          createdAt: string;
          accessCount?: number;
          absorbed?: boolean;
          absorbedIntoSynthesisId?: string | null;
        };
      }>
    >("/v1/search", {
      method: "POST",
      body: JSON.stringify(params),
    });

    return response.map((result) => ({
      memory: mapMemoryRecord(result.memory),
      score: result.score,
      matchType:
        result.vectorScore && result.bm25Score
          ? "hybrid"
          : result.vectorScore
            ? "vector"
            : "bm25",
    }));
  }

  async getCriticalMemories(options?: {
    limit?: number;
    excludeAbsorbed?: boolean;
  }): Promise<CriticalMemoriesResponse> {
    const response = await this.request<{
      critical: Array<{ id: string; title: string; text: string; type: string; tier: string; createdAt: string }>;
      working: Array<{ id: string; title: string; text: string; synthesizedFrom?: string[] }>;
    }>("/v1/context", {
      method: "POST",
      body: JSON.stringify({
        message: "",
        includeHigh: false,
        highLimit: 0,
      }),
    });

    const memories = response.critical
      .map(mapMemoryRecord)
      .filter((memory) => (options?.excludeAbsorbed ? !memory.absorbed : true))
      .slice(0, options?.limit ?? 30);

    const syntheses = response.working.slice(0, options?.limit ?? 30).map((item) => ({
      id: item.id,
      userId: "",
      title: item.title,
      content: item.text,
      sourceMemoryIds: item.synthesizedFrom ?? [],
      createdAt: new Date().toISOString(),
    }));

    return { memories, syntheses };
  }

  async getRecentMemories(options?: {
    hours?: number;
    limit?: number;
  }): Promise<Memory[]> {
    const params = new URLSearchParams();
    if (options?.limit) {
      params.set("limit", String(options.limit));
    }

    const response = await this.request<{
      memories: Array<{
        id: string;
        title: string;
        text: string;
        userId: string;
        memoryType?: string;
        importanceTier?: string;
        createdAt: string;
        accessCount?: number;
        absorbed?: boolean;
        absorbedIntoSynthesisId?: string | null;
      }>;
    }>(`/v1/memories?${params}`);

    let memories = response.memories.map(mapMemoryRecord);
    if (options?.hours) {
      const cutoff = Date.now() - options.hours * 60 * 60 * 1000;
      memories = memories.filter((memory) => Date.parse(memory.createdAt) >= cutoff);
    }

    return memories;
  }

  async runDreamCycle(params?: DreamCycleParams): Promise<{
    ok: boolean;
    synthesized?: number;
    decayed?: number;
  }> {
    const response = await this.request<{ maintenance?: { archived?: number; deleted?: number } }>(
      "/v1/lifecycle",
      {
        method: "POST",
        body: JSON.stringify(params || {}),
      },
    );

    return {
      ok: true,
      synthesized: 0,
      decayed: (response.maintenance?.archived ?? 0) + (response.maintenance?.deleted ?? 0),
    };
  }

  async getContext(query?: string): Promise<{
    memories: Memory[];
    syntheses?: Array<{ id: string; title: string; content: string }>;
    tokenEstimate?: number;
  }> {
    const response = await this.request<{
      critical: Array<{ id: string; title: string; text: string; type: string; tier: string; createdAt: string }>;
      high: Array<{ id: string; title: string; text: string; type: string; tier: string; createdAt: string }>;
      working: Array<{ id: string; title: string; text: string }>;
      stats?: { totalTokensEstimate?: number };
    }>("/v1/context", {
      method: "POST",
      body: JSON.stringify({ message: query || "" }),
    });

    return {
      memories: [...response.critical, ...response.high].map(mapMemoryRecord),
      syntheses: response.working?.map((item) => ({
        id: item.id,
        title: item.title,
        content: item.text,
      })),
      tokenEstimate: response.stats?.totalTokensEstimate,
    };
  }

  async getIndexedSummaries(): Promise<IndexedMemoriesResponse> {
    return this.request<IndexedMemoriesResponse>("/v1/indexed");
  }

  async dereferenceIndex(indexKey: string): Promise<IndexedMemory> {
    return this.request<IndexedMemory>(`/v1/indexed/${encodeURIComponent(indexKey)}`);
  }

  async storeIndexed(params: {
    index: string;
    summary: string;
    content: string;
    contentType?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ stored: boolean; index: string }> {
    return this.request<{ stored: boolean; index: string }>("/v1/indexed", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async getConstraints(): Promise<ConstraintListResponse> {
    return this.request<ConstraintListResponse>("/v1/cognitive/constraints", {
      method: "GET",
    });
  }

  async storeConstraint(params: { message: string }): Promise<ConstraintCreateResponse> {
    return this.request<ConstraintCreateResponse>("/v1/cognitive/constraints", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async getRelevantCognitiveContext(params: {
    sessionId: string;
    endpoint: string;
    problem: string;
    limit?: number;
    adaptivePolicy?: boolean;
    context?: {
      technologies?: string[];
      repoProfile?: Record<string, unknown> | null;
    };
  }): Promise<CognitiveContextResponse> {
    return this.request<CognitiveContextResponse>("/v1/cognitive/traces/relevant", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async captureCognitiveTrace(
    params: CognitiveTraceCaptureInput,
  ): Promise<CognitiveTraceCaptureResponse> {
    return this.request<CognitiveTraceCaptureResponse>("/v1/cognitive/traces", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async extractCognitivePatterns(params?: {
    intervalMs?: number;
    leaseMs?: number;
  }): Promise<CognitivePatternExtractionResponse> {
    return this.request<CognitivePatternExtractionResponse>("/v1/cognitive/patterns/extract", {
      method: "POST",
      body: JSON.stringify(params ?? {}),
    });
  }

  async synthesizeCognitiveSkills(params?: {
    intervalMs?: number;
    leaseMs?: number;
  }): Promise<CognitiveSkillSynthesisResponse> {
    return this.request<CognitiveSkillSynthesisResponse>("/v1/cognitive/skills/synthesize", {
      method: "POST",
      body: JSON.stringify(params ?? {}),
    });
  }

  async submitPatternFeedback(params: {
    patternId: string;
    traceId: string;
    outcome: 'success' | 'failure';
    notes?: string;
  }): Promise<{ updated: boolean }> {
    return this.request<{ updated: boolean }>("/v1/cognitive/patterns/feedback", {
      method: "POST",
      body: JSON.stringify({
        patternId: params.patternId,
        traceId: params.traceId,
        outcome: params.outcome,
        notes: params.notes,
      }),
    });
  }
}
