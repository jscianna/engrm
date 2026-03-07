/**
 * Secret detection and redaction for FatHippo memories
 * 
 * Detects common credential patterns and prevents them from
 * being exposed to LLM context while still allowing storage.
 * 
 * Patterns sourced via MoA (Gemini + Claude) for comprehensive coverage.
 */

// Patterns that indicate a secret/credential
const SECRET_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  // ============================================================================
  // OpenAI / Anthropic / AI Providers
  // ============================================================================
  { pattern: /\bsk-[a-zA-Z0-9]{32,}/g, name: "OpenAI API key" },
  { pattern: /\bsk-proj-[a-zA-Z0-9]{48,}/g, name: "OpenAI project key" },
  { pattern: /\bsk-ant-[a-zA-Z0-9]{40,}/g, name: "Anthropic API key" },
  { pattern: /\br8_[a-zA-Z0-9]{32,}/g, name: "Replicate API key" },
  { pattern: /\bhf_[a-zA-Z0-9]{32,}/g, name: "Hugging Face token" },
  { pattern: /\bcohere[_-][a-zA-Z0-9]{32,}/gi, name: "Cohere API key" },
  { pattern: /\bpinecone[_-][a-zA-Z0-9]{32,}/gi, name: "Pinecone API key" },
  
  // ============================================================================
  // Stripe / Payment Processors
  // ============================================================================
  { pattern: /\bsk_live_[a-zA-Z0-9]{24,}/g, name: "Stripe live key" },
  { pattern: /\bsk_test_[a-zA-Z0-9]{24,}/g, name: "Stripe test key" },
  { pattern: /\bpk_live_[a-zA-Z0-9]{24,}/g, name: "Stripe publishable key" },
  { pattern: /\bpk_test_[a-zA-Z0-9]{24,}/g, name: "Stripe publishable key" },
  { pattern: /\brk_live_[a-zA-Z0-9]{24,}/g, name: "Stripe restricted key" },
  { pattern: /\brk_test_[a-zA-Z0-9]{24,}/g, name: "Stripe restricted test key" },
  { pattern: /\bwhsec_[a-zA-Z0-9]{32,}/g, name: "Stripe webhook secret" },
  { pattern: /\bsq0[a-z]{3}-[a-zA-Z0-9\-_]{22,}/g, name: "Square API key" },
  
  // ============================================================================
  // GitHub / GitLab / Version Control
  // ============================================================================
  { pattern: /\bghp_[a-zA-Z0-9]{36,}/g, name: "GitHub PAT" },
  { pattern: /\bgho_[a-zA-Z0-9]{36,}/g, name: "GitHub OAuth token" },
  { pattern: /\bghu_[a-zA-Z0-9]{36,}/g, name: "GitHub user token" },
  { pattern: /\bghs_[a-zA-Z0-9]{36,}/g, name: "GitHub server token" },
  { pattern: /\bgithub_pat_[a-zA-Z0-9]{82}/g, name: "GitHub fine-grained PAT" },
  { pattern: /\bglpat-[a-zA-Z0-9\-]{20,}/g, name: "GitLab PAT" },
  { pattern: /\bgloas-[a-zA-Z0-9\-]{20,}/g, name: "GitLab OAuth token" },
  
  // ============================================================================
  // AWS
  // ============================================================================
  { pattern: /\bAKIA[A-Z0-9]{16}/g, name: "AWS access key" },
  { pattern: /\bASIA[A-Z0-9]{16}/g, name: "AWS temporary access key" },
  { pattern: /\bAIDA[A-Z0-9]{16}/g, name: "AWS IAM user ID" },
  { pattern: /aws[_-]?secret[_-]?access[_-]?key\s*[:=]\s*["']?[A-Za-z0-9\/+=]{40}["']?/gi, name: "AWS secret key" },
  
  // ============================================================================
  // Google Cloud Platform
  // ============================================================================
  { pattern: /\bAIza[0-9A-Za-z_-]{35}/g, name: "Google API key" },
  { pattern: /\bya29\.[a-zA-Z0-9_-]{50,}/g, name: "Google OAuth token" },
  { pattern: /[a-zA-Z0-9_-]{24}\.apps\.googleusercontent\.com/g, name: "Google OAuth client" },
  
  // ============================================================================
  // Azure
  // ============================================================================
  { pattern: /DefaultEndpointsProtocol=https;AccountName=[a-zA-Z0-9]+;AccountKey=[a-zA-Z0-9+\/=]+/gi, name: "Azure storage key" },
  { pattern: /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, name: "Azure/UUID secret" },
  
  // ============================================================================
  // Slack / Discord / Messaging
  // ============================================================================
  { pattern: /\bxoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/g, name: "Slack bot token" },
  { pattern: /\bxoxp-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/g, name: "Slack user token" },
  { pattern: /\bxoxa-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/g, name: "Slack app token" },
  { pattern: /\bxoxr-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/g, name: "Slack refresh token" },
  { pattern: /https:\/\/discord\.com\/api\/webhooks\/\d+\/[a-zA-Z0-9_-]+/g, name: "Discord webhook" },
  { pattern: /[MN][A-Za-z\d]{23,28}\.[X-Za-z\d]{6}\.[a-zA-Z\d_-]{27,}/g, name: "Discord bot token" },
  
  // ============================================================================
  // Twilio / Communication
  // ============================================================================
  { pattern: /\bSK[a-zA-Z0-9]{32}/g, name: "Twilio API key" },
  { pattern: /\bAC[a-zA-Z0-9]{32}/g, name: "Twilio Account SID" },
  
  // ============================================================================
  // Database Connection Strings
  // ============================================================================
  { pattern: /mongodb(\+srv)?:\/\/[^\s]{20,}/gi, name: "MongoDB connection string" },
  { pattern: /postgres(ql)?:\/\/[^\s]{20,}/gi, name: "PostgreSQL connection string" },
  { pattern: /mysql:\/\/[^\s]{20,}/gi, name: "MySQL connection string" },
  { pattern: /redis:\/\/[^\s]{20,}/gi, name: "Redis connection string" },
  { pattern: /libsql:\/\/[^\s]{20,}/gi, name: "Turso/LibSQL connection string" },
  
  // ============================================================================
  // FatHippo / Custom
  // ============================================================================
  { pattern: /\bmem_[a-zA-Z0-9]{30,}/g, name: "FatHippo API key" },
  
  // ============================================================================
  // Vercel / Netlify / Hosting
  // ============================================================================
  { pattern: /\bvercel_[a-zA-Z0-9]{24,}/gi, name: "Vercel token" },
  { pattern: /\bnfp_[a-zA-Z0-9]{40,}/g, name: "Netlify PAT" },
  
  // ============================================================================
  // DigitalOcean / Cloud Providers
  // ============================================================================
  { pattern: /\bdop_v1_[a-zA-Z0-9]{64}/g, name: "DigitalOcean API key" },
  { pattern: /\bdoos_[a-zA-Z0-9]{32}/g, name: "DigitalOcean OAuth" },
  
  // ============================================================================
  // Supabase / PlanetScale / Neon / Modern DBs
  // ============================================================================
  { pattern: /\bsbp_[a-zA-Z0-9]{40,}/g, name: "Supabase service key" },
  { pattern: /\bpscale_tkn_[a-zA-Z0-9]{32,}/g, name: "PlanetScale token" },
  
  // ============================================================================
  // Notion / Airtable / Productivity
  // ============================================================================
  { pattern: /\bsecret_[a-zA-Z0-9]{32,}/g, name: "Notion integration token" },
  { pattern: /\bntn_[a-zA-Z0-9]{32,}/g, name: "Notion token" },
  { pattern: /\bkey[a-zA-Z0-9]{14}\.[a-zA-Z0-9]{5}/g, name: "Airtable API key" },
  { pattern: /\bpat[a-zA-Z0-9]{14}\.[a-zA-Z0-9]{64}/g, name: "Airtable PAT" },
  { pattern: /\blin_api_[a-zA-Z0-9]{32,}/g, name: "Linear API key" },
  { pattern: /\bfigd_[a-zA-Z0-9]{24,}/g, name: "Figma token" },
  
  // ============================================================================
  // Email Services
  // ============================================================================
  { pattern: /\bkey-[0-9a-f]{32}/g, name: "Mailgun API key" },
  { pattern: /\bSG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g, name: "SendGrid API key" },
  { pattern: /\bre_[a-zA-Z0-9]{32,}/g, name: "Resend API key" },
  { pattern: /\bpostmark[_-]?[a-zA-Z0-9]{32,}/gi, name: "Postmark token" },
  
  // ============================================================================
  // Monitoring / Observability
  // ============================================================================
  { pattern: /https:\/\/[a-f0-9]{32}@[a-z0-9]+\.ingest\.sentry\.io\/\d+/g, name: "Sentry DSN" },
  { pattern: /\bdd[_-]?api[_-]?key\s*[:=]\s*["']?[a-f0-9]{32}["']?/gi, name: "Datadog API key" },
  { pattern: /\bNRAK-[A-Z0-9]{27}/g, name: "New Relic API key" },
  { pattern: /\bNRAL-[a-zA-Z0-9]{32}/g, name: "New Relic license key" },
  
  // ============================================================================
  // CI/CD
  // ============================================================================
  { pattern: /\bCIRCLE[_-]?TOKEN\s*[:=]\s*["']?[a-f0-9]{40}["']?/gi, name: "CircleCI token" },
  { pattern: /\btravis[_-]?token\s*[:=]\s*["']?[a-zA-Z0-9]{22}["']?/gi, name: "Travis CI token" },
  
  // ============================================================================
  // HashiCorp / Infrastructure
  // ============================================================================
  { pattern: /\bhvs\.[a-zA-Z0-9]{24,}/g, name: "Vault token" },
  { pattern: /\bs\.hvs\.[a-zA-Z0-9]{24,}/g, name: "Vault service token" },
  
  // ============================================================================
  // Telegram
  // ============================================================================
  { pattern: /\b[0-9]{8,10}:[a-zA-Z0-9_-]{35}/g, name: "Telegram bot token" },
  
  // ============================================================================
  // Firebase
  // ============================================================================
  { pattern: /\bAAAA[A-Za-z0-9_-]{100,}/g, name: "Firebase Cloud Messaging key" },
  
  // ============================================================================
  // JWT / OAuth Tokens
  // ============================================================================
  { pattern: /\beyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g, name: "JWT token" },
  { pattern: /bearer\s+[a-zA-Z0-9_\-.]{20,}/gi, name: "Bearer token" },
  
  // ============================================================================
  // Private Keys
  // ============================================================================
  { pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g, name: "RSA private key" },
  { pattern: /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/g, name: "SSH private key" },
  { pattern: /-----BEGIN\s+PGP\s+PRIVATE\s+KEY\s+BLOCK-----/g, name: "PGP private key" },
  { pattern: /-----BEGIN\s+EC\s+PRIVATE\s+KEY-----/g, name: "EC private key" },
  { pattern: /-----BEGIN\s+DSA\s+PRIVATE\s+KEY-----/g, name: "DSA private key" },
  { pattern: /-----BEGIN\s+ENCRYPTED\s+PRIVATE\s+KEY-----/g, name: "Encrypted private key" },
  
  // ============================================================================
  // Crypto / Web3 (wallet seeds - 12 or 24 word mnemonics)
  // ============================================================================
  { pattern: /\b(?:[a-z]+\s){11}[a-z]+\b/gi, name: "12-word seed phrase" },
  { pattern: /\b(?:[a-z]+\s){23}[a-z]+\b/gi, name: "24-word seed phrase" },
  { pattern: /\b0x[a-fA-F0-9]{64}\b/g, name: "Ethereum private key" },
  
  // ============================================================================
  // Explicit credential labels (context patterns)
  // ============================================================================
  // Password variations (colon/equals/dash separators)
  { pattern: /password\s*[:=\-]\s*["']?[^\s"']{6,}["']?/gi, name: "Password" },
  { pattern: /passwd\s*[:=\-]\s*["']?[^\s"']{6,}["']?/gi, name: "Password" },
  { pattern: /pwd\s*[:=\-]\s*["']?[^\s"']{6,}["']?/gi, name: "Password" },
  { pattern: /\bpw\s*[:=\-]\s*["']?[^\s"']{6,}["']?/gi, name: "Password" },
  { pattern: /\bpass\s*[:=\-]\s*["']?[^\s"']{6,}["']?/gi, name: "Password" },
  // Password with space separator (e.g., "pw mypassword123")
  { pattern: /\bpw\s+[^\s,;]{8,}/gi, name: "Password (space-separated)" },
  { pattern: /\bpassword\s+[^\s,;]{8,}/gi, name: "Password (space-separated)" },
  
  // API key variations (including natural language with dash)
  { pattern: /api\s*key\s*[:=\-]\s*["']?[^\s"']{10,}["']?/gi, name: "API key" },
  { pattern: /api[_-]?key\s*[:=\-]\s*["']?[^\s"']{10,}["']?/gi, name: "API key" },
  { pattern: /apikey\s*[:=\-]\s*["']?[^\s"']{10,}["']?/gi, name: "API key" },
  // API/admin key with space separator (e.g., "admin key abc123")
  { pattern: /admin\s*key\s+[^\s,;]{8,}/gi, name: "Admin key (space-separated)" },
  { pattern: /api\s*key\s+[^\s,;]{10,}/gi, name: "API key (space-separated)" },
  
  // Secret/token variations
  { pattern: /secret\s*[:=\-]\s*["']?[^\s"']{10,}["']?/gi, name: "Secret" },
  { pattern: /api[_-]?secret\s*[:=\-]\s*["']?[^\s"']{10,}["']?/gi, name: "API secret" },
  { pattern: /auth[_-]?token\s*[:=\-]\s*["']?[^\s"']{10,}["']?/gi, name: "Auth token" },
  { pattern: /access[_-]?token\s*[:=\-]\s*["']?[^\s"']{10,}["']?/gi, name: "Access token" },
  { pattern: /private[_-]?key\s*[:=\-]\s*["']?[^\s"']{10,}["']?/gi, name: "Private key" },
  { pattern: /token\s*[:=\-]\s*["']?[^\s"']{16,}["']?/gi, name: "Token" },
  
  // Login credential patterns (username/email + password combos)
  { pattern: /(?:username|user|email|login)\s*[:=\-]\s*[^\s]+\s+(?:password|pw|pwd|pass)\s*[:=\-]\s*["']?[^\s"']{4,}["']?/gi, name: "Login credentials" },
  
  // Credential blocks
  { pattern: /credentials?\s*[:=\-]?\s*\{[^}]*(?:password|secret|key)[^}]*\}/gi, name: "Credential block" },
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
