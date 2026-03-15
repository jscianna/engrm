/**
 * Collective Intelligence — Anonymizer
 *
 * PARANOID security layer. Strips ALL identifying information from traces.
 * When in doubt, strip it out.
 */

import type { TraceData, SharedSignal } from "./types.js";

// Patterns that indicate sensitive content
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

// URL pattern
const URL_PATTERN = /https?:\/\/[^\s"'`),]+/gi;

// File path patterns (both Unix and Windows)
const PATH_PATTERNS = [
  /(?:\/[\w.-]+){2,}/g,           // Unix paths: /foo/bar/baz
  /(?:[A-Z]:\\[\w.-]+){1,}/gi,    // Windows: C:\foo\bar
  /(?:\.\.?\/[\w.-]+)+/g,         // Relative: ./foo/bar, ../foo
  /~\/[\w.-/]+/g,                 // Home-relative: ~/foo/bar
];

// Common project-specific identifiers
const PROJECT_SPECIFIC_PATTERNS = [
  /\b[A-Z][a-z]+(?:[A-Z][a-z]+){2,}\b/g,  // Multi-word PascalCase (likely custom class names)
  /\b(?:my|our|the)[A-Z]\w+\b/g,           // myFooBar, ourService, etc.
];

// Generic replacements for file categories
const FILE_CATEGORY_MAP: Record<string, string> = {
  ".tsx": "component file",
  ".jsx": "component file",
  ".ts": "source file",
  ".js": "source file",
  ".css": "style file",
  ".scss": "style file",
  ".html": "template file",
  ".json": "config file",
  ".yaml": "config file",
  ".yml": "config file",
  ".sql": "database file",
  ".py": "source file",
  ".go": "source file",
  ".rs": "source file",
  ".java": "source file",
  ".rb": "source file",
  ".env": "environment file",
};

// Known error type patterns to preserve
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

// Known frameworks to detect
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

/**
 * Anonymize a trace into a SharedSignal.
 * Returns null if the trace can't be safely anonymized.
 */
export function anonymizeTrace(trace: TraceData): SharedSignal | null {
  // Extract error type
  const errorType = extractErrorType(trace);
  if (!errorType) {
    return null;  // No clear error type = too project-specific
  }

  // Detect framework
  const framework = detectFramework(trace);

  // Anonymize error message
  const rawErrorMessage = trace.context.errorMessages?.[0] ?? trace.problem;
  const errorMessage = anonymizeText(rawErrorMessage);
  if (!errorMessage || errorMessage.length < 10) {
    return null;  // Too little info after anonymization
  }

  // Anonymize resolution
  const rawResolution = trace.solution ?? trace.reasoning;
  const resolution = anonymizeText(rawResolution);
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

  // Final safety check
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
  const allText = [
    signal.errorType,
    signal.errorMessage,
    signal.framework,
    signal.resolution,
  ].join(" ");

  // Reject if any path separators remain
  if (/[/\\]/.test(signal.errorMessage) || /[/\\]/.test(signal.resolution)) {
    return false;
  }

  // Reject if any URLs remain
  if (URL_PATTERN.test(allText)) {
    return false;
  }

  // Reject if common secret patterns exist
  if (SECRET_PATTERNS.some((pattern) => pattern.test(allText))) {
    return false;
  }

  // Reject if IP addresses remain
  if (/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(allText)) {
    return false;
  }

  // Reject if email-like patterns remain
  if (/\b[\w.-]+@[\w.-]+\.\w+\b/.test(allText)) {
    return false;
  }

  return true;
}

// --- Internal helpers ---

function extractErrorType(trace: TraceData): string | null {
  const allText = [
    trace.problem,
    ...(trace.context.errorMessages ?? []),
  ].join(" ");

  for (const errorType of KNOWN_ERROR_TYPES) {
    if (allText.includes(errorType)) {
      return errorType;
    }
  }

  // Try to extract from error messages
  const match = allText.match(/\b([A-Z][a-zA-Z]*Error)\b/);
  if (match) {
    return match[1];
  }

  // Check for common error patterns
  if (/hydration/i.test(allText)) return "hydration-mismatch";
  if (/cannot find module/i.test(allText)) return "MODULE_NOT_FOUND";
  if (/type\s*['"]?\w+['"]?\s+is not assignable/i.test(allText)) return "TypeError";
  if (/property\s*['"]?\w+['"]?\s+does not exist/i.test(allText)) return "TypeError";

  return null;
}

function detectFramework(trace: TraceData): string {
  const allText = [
    trace.problem,
    trace.reasoning,
    ...trace.context.technologies,
    ...(trace.context.errorMessages ?? []),
  ].join(" ");

  for (const [framework, pattern] of Object.entries(FRAMEWORK_MAP)) {
    if (pattern.test(allText)) {
      return framework;
    }
  }

  // Check technologies array directly
  for (const tech of trace.context.technologies) {
    const normalized = tech.toLowerCase();
    if (FRAMEWORK_MAP[normalized]) {
      return normalized;
    }
  }

  return "";
}

function anonymizeText(text: string): string {
  if (!text) return "";

  let sanitized = text;

  // Remove URLs
  sanitized = sanitized.replace(URL_PATTERN, "[URL]");

  // Remove file paths
  for (const pattern of PATH_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      // Try to categorize the file
      for (const [ext, category] of Object.entries(FILE_CATEGORY_MAP)) {
        if (match.endsWith(ext)) {
          return category;
        }
      }
      return "file";
    });
  }

  // Remove string literals (single/double quoted, backtick)
  sanitized = sanitized.replace(/"[^"]{10,}"/g, '"[string]"');
  sanitized = sanitized.replace(/'[^']{10,}'/g, "'[string]'");
  sanitized = sanitized.replace(/`[^`]{10,}`/g, "`[string]`");

  // Remove common secrets
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }

  // Remove IP addresses
  sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[IP]");

  // Remove email-like patterns
  sanitized = sanitized.replace(/\b[\w.-]+@[\w.-]+\.\w+\b/g, "[EMAIL]");

  // Remove project-specific identifiers
  for (const pattern of PROJECT_SPECIFIC_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[identifier]");
  }

  // Clean up excess whitespace
  sanitized = sanitized.replace(/\s+/g, " ").trim();

  return sanitized;
}
