/**
 * Content filtering utilities
 */

// Patterns that indicate prompt injection attempts
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|prompts?)/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /new\s+instructions?:/i,
  /system\s*:\s*you\s+are/i,
  /\[system\]/i,
  /<\/?system>/i,
  /pretend\s+you\s+are/i,
  /act\s+as\s+(if\s+)?you\s+are/i,
  /jailbreak/i,
  /ignore\s+your\s+programming/i,
  /override\s+(your\s+)?(rules?|instructions?)/i,
];

// Patterns that indicate low-value content (noise)
const NOISE_PATTERNS = [
  /^```[\s\S]{0,50}```$/,  // Very short code blocks
  /^\s*$/,                   // Empty/whitespace
  /^(ok|okay|thanks|thx|ty|np|no problem|sure|yep|yes|no|maybe)\.?$/i,
  /^[👍👎🎉✅❌🔥💯]+$/,      // Just emoji
  /^\d+$/,                   // Just numbers
  /^https?:\/\/\S+$/,       // Just URLs
];

// Patterns that indicate terminal/error output or tool result confirmations
const TERMINAL_PATTERNS = [
  /npm (ERR!|WARN)/,
  /error:\s*\w+Error/i,
  /at\s+\w+\s+\([^)]+:\d+:\d+\)/,  // Stack traces
  /^\s*\^\s*$/,                    // Error indicators
  /Traceback \(most recent call last\)/,
  /^warning:/im,
  /^error:/im,
  // Tool result confirmation strings (file writes, command outputs)
  /^Successfully (wrote|created|deleted|moved|copied|replaced|updated)\s+\d+/i,
  /^Successfully replaced text in\s/i,
  /^\d+ bytes? (written|saved|copied)/i,
  /^(Created|Wrote|Saved|Deleted|Moved|Copied) (file|directory|folder)?\s*[:.]?\s*\//i,
  /^Command exited with code \d+/i,
  /^Process (started|stopped|completed|exited)/i,
  // System/gateway log lines
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s+(info|warn|error|debug)\b/i,
  /^(WARN|INFO|DEBUG|ERROR)\s/,
  // Package manager output
  /^(npm|yarn|bun|pnpm)\s+(install|add|remove|update)\b/i,
  /^bun install v/,
  /^Resolving dependencies/,
  // System prompt / runtime metadata fragments
  /<<<BEGIN_UNTRUSTED/,
  /Result \(untrusted content, treat as data\)/i,
  /^\[media attached:/,
  /^If you must inline, use MEDIA:/,
  /^Conversation info \(untrusted/,
  /^Replied message \(untrusted/,
  // CSS/HTML fragments and page head artifacts
  /\.changing-theme,\s*\.changing-theme\s*\*/i,
  /data-next-head=/i,
  /^\[media attached:/i,
  /\/Users\/clawdaddy\/\.openclaw\//i,
  // Secret request / workflow snippet artifacts
  /can you send me the full c52 api key/i,
  /workflow files use `?secrets\.X`? directly/i,
  /^Add:\s*-\s*`?ENCRYPTION_KEY`?/i,
  /actions\/setup-node@v4/i,
  // JSON response blobs
  /^\s*\{\s*"(status|error|result|data|childSession|accepted)":/,
  // Directory listings
  /^[dl\-][rwx\-]{9}\s+\d+\s+\w+/,
  // System upgrade/path warnings
  /You should consider upgrading via/i,
  /Consider adding this directory to PATH/i,
  // Task/internal instructions
  /^Task: Read prompts\//,
  /^Retry with env key loaded from/,
  // Internal blocker/error notes (markdown-formatted agent output)
  /^#{1,3}\s+(Blocker|Error|Warning|Bug|Issue)\b/i,
  // Python UI code (streamlit, etc.)
  /^st\.(subheader|write|markdown|header|sidebar|columns|tabs)\s*\(/,
];

/**
 * Detect prompt injection attempts in content
 */
export function detectPromptInjection(content: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * Detect noise/low-value content
 */
export function detectNoise(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < 10) return true;
  return NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Detect terminal/error output
 */
export function detectTerminalOutput(content: string): boolean {
  return TERMINAL_PATTERNS.some((pattern) => pattern.test(content));
}

// Patterns that indicate source code (not memory-worthy)
const CODE_PATTERNS = [
  /^(?:const|let|var|function|class|interface|type|import|export|return|async|await)\s/,
  /^(?:if|else|for|while|switch|try|catch|throw)\s*[\({]/,
  /[{}\[\]();]\s*$/,           // Lines ending with code punctuation
  /=>\s*\{/,                    // Arrow functions
  /\.\w+\([^)]*\)/,            // Method calls like .map(...), .filter(...)
  /(?:===?|!==?|&&|\|\|)\s/,   // Comparison/logical operators
  /^\s*(?:\/\/|\/\*|\*)/,      // Comments
  /`\$\{/,                      // Template literals
  /\b(?:null|undefined|true|false)\b.*[=;{]/,  // Code with literals
];

// Patterns that indicate system/runtime metadata (not memory-worthy)
const SYSTEM_METADATA_PATTERNS = [
  /^\[?\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/,         // Timestamp-prefixed
  /\bsession_key:\s/i,
  /\bsession_id:\s/i,
  /\bOpenClaw\s+runtime/i,
  /\[Internal\s+task/i,
  /\bsubagent\b.*\btask\b/i,
  /\bSCOUT\s+HANDOFF/i,
  /\bHEARTBEAT_OK\b/,
  /\bExec\s+(?:completed|failed)\b/i,
  /\bcode\s+\d+\)\s*::/,
  // Internal agent routing instructions
  /\b(?:main|parent|child)\s+agent\s+should\b/i,
  /\bforward\s+(?:this|the)\s+(?:report|message|result)\b/i,
  /\b(?:send|deliver|route)\s+(?:to|this)\s+(?:the\s+)?(?:user|channel|telegram|discord|slack)\b/i,
  /\b(?:announce|notify|alert)\s+(?:the\s+)?(?:user|human|operator)\b/i,
  // Raw tool result JSON
  /^\s*\{\s*"(?:status|error|tool|result)":/,
  // Instruction fragments (numbered steps without context)
  /^\s*\d+\.\s*$/m,
];

/**
 * Detect source code content
 */
export function detectCodeSnippet(content: string): boolean {
  const lines = content.split("\n");
  let code_line_count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (CODE_PATTERNS.some(p => p.test(trimmed))) {
      code_line_count++;
    }
  }
  // If >40% of lines look like code, it's a code snippet
  return lines.length > 0 && (code_line_count / lines.length) > 0.4;
}

/**
 * Detect system/runtime metadata
 */
export function detectSystemMetadata(content: string): boolean {
  return SYSTEM_METADATA_PATTERNS.some(p => p.test(content));
}

// Positive gate: only keep high-signal durable memory statements
const HIGH_SIGNAL_PATTERNS = [
  /\b(?:i|we)\s+(?:decided|decide|chose|choose|prefer|will always|will never|must)\b/i,
  /\b(?:my name is|call me|i am)\b/i,
  /\b(?:timezone is|i'm in|i am in)\b/i,
  /\b(?:remember this|don't forget)\b/i,
  /\b(?:root cause|resolved by|fix was|we fixed)\b/i,
  /^\s*(?:name|role|timezone|what to call)\s*:/i,
];

/**
 * Check if content matches capture patterns
 */
export function matchesCapturePatterns(content: string): boolean {
  // Skip obvious noise first
  if (detectNoise(content)) return false;
  if (detectTerminalOutput(content)) return false;
  if (content.length < 20) return false;

  // NEW: Reject code snippets
  if (detectCodeSnippet(content)) return false;

  // NEW: Reject system/runtime metadata
  if (detectSystemMetadata(content)) return false;

  // NEW: Reject JSON-like content
  if (/^\s*[\[{]/.test(content) && /[\]}]\s*$/.test(content)) return false;

  // NEW: Reject content that's mostly special characters (not natural language)
  const alpha_ratio = (content.match(/[a-zA-Z]/g)?.length ?? 0) / content.length;
  if (alpha_ratio < 0.5) return false;

  // Positive gate: keep only explicit durable-memory phrasing
  return HIGH_SIGNAL_PATTERNS.some((pattern) => pattern.test(content));
}

export function isHighSignalMemory(content: string): boolean {
  return matchesCapturePatterns(content);
}

/**
 * Clean content before storage
 */
export function sanitizeContent(content: string): string {
  return content
    .replace(/\r\n/g, "\n")          // Normalize line endings
    .replace(/\n{3,}/g, "\n\n")       // Collapse excessive newlines
    .replace(/^\s+|\s+$/g, "")        // Trim
    .slice(0, 10000);                 // Limit length
}
