/**
 * User DNA Serializer
 *
 * Formats User DNA for context injection.
 * Target: under 500 tokens, compact markdown.
 */
/**
 * Format User DNA as a compact markdown block for context injection.
 * Only includes sections where confidence > 0.2.
 * Target: under 500 tokens.
 */
export function formatUserDNAForInjection(dna) {
    if (dna.sessionCount === 0) {
        return "";
    }
    const sections = [];
    sections.push("## User Profile");
    // Style line (communication + work patterns)
    if (dna.confidence.communication > 0.2 || dna.confidence.workPatterns > 0.2) {
        const parts = [];
        if (dna.confidence.communication > 0.2) {
            const verbosityLabel = dna.communication.verbosity === "terse"
                ? "Concise"
                : dna.communication.verbosity === "detailed"
                    ? "Detailed"
                    : "Balanced";
            const styleLabel = dna.communication.style === "commands"
                ? "command-driven"
                : dna.communication.style === "questions"
                    ? "question-oriented"
                    : "collaborative";
            parts.push(`${verbosityLabel}, ${styleLabel}`);
        }
        if (dna.confidence.workPatterns > 0.2) {
            const avgMin = Math.round(dna.workPatterns.averageSessionMinutes);
            parts.push(`avg ${avgMin}min sessions`);
            if (dna.workPatterns.primaryFocus.length > 0) {
                parts.push(`focuses on ${dna.workPatterns.primaryFocus.join(", ")}`);
            }
        }
        if (parts.length > 0) {
            sections.push(`**Style:** ${parts.join(" · ")}`);
        }
    }
    // Quality line
    if (dna.confidence.qualitySignals > 0.2) {
        const parts = [];
        if (dna.qualitySignals.requestsTests > 0.3) {
            parts.push(`Expects tests (${Math.round(dna.qualitySignals.requestsTests * 100)}%)`);
        }
        if (dna.qualitySignals.requestsTypeChecking > 0.3) {
            parts.push("strict types");
        }
        if (dna.qualitySignals.overrideRate > 0.15) {
            parts.push(`overrides agent ${Math.round(dna.qualitySignals.overrideRate * 100)}% of the time`);
        }
        if (dna.qualitySignals.refactorFrequency > 0.3) {
            parts.push("frequent refactoring");
        }
        if (parts.length > 0) {
            sections.push(`**Quality:** ${parts.join(" · ")}`);
        }
    }
    // Conventions line
    if (dna.confidence.conventions > 0.2) {
        const parts = [];
        if (dna.conventions.namingStyle !== "mixed") {
            parts.push(dna.conventions.namingStyle);
        }
        for (const pattern of dna.conventions.preferredPatterns.slice(0, 3)) {
            parts.push(pattern);
        }
        if (parts.length > 0) {
            sections.push(`**Conventions:** ${parts.join(", ")}`);
        }
    }
    // Agent tuning directives
    if (dna.agentDirectives.length > 0) {
        sections.push(`**Agent tuning:** ${dna.agentDirectives.join(". ")}.`);
    }
    // Only return if we have meaningful content beyond the header
    if (sections.length <= 1) {
        return "";
    }
    return sections.join("\n") + "\n";
}
//# sourceMappingURL=serializer.js.map