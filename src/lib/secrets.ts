/**
 * Secret detection and vault intent detection.
 *
 * Patterns are aligned to VAULT_SPEC.md and used for:
 * - detecting secrets in remember/store flows
 * - detecting secret retrieval queries for vault hints
 */

export type SecretCategory =
  | "api_key"
  | "password"
  | "token"
  | "connection_string"
  | "private_key"
  | "credentials";

type SecretPattern = {
  name: string;
  category: SecretCategory;
  pattern: RegExp;
  context?: RegExp;
};

const SECRET_PATTERNS: SecretPattern[] = [
  // API keys and service tokens
  { name: "OpenAI API key", category: "api_key", pattern: /\bsk-[a-zA-Z0-9]{20,}\b/g },
  { name: "Anthropic API key", category: "api_key", pattern: /\bsk-ant-[a-zA-Z0-9-]{40,}\b/g },
  { name: "AWS access key", category: "api_key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    name: "AWS secret key",
    category: "api_key",
    pattern: /\b[a-zA-Z0-9/+]{40}\b/g,
    context: /\baws|secret|access[_ -]?key\b/i,
  },
  { name: "Google Cloud API key", category: "api_key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "GitHub token", category: "api_key", pattern: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/g },
  {
    name: "GitHub classic PAT",
    category: "api_key",
    pattern: /\bgithub_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}\b/g,
  },
  { name: "Stripe secret key", category: "api_key", pattern: /\bsk_(?:live|test)_[0-9a-zA-Z]{24,}\b/g },
  { name: "Stripe publishable key", category: "api_key", pattern: /\bpk_live_[0-9a-zA-Z]{24,}\b/g },
  { name: "Twilio key", category: "api_key", pattern: /\bSK[0-9a-fA-F]{32}\b/g },
  {
    name: "Twilio auth token",
    category: "token",
    pattern: /\b[a-f0-9]{32}\b/g,
    context: /\btwilio|auth\b/i,
  },
  {
    name: "SendGrid key",
    category: "api_key",
    pattern: /\bSG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}\b/g,
  },
  { name: "Slack bot token", category: "token", pattern: /\bxoxb-[0-9]{11}-[0-9]{11}-[a-zA-Z0-9]{24}\b/g },
  { name: "Slack user token", category: "token", pattern: /\bxoxp-[0-9]{11}-[0-9]{11}-[a-zA-Z0-9]{24}\b/g },
  {
    name: "Discord bot token",
    category: "token",
    pattern: /\b[MN][A-Za-z0-9]{23,}\.[\w-]{6}\.[\w-]{27}\b/g,
  },
  {
    name: "Telegram bot token",
    category: "token",
    pattern: /\b[0-9]{8,10}:[a-zA-Z0-9_-]{35}\b/g,
  },
  { name: "OpenRouter key", category: "api_key", pattern: /\bsk-or-v1-[a-f0-9]{64}\b/g },
  { name: "Vercel token", category: "token", pattern: /\bvercel_[a-zA-Z0-9]{24}\b/g },
  { name: "Supabase key", category: "api_key", pattern: /\bsbp_[a-f0-9]{40}\b/g },
  {
    name: "Supabase JWT",
    category: "token",
    pattern: /\beyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,
  },
  {
    name: "Cloudflare token",
    category: "token",
    pattern: /\b[a-z0-9]{37}\b/g,
    context: /\bcloudflare|cf[_ -]?api|token\b/i,
  },
  {
    name: "UUID-style secret",
    category: "api_key",
    pattern: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
    context: /\b(?:heroku|pinecone|railway|token|api[_ -]?key|secret)\b/i,
  },
  { name: "Mailgun key", category: "api_key", pattern: /\bkey-[0-9a-zA-Z]{32}\b/g },
  { name: "HuggingFace key", category: "api_key", pattern: /\bhf_[a-zA-Z0-9]{34}\b/g },
  { name: "Replicate key", category: "api_key", pattern: /\br8_[a-zA-Z0-9]{40}\b/g },
  {
    name: "Cohere key",
    category: "api_key",
    pattern: /\b[a-zA-Z0-9]{40}\b/g,
    context: /\bcohere|api[_ -]?key\b/i,
  },
  { name: "Mapbox key", category: "api_key", pattern: /\bpk\.[a-zA-Z0-9]{60,}\b/g },
  {
    name: "Generic prefixed API key",
    category: "api_key",
    pattern: /\b[a-zA-Z]{2,8}_[a-zA-Z0-9]{20,}\b/g,
    context: /\bapi[_ -]?key|token|secret|credential|password\b/i,
  },
  {
    name: "Firebase token",
    category: "token",
    pattern: /\b[a-zA-Z0-9_-]{40}\b/g,
    context: /\bfirebase|token|api[_ -]?key\b/i,
  },
  {
    name: "DataDog key",
    category: "api_key",
    pattern: /\b[a-f0-9]{32}\b/g,
    context: /\bdatadog|dd[_ -]?api[_ -]?key\b/i,
  },
  {
    name: "Sentry key",
    category: "api_key",
    pattern: /\b[a-f0-9]{32}\b/g,
    context: /\bsentry|dsn\b/i,
  },
  { name: "Linear key", category: "api_key", pattern: /\blin_api_[a-zA-Z0-9]{40}\b/g },
  { name: "Notion key", category: "api_key", pattern: /\bsecret_[a-zA-Z0-9]{43}\b/g },
  { name: "Airtable key", category: "api_key", pattern: /\bkey[a-zA-Z0-9]{14}\b/g },
  {
    name: "Algolia key",
    category: "api_key",
    pattern: /\b[a-f0-9]{32}\b/g,
    context: /\balgolia|api[_ -]?key\b/i,
  },
  {
    name: "Braintree token",
    category: "token",
    pattern: /\baccess_token\$[a-z]+\$[a-z0-9]+\$[a-f0-9]{32}\b/g,
  },
  { name: "Square access token", category: "token", pattern: /\bsq0atp-[0-9A-Za-z_-]{22}\b/g },
  { name: "Square secret", category: "token", pattern: /\bsq0csp-[0-9A-Za-z_-]{43}\b/g },
  {
    name: "PayPal access token",
    category: "token",
    pattern: /\baccess_token\$production\$[a-z0-9]{13}\$[a-f0-9]{32}\b/g,
  },
  { name: "npm token", category: "token", pattern: /\bnpm_[a-zA-Z0-9]{36}\b/g },
  { name: "PyPI token", category: "token", pattern: /\bpypi-[a-zA-Z0-9_-]{50,}\b/g },
  { name: "Doppler token", category: "token", pattern: /\bdp\.st\.[a-zA-Z0-9_-]{40,}\b/g },
  { name: "Fly.io token", category: "token", pattern: /\bfo1_[a-zA-Z0-9_-]{40,}\b/g },
  { name: "PlanetScale token", category: "token", pattern: /\bpscale_tkn_[a-zA-Z0-9_-]{40,}\b/g },
  {
    name: "Turso token",
    category: "token",
    pattern: /\b[a-zA-Z0-9_-]{40,}\b/g,
    context: /\bturso|token|api[_ -]?key\b/i,
  },
  { name: "Neon token", category: "token", pattern: /\bneon-[a-zA-Z0-9_-]{32,}\b/g },
  { name: "Clerk secret key", category: "api_key", pattern: /\bsk_(?:live|test)_[a-zA-Z0-9]{40,}\b/g },
  {
    name: "Auth0 token",
    category: "token",
    pattern: /\b[a-zA-Z0-9_-]{32,}\b/g,
    context: /\bauth0|token|secret\b/i,
  },
  {
    name: "Okta token",
    category: "token",
    pattern: /\b[a-zA-Z0-9_-]{42}\b/g,
    context: /\bokta|token|secret\b/i,
  },
  { name: "Venice API key", category: "api_key", pattern: /\bVENICE-[A-Za-z0-9_-]{40,}\b/g },
  { name: "FatHippo API key", category: "api_key", pattern: /\bmem_[a-f0-9]{48}\b/g },

  // Tokens and auth
  {
    name: "JWT",
    category: "token",
    pattern: /\beyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\b/g,
  },
  { name: "Bearer token", category: "token", pattern: /\bbearer\s+[a-zA-Z0-9_-]{20,}\b/gi },
  { name: "OAuth access token", category: "token", pattern: /\bya29\.[a-zA-Z0-9_-]+\b/g },
  { name: "OAuth refresh token", category: "token", pattern: /\b1\/\/[a-zA-Z0-9_-]+\b/g },

  // Connection strings
  {
    name: "PostgreSQL connection string",
    category: "connection_string",
    pattern: /\bpostgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@[^\/\s]+\/\w+\b/gi,
  },
  {
    name: "MySQL connection string",
    category: "connection_string",
    pattern: /\bmysql:\/\/[^:\s]+:[^@\s]+@[^\/\s]+\/\w+\b/gi,
  },
  {
    name: "MongoDB connection string",
    category: "connection_string",
    pattern: /\bmongodb(?:\+srv)?:\/\/[^:\s]+:[^@\s]+@[^\/\s]+\b/gi,
  },
  {
    name: "Redis connection string",
    category: "connection_string",
    pattern: /\bredis:\/\/:?[^@\s]+@[^:\s]+:\d+\b/gi,
  },
  {
    name: "JDBC connection string",
    category: "connection_string",
    pattern: /\bjdbc:[a-z]+:\/\/[^:\s]+:[^@\s]+@[^\/\s]+\b/gi,
  },
  {
    name: "SQLite connection string with password",
    category: "connection_string",
    pattern: /\bsqlite:\/\/[^\s]*password=[^\s]+\b/gi,
  },

  // Private keys
  { name: "RSA private key", category: "private_key", pattern: /-----BEGIN RSA PRIVATE KEY-----/g },
  { name: "EC private key", category: "private_key", pattern: /-----BEGIN EC PRIVATE KEY-----/g },
  { name: "OpenSSH private key", category: "private_key", pattern: /-----BEGIN OPENSSH PRIVATE KEY-----/g },
  { name: "PGP private key", category: "private_key", pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----/g },
  { name: "Private key", category: "private_key", pattern: /-----BEGIN PRIVATE KEY-----/g },
  { name: "Encrypted private key", category: "private_key", pattern: /-----BEGIN ENCRYPTED PRIVATE KEY-----/g },

  // Labeled fields
  {
    name: "Password field",
    category: "password",
    pattern: /password\s*[:=]\s*['\"]?[^'\"\s]{8,}/gi,
  },
  {
    name: "Secret field",
    category: "credentials",
    pattern: /secret\s*[:=]\s*['\"]?[^'\"\s]{8,}/gi,
  },
  {
    name: "API key field",
    category: "api_key",
    pattern: /api[_-]?key\s*[:=]\s*['\"]?[^'\"\s]{16,}/gi,
  },
  {
    name: "Token field",
    category: "token",
    pattern: /token\s*[:=]\s*['\"]?[^'\"\s]{20,}/gi,
  },
];

const SECRET_QUERY_PATTERNS: RegExp[] = [
  /what is my .*?(api key|token|password|secret|credentials)/i,
  /give me .*?(api key|token|password|secret|credentials)/i,
  /(api key|token|password|secret|credentials) for .*/i,
  /show .*?(api key|token|password|secret|credentials)/i,
  /retrieve .*?(api key|token|password|secret|credentials)/i,
];

const SECRET_QUERY_CATEGORY_HINTS: Array<{ category: SecretCategory; pattern: RegExp }> = [
  { category: "api_key", pattern: /\bapi[_ -]?key|access key|auth key\b/i },
  { category: "password", pattern: /\bpassword|passwd|pwd\b/i },
  { category: "token", pattern: /\btoken|jwt|bearer|oauth\b/i },
  // Only match connection_string when explicitly asking for connection/URL, not just mentioning DB names
  { category: "connection_string", pattern: /\b(connection string|database url|db url|dsn|jdbc)[:\s]|\b(postgres|mysql|mongodb|redis)\b.*\b(url|string|connection|credentials|password)\b/i },
  { category: "private_key", pattern: /\bprivate key|ssh key|rsa key|certificate|pem\b/i },
  { category: "credentials", pattern: /\bcredential|secret\b/i },
];

function shouldEvaluatePattern(text: string, secretPattern: SecretPattern): boolean {
  if (!secretPattern.context) {
    return true;
  }
  return secretPattern.context.test(text);
}

function matchSecretPatterns(text: string): SecretPattern[] {
  const matches: SecretPattern[] = [];

  for (const secretPattern of SECRET_PATTERNS) {
    if (!shouldEvaluatePattern(text, secretPattern)) {
      continue;
    }

    secretPattern.pattern.lastIndex = 0;
    if (secretPattern.pattern.test(text)) {
      matches.push(secretPattern);
    }
  }

  return matches;
}

export interface SecretDetectionResult {
  containsSecrets: boolean;
  detectedTypes: string[];
  redactedText: string;
}

/**
 * Detect if text contains secrets/credentials.
 */
export function detectSecrets(text: string): SecretDetectionResult {
  const matchedPatterns = matchSecretPatterns(text);
  if (matchedPatterns.length === 0) {
    return {
      containsSecrets: false,
      detectedTypes: [],
      redactedText: text,
    };
  }

  const detectedTypes = Array.from(new Set(matchedPatterns.map((entry) => entry.name)));
  let redactedText = text;

  for (const entry of matchedPatterns) {
    entry.pattern.lastIndex = 0;
    redactedText = redactedText.replace(entry.pattern, (match) => {
      const visibleChars = Math.min(8, Math.max(3, Math.floor(match.length * 0.15)));
      return `${match.slice(0, visibleChars)}[REDACTED]`;
    });
  }

  return {
    containsSecrets: true,
    detectedTypes,
    redactedText,
  };
}

export function containsSecrets(text: string): boolean {
  return matchSecretPatterns(text).length > 0;
}

export function redactSecrets(text: string): string {
  return detectSecrets(text).redactedText;
}

export function getSecretTypes(text: string): string[] {
  return detectSecrets(text).detectedTypes;
}

export function detectSecretCategories(text: string): SecretCategory[] {
  const matchedPatterns = matchSecretPatterns(text);
  return Array.from(new Set(matchedPatterns.map((entry) => entry.category)));
}

export function detectSecretQueryIntent(query: string): {
  isSecretQuery: boolean;
  matchedCategories: SecretCategory[];
} {
  const normalized = query.trim();
  if (!normalized) {
    return { isSecretQuery: false, matchedCategories: [] };
  }

  const patternMatched = SECRET_QUERY_PATTERNS.some((pattern) => pattern.test(normalized));
  const matchedCategories = SECRET_QUERY_CATEGORY_HINTS
    .filter((entry) => entry.pattern.test(normalized))
    .map((entry) => entry.category);

  if (!patternMatched && matchedCategories.length === 0) {
    return { isSecretQuery: false, matchedCategories: [] };
  }

  return {
    isSecretQuery: true,
    matchedCategories: Array.from(new Set(matchedCategories.length > 0 ? matchedCategories : ["credentials"])),
  };
}

export const VAULT_HINT_MESSAGE =
  "Sensitive credentials are stored in your secure vault. View them at fathippo.ai/vault";
