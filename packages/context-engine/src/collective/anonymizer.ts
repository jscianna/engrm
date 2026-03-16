/**
 * Collective Intelligence — Anonymizer
 *
 * Two-phase anonymization:
 *   Phase 1 — deterministic strip of always-dangerous patterns (URLs, IPs, emails, secrets)
 *   Phase 2 — frequency-based generalization via TokenFrequencyTracker
 *
 * Research finding (Exp 3): frequency-based generalization outperforms
 * strip-everything in diverse multi-project environments (0.649 vs 0.608
 * matching accuracy, 3× better privacy preservation).
 */

import type { TraceData, SharedSignal } from "./types.js";

// ─── Phase 1 patterns (always strip) ────────────────────────────────────────

const SECRET_PATTERNS = [
  /\bkey\b/i,
  /\btoken\b/i,
  /\bpassword\b/i,
  /\bsecret\b/i,
  /\bcredential/i,
  /\bauth\b/i,
  /\bbearer\b/i,
  /\bapi[_-]?key/i,
  /sk-[a-zA-Z0-9]{10,}/,
  /ghp_[a-zA-Z0-9]{10,}/,
  /AKIA[A-Z0-9]{12,}/,
];

const URL_PATTERN = /https?:\/\/[^\s"'`),]+/gi;

// ─── Phase 2: Frequency-based generalization ────────────────────────────────

/** Tokens that appear fewer than this many times across all traces → [RARE_TOKEN] */
export const FREQUENCY_THRESHOLD = 5;

/**
 * ~50 common programming terms that should never be generalized regardless
 * of how rarely they appear in the accumulated trace set.
 */
export const PRESERVED_TOKENS = new Set([
  // JS/TS keywords
  "const", "let", "var", "function", "class", "interface", "type",
  "import", "export", "return", "async", "await", "try", "catch",
  "throw", "new", "null", "undefined", "true", "false", "typeof",
  "instanceof", "extends", "implements", "void", "this", "super",
  "static", "private", "public", "protected", "readonly", "abstract",
  "if", "else", "for", "while", "switch", "case", "break", "continue",
  "default", "do", "in", "of", "from", "as",
  // HTTP methods
  "get", "post", "put", "delete", "patch", "head", "options",
  // Common HTTP status codes (as strings)
  "200", "201", "400", "401", "403", "404", "500", "502", "503",
  // Common error properties
  "message", "stack", "name", "code", "status", "statuscode", "errno",
  "error", "errors", "warning", "info", "debug",
  // Common programming terms
  "string", "number", "boolean", "object", "array", "promise",
  "resolve", "reject", "then", "finally",
  "index", "length", "size", "count", "total",
  "data", "result", "response", "request", "config",
]);

/**
 * Accumulates token frequencies across all processed traces.
 * Singleton instance — resets on engine restart, which is fine
 * because it warms up quickly after a few dozen traces.
 */
export class TokenFrequencyTracker {
  private counts: Map<string, number> = new Map();
  readonly k: number;

  constructor(k: number = FREQUENCY_THRESHOLD) {
    this.k = k;
  }

  /** Increment the frequency count for a token (case-insensitive). */
  track(token: string): void {
    const normalized = token.toLowerCase().trim();
    if (normalized.length === 0) return;
    this.counts.set(normalized, (this.counts.get(normalized) ?? 0) + 1);
  }

  /**
   * Returns true if a token has appeared fewer than k times AND is not
   * in the PRESERVED_TOKENS set.
   */
  is_rare(token: string): boolean {
    const normalized = token.toLowerCase().trim();
    if (PRESERVED_TOKENS.has(normalized)) return false;
    return (this.counts.get(normalized) ?? 0) < this.k;
  }

  /**
   * Walk whitespace-separated words in `text`.
   * For each word, split on common delimiters to get sub-tokens and check
   * whether every sub-token is rare (and none is in PRESERVED_TOKENS).
   * Rare words are replaced with [RARE_TOKEN]; others are left intact.
   */
  generalize(text: string): string {
    return text.replace(/\S+/g, (word) => {
      // Extract sub-tokens by splitting on common delimiters
      const sub_tokens = word.split(/[/\\.:=]+/).filter(t => t.length > 0);
      if (sub_tokens.length === 0) return word;

      // If any sub-token is explicitly preserved, keep the whole word
      if (sub_tokens.some(t => PRESERVED_TOKENS.has(t.toLowerCase()))) {
        return word;
      }

      // Replace the whole word only if every sub-token is rare
      if (sub_tokens.every(t => this.is_rare(t))) {
        return "[RARE_TOKEN]";
      }

      return word;
    });
  }
}

/** Module-level singleton — accumulates frequencies across the process lifetime. */
export const token_tracker = new TokenFrequencyTracker();

// ─── Known error types / frameworks (preserved by Phase 1 extraction) ───────

const KNOWN_ERROR_TYPES = [
  "TypeError",
  "ReferenceError",
  "SyntaxError",
  "RangeError",
  "EvalError",
  "URIError",
  "Error",
  "SQLITE_ERROR",
  "SQLITE_CONSTRAINT",
  "SQLITE_BUSY",
  "SQLITE_LOCKED",
  "ENOENT",
  "EACCES",
  "EPERM",
  "ECONNREFUSED",
  "EADDRINUSE",
  "MODULE_NOT_FOUND",
  "ERR_MODULE_NOT_FOUND",
];

const FRAMEWORK_MAP: Record<string, RegExp> = {
  "next.js": /\bnext\.?js\b|\bapp\s+router\b|\bgetServerSideProps\b/i,
  "react": /\breact\b|\buseState\b|\buseEffect\b|\bjsx\b/i,
  "express": /\bexpress\b|\bapp\.get\b|\bapp\.post\b|\bmiddleware\b/i,
  "node.js": /\bnode\b|\brequire\b|\bprocess\b/i,
  "typescript": /\btypescript\b|\btsc\b|\b\.tsx?\b/i,
  "python": /\bpython\b|\bpip\b|\bdjango\b|\bflask\b/i,
  "docker": /\bdocker\b|\bcontainer\b|\bcompose\b/i,
  "sqlite": /\bsqlite\b|\blibsql\b|\bturso\b/i,
  "postgres": /\bpostgres\b|\bpsql\b|\bpg_\b/i,
  "prisma": /\bprisma\b/i,
  "drizzle": /\bdrizzle\b/i,
  "vite": /\bvite\b/i,
  "webpack": /\bwebpack\b/i,
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Anonymize a trace into a SharedSignal.
 * Returns null if the trace cannot be safely anonymized.
 *
 * Pipeline:
 *   1. Extract error type + framework (needed for signal metadata)
 *   2. anonymizeText() — phase 1 strip + phase 2 frequency-generalize
 *   3. isShareSafe() — final paranoid safety check
 */
export function anonymizeTrace(trace: TraceData): SharedSignal | null {
  const errorType = extractErrorType(trace);
  if (!errorType) {
    return null; // No clear error type = too project-specific
  }

  const framework = detectFramework(trace);

  const raw_error_message = trace.context.errorMessages?.[0] ?? trace.problem;
  const errorMessage = anonymizeText(raw_error_message);
  if (!errorMessage || errorMessage.length < 10) {
    return null;
  }

  const raw_resolution = trace.solution ?? trace.reasoning;
  const resolution = anonymizeText(raw_resolution);
  if (!resolution || resolution.length < 10) {
    return null;
  }

  const signal: SharedSignal = {
    errorType,
    errorMessage: errorMessage.slice(0, 300),
    framework,
    resolution: resolution.slice(0, 500),
    success: trace.outcome === "success",
    attemptsBeforeFix: Math.max(1, trace.retryCount),
  };

  // Final safety net — reject anything that still looks suspicious
  if (!isShareSafe(signal)) {
    return null;
  }

  return signal;
}

/**
 * Double-check that nothing leaked through anonymization.
 * PARANOID: reject anything that looks even slightly suspicious.
 */
export function isShareSafe(signal: SharedSignal): boolean {
  const all_text = [
    signal.errorType,
    signal.errorMessage,
    signal.framework,
    signal.resolution,
  ].join(" ");

  // Reject if any path separators remain in the sensitive fields
  if (/[/\\]/.test(signal.errorMessage) || /[/\\]/.test(signal.resolution)) {
    return false;
  }

  // Reject if any URLs remain
  if (URL_PATTERN.test(all_text)) {
    return false;
  }

  // Reject if common secret patterns exist
  if (SECRET_PATTERNS.some((pattern) => pattern.test(all_text))) {
    return false;
  }

  // Reject if IP addresses remain
  if (/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(all_text)) {
    return false;
  }

  // Reject if email-like patterns remain
  if (/\b[\w.-]+@[\w.-]+\.\w+\b/.test(all_text)) {
    return false;
  }

  return true;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function extractErrorType(trace: TraceData): string | null {
  const all_text = [
    trace.problem,
    ...(trace.context.errorMessages ?? []),
  ].join(" ");

  for (const errorType of KNOWN_ERROR_TYPES) {
    if (all_text.includes(errorType)) {
      return errorType;
    }
  }

  const match = all_text.match(/\b([A-Z][a-zA-Z]*Error)\b/);
  if (match) {
    return match[1];
  }

  if (/hydration/i.test(all_text)) return "hydration-mismatch";
  if (/cannot find module/i.test(all_text)) return "MODULE_NOT_FOUND";
  if (/type\s*['"]?\w+['"]?\s+is not assignable/i.test(all_text)) return "TypeError";
  if (/property\s*['"]?\w+['"]?\s+does not exist/i.test(all_text)) return "TypeError";

  return null;
}

function detectFramework(trace: TraceData): string {
  const all_text = [
    trace.problem,
    trace.reasoning,
    ...trace.context.technologies,
    ...(trace.context.errorMessages ?? []),
  ].join(" ");

  for (const [framework, pattern] of Object.entries(FRAMEWORK_MAP)) {
    if (pattern.test(all_text)) {
      return framework;
    }
  }

  for (const tech of trace.context.technologies) {
    const normalized = tech.toLowerCase();
    if (FRAMEWORK_MAP[normalized]) {
      return normalized;
    }
  }

  return "";
}

/**
 * Two-phase text anonymization.
 *
 * Phase 1: Deterministically strip always-dangerous patterns.
 * Phase 2: Track token frequencies, then generalize rare tokens via
 *          the module-level token_tracker singleton.
 */
function anonymizeText(text: string): string {
  if (!text) return "";

  let sanitized = text;

  // ── Phase 1: Always strip dangerous patterns ──────────────────────────────

  // URLs
  sanitized = sanitized.replace(URL_PATTERN, "[URL]");

  // IP addresses
  sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[IP]");

  // Email addresses
  sanitized = sanitized.replace(/\b[\w.-]+@[\w.-]+\.\w+\b/g, "[EMAIL]");

  // Secrets / API keys
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }

  // ── Phase 2: Frequency-based generalization ───────────────────────────────

  // Track all sub-tokens from this text so the tracker accumulates frequency
  // data across the lifetime of the process.
  const raw_tokens = sanitized.split(/[\s/\\.:=]+/).filter(t => t.length > 0);
  for (const t of raw_tokens) {
    token_tracker.track(t);
  }

  // Replace rare tokens with [RARE_TOKEN]
  sanitized = token_tracker.generalize(sanitized);

  // Clean up excess whitespace
  sanitized = sanitized.replace(/\s+/g, " ").trim();

  return sanitized;
}
