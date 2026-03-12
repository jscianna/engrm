/**
 * FatHippo Cognitive Engine Types
 * 
 * Core types for trace capture, pattern extraction, and skill synthesis.
 */

// ============================================================================
// TRACE TYPES - Captured from coding sessions
// ============================================================================

export type TraceType = 'debugging' | 'building' | 'refactoring' | 'reviewing' | 'configuring';
export type TraceOutcome = 'success' | 'partial' | 'failed' | 'abandoned';

export interface Approach {
  description: string;
  result: 'worked' | 'failed' | 'partial';
  learnings?: string;
  toolsUsed?: string[];
  durationMs?: number;
}

export interface CodingTrace {
  id: string;
  userId: string;
  sessionId: string;
  timestamp: string;
  
  // What happened
  type: TraceType;
  problem: string;              // Initial problem/task description
  context: TraceContext;        // Files, technologies, error messages
  
  // How it was approached
  reasoning: string;            // Agent's thought process
  approaches: Approach[];       // What was tried, in order
  
  // Result
  solution?: string;            // What worked (if success)
  outcome: TraceOutcome;
  errorMessage?: string;        // If failed
  
  // Metadata
  toolsUsed: string[];
  toolCalls?: Array<Record<string, unknown>>;
  toolResults?: Array<Record<string, unknown>>;
  verificationCommands?: string[];
  retryCount?: number;
  repoSignals?: {
    filesModified: string[];
    languages: string[];
    diffSummary: string;
    workspaceRoot?: string;
  };
  resolutionKind?: 'tests_passed' | 'build_passed' | 'lint_passed' | 'manual_only' | 'failed';
  filesModified: string[];
  durationMs: number;
  
  // Linking
  relatedTraceIds?: string[];   // Similar past traces
  patternIds?: string[];        // Patterns this contributed to
  
  // Sanitization
  sanitized: boolean;           // Has been scrubbed of secrets
  sanitizedAt?: string;
}

export interface TraceContext {
  technologies: string[];       // e.g., ["turso", "nextjs", "typescript"]
  files: string[];              // Files involved (paths, not content)
  errorMessages?: string[];     // Error messages encountered
  stackTraces?: string[];       // Stack traces (sanitized)
  environment?: string;         // e.g., "development", "production"
  projectType?: string;         // e.g., "web-app", "cli", "library"
}

// ============================================================================
// PATTERN TYPES - Extracted from traces
// ============================================================================

export interface Pattern {
  id: string;
  userId?: string;              // null = global pattern
  scope?: 'local' | 'global' | 'org';
  orgId?: string | null;
  sourcePatternId?: string | null;
  provenance?: Record<string, unknown>;
  
  // What triggers this pattern
  domain: string;               // e.g., "turso", "nextjs-auth", "docker"
  trigger: PatternTrigger;      // Conditions that indicate this pattern applies
  
  // What to do
  approach: string;             // The recommended approach
  steps?: string[];             // Specific steps if applicable
  pitfalls?: string[];          // What to avoid
  
  // Confidence
  confidence: number;           // 0-1, based on success rate
  successCount: number;
  failCount: number;
  lastApplied?: string;
  
  // Provenance
  sourceTraceIds: string[];     // Which traces this came from
  createdAt: string;
  updatedAt: string;
  
  // Lifecycle
  status: PatternStatus;
  synthesizedIntoSkill?: string; // Skill ID if synthesized
}

export interface PatternTrigger {
  keywords: string[];           // Keywords that suggest this pattern
  errorPatterns?: string[];     // Regex patterns for error messages
  technologies?: string[];      // Technologies that must be present
  problemTypes?: TraceType[];   // Types of problems this applies to
}

export type PatternStatus =
  | 'candidate'
  | 'active_local'
  | 'active_org'
  | 'active_global'
  | 'synthesized_local'
  | 'synthesized_org'
  | 'synthesized_global'
  | 'deprecated';

// ============================================================================
// SKILL TYPES - Synthesized from patterns
// ============================================================================

export interface SynthesizedSkill {
  id: string;
  name: string;                 // e.g., "turso-vector-debugging"
  description: string;
  version: string;
  
  // Generated content
  content: SkillContent;
  
  // Provenance
  sourcePatternIds: string[];
  sourceTraceIds: string[];
  sourceTraceCount?: number;
  generatedAt: string;
  generatedBy: 'auto' | 'manual';
  
  // Quality metrics
  qualityScore: number;         // 0-1
  usageCount: number;
  successRate: number;
  lastUsed?: string;
  
  // Publishing
  published: boolean;
  publishedTo?: 'clawhub' | 'local';
  clawHubId?: string;
  publishedAt?: string;
  
  // Lifecycle
  status: SkillStatus;
}

export interface SkillContent {
  whenToUse: string;
  procedure: string[];
  commonPitfalls: string[];
  verification: string;
  examples?: string[];
  references?: string[];
}

export type SkillStatus = 'draft' | 'active' | 'stale' | 'deprecated';

export type AdaptivePolicyKey =
  | 'balanced_default'
  | 'trace_first'
  | 'pattern_first'
  | 'skill_first';

export type AdaptivePolicySection =
  | 'local_patterns'
  | 'global_patterns'
  | 'traces'
  | 'skills';

export interface AdaptivePolicyRecommendation {
  key: AdaptivePolicyKey;
  contextKey: string;
  traceLimit: number;
  patternLimit: number;
  skillLimit: number;
  sectionOrder: AdaptivePolicySection[];
  rationale: string;
  exploration: boolean;
  score: number;
}

export type ToolWorkflowStrategyKey =
  | 'verify_first'
  | 'search_codebase_first'
  | 'inspect_config_first'
  | 'patch_then_verify';

export interface ToolWorkflowRecommendation {
  key: ToolWorkflowStrategyKey;
  contextKey: string;
  rationale: string;
  exploration: boolean;
  score: number;
  title: string;
  steps: string[];
}

// ============================================================================
// API TYPES
// ============================================================================

export type ResolutionKind =
  | 'tests_passed'
  | 'build_passed'
  | 'lint_passed'
  | 'manual_only'
  | 'failed';

export interface RepoProfile {
  workspaceRoot?: string;
  workspaceType?: string;
  projectType?: string;
  languages?: string[];
  repoFamily?: string;
  sharedSignature?: string;
}

export interface BaselineSnapshot {
  successRate: number;
  medianTimeToResolutionMs: number | null;
  medianRetries: number | null;
  verificationPassRate: number;
  sampleSize: number;
}

export interface VerificationResults {
  verified: boolean;
  resolutionKind?: ResolutionKind;
  passedChecks?: string[];
  failedChecks?: string[];
}

export interface CognitiveUserSettings {
  userId: string;
  sharedLearningEnabled: boolean;
  benchmarkInclusionEnabled: boolean;
  traceRetentionDays: number;
  updatedAt: string;
}

export interface CognitivePrivacyExport {
  exportedAt: string;
  settings: CognitiveUserSettings;
  traces: CodingTrace[];
  applications: Array<{
    application: Record<string, unknown>;
    matches: Array<Record<string, unknown>>;
  }>;
  patterns: Pattern[];
  skills: SynthesizedSkill[];
  benchmarkRuns: Array<Record<string, unknown>>;
}

export interface CognitiveDataDeletionResult {
  deletedAt: string;
  tracesDeleted: number;
  applicationsDeleted: number;
  patternMatchesDeleted: number;
  applicationMatchesDeleted: number;
  localPatternsDeleted: number;
  localSkillsDeleted: number;
  benchmarkRunsDeleted: number;
  settingsDeleted: number;
  sharedLearningRevoked: boolean;
  globalPatternsRefreshed: number;
  globalSkillsRefreshed: number;
}

export interface StoreTraceRequest {
  sessionId: string;
  type: TraceType;
  problem: string;
  context: TraceContext;
  reasoning: string;
  approaches: Approach[];
  solution?: string;
  outcome: TraceOutcome;
  toolsUsed: string[];
  filesModified: string[];
  durationMs: number;
}

export interface StoreTraceResponse {
  trace: CodingTrace;
  matchedPatterns: Pattern[];
  suggestedApproaches: string[];
}

export interface GetRelevantTracesRequest {
  problem: string;
  context?: Partial<TraceContext>;
  limit?: number;
  adaptivePolicy?: boolean;
}

export interface GetRelevantTracesResponse {
  applicationId?: string;
  policy?: AdaptivePolicyRecommendation | null;
  workflow?: ToolWorkflowRecommendation | null;
  traces: CodingTrace[];
  patterns: Pattern[];
  skills: SynthesizedSkill[];
}

export interface RetrievalEvalFixture {
  applicationId?: string;
  sessionId?: string;
  endpoint?: string;
  problem: string;
  technologies?: string[];
  repoProfile?: RepoProfile;
  expectedTraceIds: string[];
  expectedPatternIds: string[];
  expectedSkillIds: string[];
  acceptedId?: string;
  expectedOutcome?: TraceOutcome;
  maxRetries?: number;
  targetResolutionKind?: ResolutionKind;
  baseline?: BaselineSnapshot;
}

export interface RetrievalEvalPrediction {
  applicationId?: string;
  sessionId?: string;
  policyKey?: AdaptivePolicyKey;
  policyContextKey?: string;
  workflowStrategyKey?: ToolWorkflowStrategyKey;
  workflowContextKey?: string;
  traces: Array<{ id: string }>;
  patterns: Array<{ id: string }>;
  skills: Array<{ id: string }>;
  finalOutcome?: TraceOutcome;
  acceptedTraceId?: string;
  acceptedPatternId?: string;
  acceptedSkillId?: string;
  retryCount?: number;
  timeToResolutionMs?: number;
  verificationResults?: VerificationResults;
}

export interface RetrievalEvalDatasetRecord {
  applicationId: string;
  sessionId: string;
  endpoint: string;
  labelSource: 'explicit' | 'weak';
  fixture: RetrievalEvalFixture;
  prediction: RetrievalEvalPrediction;
}

export interface RetrievalEvalDataset {
  fixtures: RetrievalEvalFixture[];
  predictions: RetrievalEvalPrediction[];
  records: RetrievalEvalDatasetRecord[];
}

export interface RetrievalEvalResult {
  traceMrr: number;
  patternRecallAtK: number;
  skillHitRate: number;
  weakOutcomeLift: number;
  successRate: number;
  retryDelta: number;
  timeToResolutionDelta: number;
  verificationCompletionRate: number;
  cases: number;
}

export interface BenchmarkGateThresholds {
  minTraceMrr?: number;
  minPatternRecallAtK?: number;
  minSkillHitRate?: number;
  minWeakOutcomeLift?: number;
  minSuccessRate?: number;
  minVerificationCompletionRate?: number;
  maxTraceMrrRegression?: number;
  maxPatternRecallAtKRegression?: number;
  maxSkillHitRateRegression?: number;
  maxWeakOutcomeLiftRegression?: number;
  maxSuccessRateRegression?: number;
  maxVerificationCompletionRateRegression?: number;
  maxRetryDeltaRegression?: number;
  maxTimeToResolutionDeltaRegressionMs?: number;
}

export interface BenchmarkGateResult {
  passed: boolean;
  reasons: string[];
}

export interface PatternFeedbackRequest {
  patternId: string;
  traceId: string;
  outcome: 'success' | 'failure';
  notes?: string;
}

export interface SynthesizeSkillRequest {
  patternId: string;
  name?: string;
  publish?: boolean;
}

// ============================================================================
// CONFIG TYPES
// ============================================================================

export interface CognitiveEngineConfig {
  apiKey: string;
  baseUrl?: string;
  
  // Trace capture
  captureEnabled: boolean;
  sanitizeSecrets: boolean;
  minTraceDurationMs?: number;  // Don't capture trivial operations
  
  // Pattern extraction
  patternExtractionEnabled: boolean;
  minTracesForPattern: number;  // Default: 3
  minSuccessRateForPattern: number; // Default: 0.7
  
  // Skill synthesis
  skillSynthesisEnabled: boolean;
  minPatternsForSkill: number;  // Default: 5
  minSuccessRateForSkill: number; // Default: 0.8
  autoPublishToClawHub: boolean;
  
  // Context injection
  injectRelevantTraces: boolean;
  injectPatterns: boolean;
  adaptivePolicyEnabled?: boolean;
  maxInjectedTraces: number;    // Default: 5
  maxInjectedPatterns: number;  // Default: 3
}
