/**
 * FatHippo Cognitive Engine
 *
 * Main engine that ties together trace capture, pattern extraction,
 * and context injection for AI coding agents.
 */
import { TraceCapture } from './hooks/trace-capture.js';
import { PatternExtractor } from './extraction/pattern-extractor.js';
import { CognitiveClient } from './api/client.js';
export class CognitiveEngine {
    config;
    client;
    traceCapture;
    patternExtractor;
    // Cache for patterns (refreshed periodically)
    patternCache = [];
    patternCacheTime = 0;
    PATTERN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    constructor(config) {
        this.config = config;
        this.client = new CognitiveClient(config);
        this.traceCapture = new TraceCapture(config);
        this.patternExtractor = new PatternExtractor(config);
    }
    /**
     * Get relevant context for a coding problem
     *
     * This is called during context assembly to inject relevant
     * traces, patterns, and skills into the agent's context.
     */
    async getRelevantContext(problem, technologies) {
        const traces = [];
        const patterns = [];
        const skills = [];
        try {
            // Get relevant traces from API
            if (this.config.injectRelevantTraces) {
                const response = await this.client.getRelevantTraces({
                    problem,
                    context: technologies ? { technologies } : undefined,
                    limit: this.config.maxInjectedTraces || 5,
                });
                traces.push(...response.traces);
                patterns.push(...response.patterns);
                skills.push(...response.skills);
            }
            // Also match against cached patterns locally
            if (this.config.injectPatterns) {
                await this.refreshPatternCache();
                const matchedPatterns = this.patternExtractor.matchPatterns(problem, technologies || [], this.patternCache);
                // Add patterns not already in response
                const existingIds = new Set(patterns.map(p => p.id));
                for (const pattern of matchedPatterns) {
                    if (!existingIds.has(pattern.id)) {
                        patterns.push(pattern);
                    }
                }
            }
        }
        catch (error) {
            console.error('[CognitiveEngine] Error getting relevant context:', error);
        }
        // Limit results
        const limitedTraces = traces.slice(0, this.config.maxInjectedTraces || 5);
        const limitedPatterns = patterns.slice(0, this.config.maxInjectedPatterns || 3);
        return {
            traces: limitedTraces,
            patterns: limitedPatterns,
            skills,
            formatted: this.formatContext(limitedTraces, limitedPatterns, skills),
        };
    }
    /**
     * Capture a trace from a completed coding turn
     *
     * Called after a coding session/turn to capture what happened.
     */
    async captureFromTurn(params) {
        if (!this.config.captureEnabled) {
            return null;
        }
        // Check if we should capture this session
        if (!this.traceCapture.shouldCapture(params.messages)) {
            return null;
        }
        try {
            // Capture the trace
            const trace = await this.traceCapture.captureTrace(params);
            // Store to API
            const response = await this.client.storeTrace(trace);
            // If patterns were matched, provide feedback
            if (response.matchedPatterns.length > 0 && trace.outcome === 'success') {
                // Positive feedback for matched patterns that led to success
                for (const pattern of response.matchedPatterns) {
                    await this.client.submitPatternFeedback({
                        patternId: pattern.id,
                        traceId: trace.id,
                        outcome: 'success',
                    }).catch(() => { }); // Don't fail on feedback errors
                }
            }
            return response.trace;
        }
        catch (error) {
            console.error('[CognitiveEngine] Error capturing trace:', error);
            return null;
        }
    }
    /**
     * Process traces and extract patterns (batch operation)
     *
     * Called during compaction/dream cycle to extract patterns from traces.
     */
    async extractPatterns() {
        if (!this.config.patternExtractionEnabled) {
            return [];
        }
        try {
            // Get recent traces
            const traces = await this.client.getRecentTraces(100);
            // Cluster and extract patterns
            const clusters = this.patternExtractor.clusterTraces(traces);
            const patterns = [];
            for (const cluster of clusters) {
                const pattern = this.patternExtractor.extractPattern(cluster);
                if (pattern) {
                    patterns.push(pattern);
                }
            }
            // Invalidate pattern cache
            this.patternCacheTime = 0;
            return patterns;
        }
        catch (error) {
            console.error('[CognitiveEngine] Error extracting patterns:', error);
            return [];
        }
    }
    /**
     * Get patterns that are ready for skill synthesis
     */
    async getSkillCandidates() {
        if (!this.config.skillSynthesisEnabled) {
            return [];
        }
        try {
            return await this.client.getSkillCandidates();
        }
        catch (error) {
            console.error('[CognitiveEngine] Error getting skill candidates:', error);
            return [];
        }
    }
    /**
     * Submit feedback on a pattern's effectiveness
     */
    async submitPatternFeedback(patternId, traceId, outcome, notes) {
        await this.client.submitPatternFeedback({
            patternId,
            traceId,
            outcome,
            notes,
        });
        // Invalidate cache
        this.patternCacheTime = 0;
    }
    // ============================================================================
    // FORMATTING
    // ============================================================================
    formatContext(traces, patterns, skills) {
        const sections = [];
        // Format patterns first (most actionable)
        if (patterns.length > 0) {
            const patternSection = patterns.map(p => `• [${p.domain}] ${p.approach.slice(0, 200)}${p.approach.length > 200 ? '...' : ''} (${Math.round(p.confidence * 100)}% confidence)`).join('\n');
            sections.push(`## Learned Patterns\n${patternSection}`);
        }
        // Format relevant traces
        if (traces.length > 0) {
            const traceSection = traces.map(t => {
                const outcome = t.outcome === 'success' ? '✓' : t.outcome === 'failed' ? '✗' : '~';
                const solution = t.solution ? ` → ${t.solution.slice(0, 100)}...` : '';
                return `• ${outcome} ${t.problem.slice(0, 100)}${solution}`;
            }).join('\n');
            sections.push(`## Past Similar Problems\n${traceSection}`);
        }
        // Format skills (if any)
        if (skills.length > 0) {
            const skillSection = skills.map(s => `• [${s.name}] ${s.description}`).join('\n');
            sections.push(`## Available Skills\nUse /skill-name to load:\n${skillSection}`);
        }
        if (sections.length === 0) {
            return '';
        }
        return `\n## Cognitive Context (from past coding sessions)\n${sections.join('\n\n')}\n`;
    }
    // ============================================================================
    // CACHE MANAGEMENT
    // ============================================================================
    async refreshPatternCache() {
        const now = Date.now();
        if (now - this.patternCacheTime < this.PATTERN_CACHE_TTL) {
            return; // Cache is fresh
        }
        try {
            this.patternCache = await this.client.getPatterns();
            this.patternCacheTime = now;
        }
        catch (error) {
            console.error('[CognitiveEngine] Error refreshing pattern cache:', error);
        }
    }
}
//# sourceMappingURL=engine.js.map