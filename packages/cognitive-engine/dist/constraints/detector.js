/**
 * Constraint Detector
 *
 * Detects when users mention constraints/rules and auto-stores them.
 * Constraints always inject and get checked before risky actions.
 */
// Patterns that indicate a constraint is being stated
const CONSTRAINT_PATTERNS = [
    // Prohibitions
    /\b(?:don'?t|do not|never|must not|should not|shouldn'?t|cannot|can'?t)\b.*\b(push|commit|share|publish|send|post|expose|leak|upload)/i,
    /\b(?:keep|make sure|ensure).*\b(private|secret|local|confidential|internal)/i,
    /\b(?:private|confidential|internal|secret)\b.*\b(?:only|never share)/i,
    // Requirements  
    /\balways\b.*\b(ask|check|verify|confirm)\b.*\bbefore\b/i,
    /\bmust\b.*\b(first|before|always)/i,
    // IP/Security specific
    /\b(?:proprietary|intellectual property|ip)\b/i,
    /\bdo not (?:open.?source|make public)/i,
];
// Keywords that suggest what the constraint is about
const TRIGGER_KEYWORDS = {
    'git': ['push', 'commit', 'github', 'repo', 'repository'],
    'sharing': ['share', 'publish', 'post', 'send', 'upload', 'expose'],
    'privacy': ['private', 'secret', 'confidential', 'internal'],
    'code': ['code', 'source', 'algorithm', 'implementation'],
    'api': ['api', 'key', 'token', 'secret', 'credential'],
};
/**
 * Check if a message contains a constraint statement
 */
export function detectConstraint(message) {
    const messageLower = message.toLowerCase();
    // Check against constraint patterns
    for (const pattern of CONSTRAINT_PATTERNS) {
        if (pattern.test(message)) {
            // Extract the rule (the matching sentence)
            const sentences = message.split(/[.!?\n]+/).filter(s => s.trim());
            const matchingSentence = sentences.find(s => pattern.test(s));
            if (matchingSentence) {
                const rule = matchingSentence.trim();
                const triggers = extractTriggers(messageLower);
                const severity = determineSeverity(messageLower);
                return {
                    isConstraint: true,
                    rule,
                    triggers,
                    severity,
                };
            }
        }
    }
    return { isConstraint: false };
}
/**
 * Extract trigger keywords from a constraint message
 */
function extractTriggers(message) {
    const triggers = [];
    for (const [category, keywords] of Object.entries(TRIGGER_KEYWORDS)) {
        for (const keyword of keywords) {
            if (message.includes(keyword)) {
                triggers.push(keyword);
                if (!triggers.includes(category)) {
                    triggers.push(category);
                }
            }
        }
    }
    return [...new Set(triggers)];
}
/**
 * Determine severity based on language intensity
 */
function determineSeverity(message) {
    const criticalWords = [
        'never', 'must not', 'critical', 'important', 'absolutely',
        'proprietary', 'confidential', 'secret', 'private'
    ];
    for (const word of criticalWords) {
        if (message.includes(word)) {
            return 'critical';
        }
    }
    return 'warning';
}
/**
 * Check if an action might violate any constraints
 */
export function checkActionAgainstConstraints(action, constraints) {
    const actionLower = action.toLowerCase();
    const violated = [];
    const warnings = [];
    for (const constraint of constraints) {
        if (!constraint.active)
            continue;
        // Check if action matches any trigger
        const matches = constraint.triggers.some(trigger => actionLower.includes(trigger.toLowerCase()));
        if (matches) {
            if (constraint.severity === 'critical') {
                violated.push(constraint);
            }
            else {
                warnings.push(constraint);
            }
        }
    }
    return { violated, warnings };
}
/**
 * Format constraints for injection into context
 */
export function formatConstraintsForInjection(constraints) {
    if (constraints.length === 0)
        return '';
    const critical = constraints.filter(c => c.severity === 'critical' && c.active);
    const warnings = constraints.filter(c => c.severity === 'warning' && c.active);
    const lines = ['## Active Constraints'];
    if (critical.length > 0) {
        lines.push('⚠️ **Critical:**');
        for (const c of critical) {
            lines.push(`• ${c.rule}`);
        }
    }
    if (warnings.length > 0) {
        lines.push('**Warnings:**');
        for (const c of warnings) {
            lines.push(`• ${c.rule}`);
        }
    }
    return lines.join('\n') + '\n';
}
//# sourceMappingURL=detector.js.map