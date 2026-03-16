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

// Patterns that indicate terminal/error output
const TERMINAL_PATTERNS = [
  /npm (ERR!|WARN)/,
  /error:\s*\w+Error/i,
  /at\s+\w+\s+\([^)]+:\d+:\d+\)/,  // Stack traces
  /^\s*\^\s*$/,                    // Error indicators
  /Traceback \(most recent call last\)/,
  /^warning:/im,
  /^error:/im,
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

// Patterns that indicate memory-worthy content
const CAPTURE_PATTERNS = [
  /\b(decide|decided|decision)\b/i,
  /\b(prefer|preference|prefers)\b/i,
  /\b(always|never|must|should)\b/i,
  /\b(remember|don't forget|note that)\b/i,
  /\b(rule|principle|guideline)\b/i,
  /\b(important|critical|key)\b/i,
  /\b(identity|i am|my name)\b/i,
  /\b(constraint|requirement|must not)\b/i,
  /\b(workflow|process|procedure)\b/i,
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

  // Check for memory-worthy patterns
  return CAPTURE_PATTERNS.some((pattern) => pattern.test(content));
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
