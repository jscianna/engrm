/**
 * User DNA — Automatic Behavioral Profiling Types
 *
 * Represents a user's behavioral profile built from session analysis.
 * No LLM calls — pure heuristics.
 */

export interface UserDNA {
  version: 1;
  userId: string;
  updatedAt: string;
  sessionCount: number;

  communication: {
    verbosity: "terse" | "balanced" | "detailed";
    style: "commands" | "questions" | "collaborative";
    preferredResponseLength: "short" | "medium" | "long";
  };

  workPatterns: {
    averageSessionMinutes: number;
    sessionType: "quick-fixes" | "mixed" | "deep-sessions";
    primaryFocus: string[];
    peakHours: number[];
  };

  qualitySignals: {
    requestsTests: number;
    requestsTypeChecking: number;
    overrideRate: number;
    refactorFrequency: number;
  };

  conventions: {
    namingStyle: "camelCase" | "snake_case" | "mixed";
    preferredPatterns: string[];
    avoidPatterns: string[];
  };

  agentDirectives: string[];

  confidence: {
    communication: number;
    workPatterns: number;
    qualitySignals: number;
    conventions: number;
  };
}

export interface SessionAnalysisInput {
  messages: Array<{
    role: string;
    content: string;
    timestamp?: string;
  }>;
  sessionDurationMs: number;
  filesModified?: string[];
  toolsUsed?: string[];
}

export interface SessionSignals {
  /** Average user message length in characters */
  avgMessageLength: number;
  /** Total user messages in session */
  userMessageCount: number;
  /** Fraction of user messages that are questions (0-1) */
  questionRatio: number;
  /** Fraction of user messages that are imperative commands (0-1) */
  commandRatio: number;
  /** Session duration in minutes */
  sessionMinutes: number;
  /** Detected focus areas from file paths and content */
  focusAreas: string[];
  /** Hours of day when messages were sent */
  activeHours: number[];
  /** Test-related signal strength (0-1) */
  testSignal: number;
  /** Type-checking signal strength (0-1) */
  typeCheckSignal: number;
  /** Override/rejection signal strength (0-1) */
  overrideSignal: number;
  /** Refactoring signal strength (0-1) */
  refactorSignal: number;
  /** Detected naming conventions */
  namingSignals: {
    camelCase: number;
    snake_case: number;
  };
  /** Detected pattern preferences */
  patternSignals: string[];
  /** Detected avoid patterns from corrections */
  avoidSignals: string[];
}
