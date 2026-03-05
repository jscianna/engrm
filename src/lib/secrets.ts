/**
 * Secret detection and redaction for Engrm memories
 * 
 * Detects common credential patterns and prevents them from
 * being exposed to LLM context while still allowing storage.
 */

// Patterns that indicate a secret/credential
const SECRET_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  // API Keys by prefix
  { pattern: /\bsk-[a-zA-Z0-9]{20,}/g, name: "OpenAI API key" },
  { pattern: /\bsk_live_[a-zA-Z0-9]{20,}/g, name: "Stripe live key" },
  { pattern: /\bsk_test_[a-zA-Z0-9]{20,}/g, name: "Stripe test key" },
  { pattern: /\bpk_live_[a-zA-Z0-9]{20,}/g, name: "Stripe publishable key" },
  { pattern: /\bpk_test_[a-zA-Z0-9]{20,}/g, name: "Stripe publishable key" },
  { pattern: /\bmem_[a-zA-Z0-9]{30,}/g, name: "Engrm API key" },
  { pattern: /\bghp_[a-zA-Z0-9]{36,}/g, name: "GitHub PAT" },
  { pattern: /\bgho_[a-zA-Z0-9]{36,}/g, name: "GitHub OAuth token" },
  { pattern: /\bghu_[a-zA-Z0-9]{36,}/g, name: "GitHub user token" },
  { pattern: /\bghs_[a-zA-Z0-9]{36,}/g, name: "GitHub server token" },
  { pattern: /\bAKIA[A-Z0-9]{16}/g, name: "AWS access key" },
  { pattern: /\bxox[baprs]-[a-zA-Z0-9-]{10,}/g, name: "Slack token" },
  { pattern: /\bEAAC[a-zA-Z0-9]{100,}/g, name: "Facebook token" },
  { pattern: /\bya29\.[a-zA-Z0-9_-]{50,}/g, name: "Google OAuth token" },
  { pattern: /\beyJ[a-zA-Z0-9_-]{50,}\.[a-zA-Z0-9_-]{50,}\.[a-zA-Z0-9_-]{50,}/g, name: "JWT token" },
  
  // Explicit credential labels
  { pattern: /password\s*[:=]\s*["']?[^\s"']{8,}["']?/gi, name: "Password" },
  { pattern: /passwd\s*[:=]\s*["']?[^\s"']{8,}["']?/gi, name: "Password" },
  { pattern: /pwd\s*[:=]\s*["']?[^\s"']{8,}["']?/gi, name: "Password" },
  { pattern: /secret\s*[:=]\s*["']?[^\s"']{8,}["']?/gi, name: "Secret" },
  { pattern: /api[_-]?key\s*[:=]\s*["']?[^\s"']{16,}["']?/gi, name: "API key" },
  { pattern: /api[_-]?secret\s*[:=]\s*["']?[^\s"']{16,}["']?/gi, name: "API secret" },
  { pattern: /auth[_-]?token\s*[:=]\s*["']?[^\s"']{16,}["']?/gi, name: "Auth token" },
  { pattern: /access[_-]?token\s*[:=]\s*["']?[^\s"']{16,}["']?/gi, name: "Access token" },
  { pattern: /bearer\s+[a-zA-Z0-9_\-.]{20,}/gi, name: "Bearer token" },
  
  // Private keys
  { pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g, name: "Private key" },
  { pattern: /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/g, name: "SSH private key" },
  { pattern: /-----BEGIN\s+PGP\s+PRIVATE\s+KEY-----/g, name: "PGP private key" },
  
  // Connection strings
  { pattern: /mongodb(\+srv)?:\/\/[^\s]{20,}/gi, name: "MongoDB connection string" },
  { pattern: /postgres(ql)?:\/\/[^\s]{20,}/gi, name: "PostgreSQL connection string" },
  { pattern: /mysql:\/\/[^\s]{20,}/gi, name: "MySQL connection string" },
  { pattern: /redis:\/\/[^\s]{20,}/gi, name: "Redis connection string" },
];

export interface SecretDetectionResult {
  containsSecrets: boolean;
  detectedTypes: string[];
  redactedText: string;
}

/**
 * Detect if text contains secrets/credentials
 */
export function detectSecrets(text: string): SecretDetectionResult {
  const detectedTypes = new Set<string>();
  let redactedText = text;
  
  for (const { pattern, name } of SECRET_PATTERNS) {
    // Reset regex state for global patterns
    pattern.lastIndex = 0;
    
    if (pattern.test(text)) {
      detectedTypes.add(name);
      
      // Reset again for replacement
      pattern.lastIndex = 0;
      redactedText = redactedText.replace(pattern, (match) => {
        // Keep first few chars for identification, redact the rest
        const visibleChars = Math.min(8, Math.floor(match.length * 0.2));
        return match.slice(0, visibleChars) + "[REDACTED]";
      });
    }
  }
  
  return {
    containsSecrets: detectedTypes.size > 0,
    detectedTypes: Array.from(detectedTypes),
    redactedText,
  };
}

/**
 * Check if text contains secrets (simple boolean check)
 */
export function containsSecrets(text: string): boolean {
  for (const { pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Redact secrets from text, replacing with safe placeholders
 */
export function redactSecrets(text: string): string {
  return detectSecrets(text).redactedText;
}

/**
 * Get a summary of what types of secrets were detected
 */
export function getSecretTypes(text: string): string[] {
  return detectSecrets(text).detectedTypes;
}
