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

export type PatternStatus = 'candidate' | 'active' | 'synthesized' | 'deprecated';

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

export type SkillStatus = 'draft' | 'testing' | 'published' | 'deprecated' | 'removed';

// ============================================================================
// API TYPES
// ============================================================================

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
}

export interface GetRelevantTracesResponse {
  traces: CodingTrace[];
  patterns: Pattern[];
  skills: SynthesizedSkill[];
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
  maxInjectedTraces: number;    // Default: 5
  maxInjectedPatterns: number;  // Default: 3
}
