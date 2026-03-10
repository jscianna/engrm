/**
 * Secret Sanitization
 *
 * CRITICAL: All traces must be sanitized before storage or sharing.
 * This catches API keys, tokens, passwords, connection strings, etc.
 */
// Patterns that match secrets - order matters (more specific first)
const SECRET_PATTERNS = [
    // Specific API key formats
    { pattern: /sk-[a-zA-Z0-9]{32,}/g, name: 'OpenAI key' },
    { pattern: /sk-proj-[a-zA-Z0-9\-_]{32,}/g, name: 'OpenAI project key' },
    { pattern: /ghp_[a-zA-Z0-9]{36,}/g, name: 'GitHub PAT' },
    { pattern: /gho_[a-zA-Z0-9]{36,}/g, name: 'GitHub OAuth' },
    { pattern: /github_pat_[a-zA-Z0-9_]{22,}/g, name: 'GitHub fine-grained PAT' },
    { pattern: /mem_[a-zA-Z0-9]{32,}/g, name: 'FatHippo key' },
    { pattern: /AKIA[A-Z0-9]{16}/g, name: 'AWS access key' },
    { pattern: /anthropic-[a-zA-Z0-9\-_]{32,}/g, name: 'Anthropic key' },
    { pattern: /sk-ant-[a-zA-Z0-9\-_]{32,}/g, name: 'Anthropic key' },
    { pattern: /xoxb-[a-zA-Z0-9\-]+/g, name: 'Slack bot token' },
    { pattern: /xoxp-[a-zA-Z0-9\-]+/g, name: 'Slack user token' },
    { pattern: /eyJ[a-zA-Z0-9\-_]+\.eyJ[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/g, name: 'JWT' },
    // Connection strings
    { pattern: /mongodb(\+srv)?:\/\/[^\s"'`]+/gi, name: 'MongoDB URI' },
    { pattern: /postgres(ql)?:\/\/[^\s"'`]+/gi, name: 'Postgres URI' },
    { pattern: /mysql:\/\/[^\s"'`]+/gi, name: 'MySQL URI' },
    { pattern: /redis:\/\/[^\s"'`]+/gi, name: 'Redis URI' },
    { pattern: /amqp:\/\/[^\s"'`]+/gi, name: 'AMQP URI' },
    // Private keys
    { pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g, name: 'Private key' },
    { pattern: /-----BEGIN\s+EC\s+PRIVATE\s+KEY-----[\s\S]*?-----END\s+EC\s+PRIVATE\s+KEY-----/g, name: 'EC Private key' },
    { pattern: /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----[\s\S]*?-----END\s+OPENSSH\s+PRIVATE\s+KEY-----/g, name: 'SSH key' },
    // Generic patterns (less specific, run last)
    { pattern: /(['"]?)(?:api[_-]?key|apikey)(['"]?\s*[:=]\s*)(['"]?)([a-zA-Z0-9\-_]{20,})\3/gi, name: 'API key' },
    { pattern: /(['"]?)(?:secret|secret[_-]?key)(['"]?\s*[:=]\s*)(['"]?)([a-zA-Z0-9\-_]{16,})\3/gi, name: 'Secret' },
    { pattern: /(['"]?)(?:password|passwd|pwd)(['"]?\s*[:=]\s*)(['"]?)([^\s'"]{8,})\3/gi, name: 'Password' },
    { pattern: /(['"]?)(?:bearer|token|auth[_-]?token|access[_-]?token)(['"]?\s*[:=]\s*)(['"]?)([a-zA-Z0-9\-_.]{20,})\3/gi, name: 'Token' },
    // AWS secret key (40 chars, follows access key pattern)
    { pattern: /(?<=AKIA[A-Z0-9]{16}['":\s,]+)[a-zA-Z0-9+/]{40}/g, name: 'AWS secret key' },
];
/**
 * Sanitize a string by replacing detected secrets with [REDACTED]
 */
export function sanitizeString(input) {
    if (!input || typeof input !== 'string') {
        return input;
    }
    let result = input;
    for (const { pattern, name } of SECRET_PATTERNS) {
        // Reset lastIndex for global patterns
        pattern.lastIndex = 0;
        result = result.replace(pattern, `[REDACTED:${name}]`);
    }
    return result;
}
/**
 * Sanitize an array of strings
 */
export function sanitizeStringArray(input) {
    if (!Array.isArray(input)) {
        return input;
    }
    return input.map(sanitizeString);
}
/**
 * Sanitize trace context
 */
function sanitizeContext(context) {
    return {
        ...context,
        technologies: context.technologies, // These are safe
        files: context.files, // File paths are generally safe
        errorMessages: context.errorMessages ? sanitizeStringArray(context.errorMessages) : undefined,
        stackTraces: context.stackTraces ? sanitizeStringArray(context.stackTraces) : undefined,
        environment: context.environment,
        projectType: context.projectType,
    };
}
/**
 * Sanitize an approach record
 */
function sanitizeApproach(approach) {
    return {
        ...approach,
        description: sanitizeString(approach.description),
        learnings: approach.learnings ? sanitizeString(approach.learnings) : undefined,
    };
}
/**
 * Sanitize a complete coding trace
 *
 * CRITICAL: Call this before ANY storage or sharing of traces.
 */
export function sanitizeTrace(trace) {
    return {
        ...trace,
        // Sanitize text fields
        problem: sanitizeString(trace.problem),
        reasoning: sanitizeString(trace.reasoning),
        solution: trace.solution ? sanitizeString(trace.solution) : undefined,
        errorMessage: trace.errorMessage ? sanitizeString(trace.errorMessage) : undefined,
        // Sanitize nested structures
        context: sanitizeContext(trace.context),
        approaches: trace.approaches.map(sanitizeApproach),
        // Mark as sanitized
        sanitized: true,
        sanitizedAt: new Date().toISOString(),
    };
}
/**
 * Check if a string contains potential secrets (for validation)
 */
export function containsSecrets(input) {
    if (!input || typeof input !== 'string') {
        return false;
    }
    for (const { pattern } of SECRET_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(input)) {
            return true;
        }
    }
    return false;
}
/**
 * Get list of detected secret types in a string (for logging/debugging)
 */
export function detectSecretTypes(input) {
    if (!input || typeof input !== 'string') {
        return [];
    }
    const detected = [];
    for (const { pattern, name } of SECRET_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(input)) {
            detected.push(name);
        }
    }
    return [...new Set(detected)]; // Dedupe
}
//# sourceMappingURL=sanitize.js.map