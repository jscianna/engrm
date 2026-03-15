/**
 * User DNA Analyzer
 *
 * Heuristic-based session analysis to extract behavioral signals.
 * No LLM calls — lightweight pattern matching only.
 */

import type { UserDNA, SessionAnalysisInput, SessionSignals } from "./types.js";

const TEST_KEYWORDS = [
  "test", "tests", "testing", "spec", "specs", "jest", "vitest",
  "pytest", "mocha", "cypress", "playwright", "coverage", "assert",
  "expect", "describe", "it(", "test(", "unit test", "integration test",
];

const TYPE_CHECK_KEYWORDS = [
  "typescript", "type", "types", "interface", "tsc", "strict",
  "noEmit", "typecheck", "type-check", "generics", "typed",
];

const OVERRIDE_KEYWORDS = [
  "no", "wrong", "instead", "actually", "don't", "not that",
  "that's not", "incorrect", "change it", "different", "undo",
  "revert", "go back", "try again", "not what i",
];

const REFACTOR_KEYWORDS = [
  "refactor", "cleanup", "clean up", "reorganize", "restructure",
  "simplify", "extract", "decouple", "dry", "deduplicate",
  "consolidate", "rename", "move", "split",
];

const IMPERATIVE_STARTS = [
  "add", "create", "make", "build", "fix", "update", "remove",
  "delete", "change", "implement", "write", "set", "configure",
  "install", "run", "deploy", "move", "rename", "refactor",
];

const FOCUS_MAP: Record<string, string[]> = {
  backend: [".ts", ".js", "server", "api", "route", "controller", "service", "middleware"],
  frontend: [".tsx", ".jsx", ".css", ".scss", ".html", "component", "page", "layout"],
  database: [".sql", "migration", "schema", "query", "db", "prisma", "drizzle", "turso"],
  devops: ["docker", "compose", ".yml", ".yaml", "ci", "deploy", "nginx", "terraform"],
  testing: [".test.", ".spec.", "__tests__", "cypress", "playwright"],
  api: ["route.ts", "endpoint", "handler", "middleware", "api/"],
};

const PATTERN_INDICATORS: Record<string, RegExp[]> = {
  "barrel-exports": [/index\.ts/, /export \* from/, /export \{/],
  "collocated-tests": [/\.test\.ts/, /\.spec\.ts/],
  "functional-style": [/=>/, /\.map\(/, /\.filter\(/, /\.reduce\(/],
  "early-returns": [/if\s*\(.*\)\s*return/, /guard clause/i],
};

/**
 * Analyze a single session to extract behavioral signals.
 */
export function analyzeSession(params: SessionAnalysisInput): SessionSignals {
  const userMessages = params.messages.filter((m) => m.role === "user");
  const allText = userMessages.map((m) => m.content).join(" ").toLowerCase();
  const userMessageCount = userMessages.length;

  // Message length analysis
  const totalLength = userMessages.reduce((sum, m) => sum + m.content.length, 0);
  const avgMessageLength = userMessageCount > 0 ? totalLength / userMessageCount : 0;

  // Question vs command detection
  let questions = 0;
  let commands = 0;
  for (const msg of userMessages) {
    const trimmed = msg.content.trim();
    if (trimmed.includes("?")) {
      questions++;
    }
    const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase() ?? "";
    if (IMPERATIVE_STARTS.includes(firstWord)) {
      commands++;
    }
  }
  const questionRatio = userMessageCount > 0 ? questions / userMessageCount : 0;
  const commandRatio = userMessageCount > 0 ? commands / userMessageCount : 0;

  // Session duration
  const sessionMinutes = Math.max(0, params.sessionDurationMs / (1000 * 60));

  // Focus areas from files and content
  const focusAreas = detectFocusAreas(params.filesModified ?? [], allText);

  // Active hours from timestamps
  const activeHours: number[] = [];
  for (const msg of userMessages) {
    if (msg.timestamp) {
      try {
        const hour = new Date(msg.timestamp).getHours();
        if (!activeHours.includes(hour)) {
          activeHours.push(hour);
        }
      } catch {
        // Ignore invalid timestamps
      }
    }
  }

  // Quality signals
  const testSignal = computeKeywordSignal(allText, TEST_KEYWORDS);
  const typeCheckSignal = computeKeywordSignal(allText, TYPE_CHECK_KEYWORDS);
  const overrideSignal = computeKeywordSignal(allText, OVERRIDE_KEYWORDS);
  const refactorSignal = computeKeywordSignal(allText, REFACTOR_KEYWORDS);

  // Naming convention signals
  const namingSignals = detectNamingConventions(allText, params.filesModified ?? []);

  // Pattern and avoid signals
  const patternSignals = detectPreferredPatterns(allText, params.filesModified ?? []);
  const avoidSignals = detectAvoidPatterns(userMessages);

  return {
    avgMessageLength,
    userMessageCount,
    questionRatio,
    commandRatio,
    sessionMinutes,
    focusAreas,
    activeHours,
    testSignal,
    typeCheckSignal,
    overrideSignal,
    refactorSignal,
    namingSignals,
    patternSignals,
    avoidSignals,
  };
}

/**
 * Merge new session signals into existing User DNA using exponential moving average.
 * alpha=0.3: new session = 30% weight, history = 70%.
 */
export function mergeSignals(existing: UserDNA, newSignals: SessionSignals): UserDNA {
  const alpha = 0.3;
  const sessionCount = existing.sessionCount + 1;

  // Confidence increases asymptotically toward 1.0
  const bumpConfidence = (current: number): number => {
    return current + (1 - current) * 0.15;
  };

  // Communication
  const newVerbosity = classifyVerbosity(newSignals.avgMessageLength);
  const newStyle = classifyStyle(newSignals.questionRatio, newSignals.commandRatio);
  const newResponseLength = classifyResponseLength(newSignals.avgMessageLength);
  const communication = {
    verbosity: existing.confidence.communication > 0.1
      ? emaCategory(existing.communication.verbosity, newVerbosity, alpha) as UserDNA["communication"]["verbosity"]
      : newVerbosity,
    style: existing.confidence.communication > 0.1
      ? emaCategory(existing.communication.style, newStyle, alpha) as UserDNA["communication"]["style"]
      : newStyle,
    preferredResponseLength: existing.confidence.communication > 0.1
      ? emaCategory(existing.communication.preferredResponseLength, newResponseLength, alpha) as UserDNA["communication"]["preferredResponseLength"]
      : newResponseLength,
  };

  // Work patterns
  const avgMinutes = ema(existing.workPatterns.averageSessionMinutes, newSignals.sessionMinutes, alpha);
  const workPatterns = {
    averageSessionMinutes: Math.round(avgMinutes * 10) / 10,
    sessionType: classifySessionType(avgMinutes) as UserDNA["workPatterns"]["sessionType"],
    primaryFocus: mergeFocusAreas(existing.workPatterns.primaryFocus, newSignals.focusAreas),
    peakHours: mergeArrayUnique(existing.workPatterns.peakHours, newSignals.activeHours).slice(0, 6),
  };

  // Quality signals
  const qualitySignals = {
    requestsTests: ema(existing.qualitySignals.requestsTests, newSignals.testSignal, alpha),
    requestsTypeChecking: ema(existing.qualitySignals.requestsTypeChecking, newSignals.typeCheckSignal, alpha),
    overrideRate: ema(existing.qualitySignals.overrideRate, newSignals.overrideSignal, alpha),
    refactorFrequency: ema(existing.qualitySignals.refactorFrequency, newSignals.refactorSignal, alpha),
  };

  // Conventions
  const totalNaming = newSignals.namingSignals.camelCase + newSignals.namingSignals.snake_case;
  const newNamingStyle: UserDNA["conventions"]["namingStyle"] = totalNaming === 0
    ? existing.conventions.namingStyle
    : newSignals.namingSignals.camelCase > newSignals.namingSignals.snake_case * 2
      ? "camelCase"
      : newSignals.namingSignals.snake_case > newSignals.namingSignals.camelCase * 2
        ? "snake_case"
        : "mixed";
  const conventions = {
    namingStyle: existing.confidence.conventions > 0.1
      ? emaCategory(existing.conventions.namingStyle, newNamingStyle, alpha) as UserDNA["conventions"]["namingStyle"]
      : newNamingStyle,
    preferredPatterns: mergeStringArrayWeighted(existing.conventions.preferredPatterns, newSignals.patternSignals, 8),
    avoidPatterns: mergeStringArrayWeighted(existing.conventions.avoidPatterns, newSignals.avoidSignals, 5),
  };

  // Confidence
  const confidence = {
    communication: bumpConfidence(existing.confidence.communication),
    workPatterns: bumpConfidence(existing.confidence.workPatterns),
    qualitySignals: bumpConfidence(existing.confidence.qualitySignals),
    conventions: bumpConfidence(existing.confidence.conventions),
  };

  const dna: UserDNA = {
    ...existing,
    updatedAt: new Date().toISOString(),
    sessionCount,
    communication,
    workPatterns,
    qualitySignals,
    conventions,
    confidence,
  };

  // Only update directives when confidence is meaningful
  const minConfidence = Math.min(confidence.communication, confidence.workPatterns, confidence.qualitySignals);
  if (minConfidence > 0.3) {
    dna.agentDirectives = generateDirectives(dna);
  }

  return dna;
}

/**
 * Generate agent tuning directives from the profile.
 * Max 5 directives, most impactful only.
 */
export function generateDirectives(dna: UserDNA): string[] {
  const directives: Array<{ text: string; priority: number }> = [];

  // Communication style
  if (dna.communication.verbosity === "terse") {
    directives.push({ text: "Be concise. Skip explanations unless asked.", priority: 9 });
  } else if (dna.communication.verbosity === "detailed") {
    directives.push({ text: "Provide detailed explanations with context.", priority: 7 });
  }

  // Quality signals
  if (dna.qualitySignals.requestsTests > 0.7) {
    directives.push({ text: "Include tests with all implementations.", priority: 8 });
  }

  if (dna.qualitySignals.overrideRate > 0.5) {
    directives.push({
      text: "Present options before implementing. This user often has a specific approach in mind.",
      priority: 8,
    });
  }

  if (dna.qualitySignals.refactorFrequency > 0.6) {
    directives.push({ text: "Suggest cleanup opportunities proactively.", priority: 6 });
  }

  if (dna.qualitySignals.requestsTypeChecking > 0.7) {
    directives.push({ text: "Use strict TypeScript types. Avoid `any`.", priority: 7 });
  }

  // Conventions
  if (dna.conventions.namingStyle === "snake_case") {
    directives.push({ text: "Use snake_case for variable names.", priority: 5 });
  } else if (dna.conventions.namingStyle === "camelCase") {
    directives.push({ text: "Use camelCase for variable names.", priority: 5 });
  }

  // Communication style
  if (dna.communication.style === "commands") {
    directives.push({ text: "Execute directly without asking for confirmation on routine changes.", priority: 6 });
  } else if (dna.communication.style === "collaborative") {
    directives.push({ text: "Discuss approach before implementing.", priority: 6 });
  }

  // Sort by priority and take top 5
  return directives
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5)
    .map((d) => d.text);
}

// --- Internal helpers ---

function ema(current: number, incoming: number, alpha: number): number {
  return Math.round((alpha * incoming + (1 - alpha) * current) * 1000) / 1000;
}

function emaCategory(current: string, incoming: string, alpha: number): string {
  // For categorical: if new signal matches, keep it; otherwise stay with current
  // Only switch if the alpha weight tips it (simulated by random threshold based on alpha)
  return incoming === current ? current : (alpha > 0.25 ? incoming : current);
}

function classifyVerbosity(avgLength: number): UserDNA["communication"]["verbosity"] {
  if (avgLength < 60) return "terse";
  if (avgLength > 200) return "detailed";
  return "balanced";
}

function classifyStyle(questionRatio: number, commandRatio: number): UserDNA["communication"]["style"] {
  if (commandRatio > 0.6) return "commands";
  if (questionRatio > 0.5) return "questions";
  return "collaborative";
}

function classifyResponseLength(avgLength: number): UserDNA["communication"]["preferredResponseLength"] {
  if (avgLength < 40) return "short";
  if (avgLength > 150) return "long";
  return "medium";
}

function classifySessionType(avgMinutes: number): string {
  if (avgMinutes < 10) return "quick-fixes";
  if (avgMinutes > 30) return "deep-sessions";
  return "mixed";
}

function computeKeywordSignal(text: string, keywords: string[]): number {
  const matches = keywords.filter((kw) => text.includes(kw)).length;
  // Normalize: 0 matches = 0, 3+ matches = ~1.0
  return Math.min(1, matches / 3);
}

function detectFocusAreas(files: string[], text: string): string[] {
  const scores = new Map<string, number>();
  for (const [area, indicators] of Object.entries(FOCUS_MAP)) {
    let score = 0;
    for (const indicator of indicators) {
      if (files.some((f) => f.toLowerCase().includes(indicator))) score += 2;
      if (text.includes(indicator)) score += 1;
    }
    if (score > 0) scores.set(area, score);
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([area]) => area);
}

function detectNamingConventions(text: string, files: string[]): { camelCase: number; snake_case: number } {
  const combined = text + " " + files.join(" ");
  const camelMatches = combined.match(/[a-z][a-zA-Z]+[A-Z][a-zA-Z]*/g) ?? [];
  const snakeMatches = combined.match(/[a-z]+_[a-z]+/g) ?? [];
  return {
    camelCase: camelMatches.length,
    snake_case: snakeMatches.length,
  };
}

function detectPreferredPatterns(text: string, files: string[]): string[] {
  const detected: string[] = [];
  const combined = text + " " + files.join(" ");
  for (const [pattern, indicators] of Object.entries(PATTERN_INDICATORS)) {
    if (indicators.some((re) => re.test(combined))) {
      detected.push(pattern);
    }
  }
  return detected;
}

function detectAvoidPatterns(userMessages: Array<{ role: string; content: string }>): string[] {
  const avoidPhrases: string[] = [];
  for (const msg of userMessages) {
    const lower = msg.content.toLowerCase();
    // Detect "don't use X" or "avoid X" patterns
    const dontMatch = lower.match(/(?:don't|do not|never|avoid|stop)\s+(?:use|using|do|doing)\s+(\w+(?:\s+\w+)?)/g);
    if (dontMatch) {
      for (const match of dontMatch) {
        const cleaned = match.replace(/^(?:don't|do not|never|avoid|stop)\s+(?:use|using|do|doing)\s+/, "").trim();
        if (cleaned.length > 2 && cleaned.length < 40) {
          avoidPhrases.push(cleaned);
        }
      }
    }
  }
  return [...new Set(avoidPhrases)].slice(0, 5);
}

function mergeFocusAreas(existing: string[], incoming: string[]): string[] {
  const merged = new Map<string, number>();
  for (const area of existing) {
    merged.set(area, (merged.get(area) ?? 0) + 2);
  }
  for (const area of incoming) {
    merged.set(area, (merged.get(area) ?? 0) + 1);
  }
  return [...merged.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([area]) => area);
}

function mergeArrayUnique<T>(existing: T[], incoming: T[]): T[] {
  return [...new Set([...existing, ...incoming])];
}

function mergeStringArrayWeighted(existing: string[], incoming: string[], maxSize: number): string[] {
  const merged = [...new Set([...incoming, ...existing])];
  return merged.slice(0, maxSize);
}
