/**
 * FatHippo Cognitive API Client
 *
 * Handles communication with the FatHippo API for trace storage and retrieval.
 */
const DEFAULT_BASE_URL = 'https://fathippo.ai/api/v1';
export class CognitiveClient {
    apiKey;
    baseUrl;
    constructor(config) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    }
    async request(path, options = {}) {
        const url = `${this.baseUrl}${path}`;
        const headers = {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            ...options.headers,
        };
        const response = await fetch(url, {
            ...options,
            headers,
        });
        if (!response.ok) {
            const error = await response.text().catch(() => 'Unknown error');
            throw new Error(`FatHippo API error: ${response.status} - ${error}`);
        }
        const text = await response.text();
        if (!text) {
            return {};
        }
        return JSON.parse(text);
    }
    // ============================================================================
    // TRACE OPERATIONS
    // ============================================================================
    /**
     * Store a coding trace
     */
    async storeTrace(trace) {
        // Ensure trace is sanitized
        if (!trace.sanitized) {
            throw new Error('Trace must be sanitized before storage');
        }
        const response = await this.request('/cognitive/traces', {
            method: 'POST',
            body: JSON.stringify(trace),
        });
        return {
            trace: response.trace,
            matchedPatterns: response.matchedPatterns || [],
            suggestedApproaches: response.suggestedApproaches || [],
        };
    }
    /**
     * Get traces relevant to a problem
     */
    async getRelevantTraces(request) {
        const response = await this.request('/cognitive/traces/relevant', {
            method: 'POST',
            body: JSON.stringify(request),
        });
        return {
            applicationId: response.applicationId,
            traces: response.traces || [],
            patterns: response.patterns || [],
            skills: response.skills || [],
        };
    }
    /**
     * Get recent traces
     */
    async getRecentTraces(limit = 20) {
        const response = await this.request(`/cognitive/traces?limit=${limit}`);
        return response.traces || [];
    }
    async exportEvalFixtures(limit = 100, acceptedOnly = false) {
        const params = new URLSearchParams({
            limit: String(limit),
            acceptedOnly: acceptedOnly ? "1" : "0",
        });
        return this.request(`/cognitive/eval/fixtures?${params.toString()}`);
    }
    /**
     * Get trace by ID
     */
    async getTrace(traceId) {
        try {
            const response = await this.request(`/cognitive/traces/${traceId}`);
            return response.trace;
        }
        catch {
            return null;
        }
    }
    // ============================================================================
    // PATTERN OPERATIONS
    // ============================================================================
    /**
     * Get all patterns, optionally filtered by domain
     */
    async getPatterns(domain) {
        const params = domain ? `?domain=${encodeURIComponent(domain)}` : '';
        const response = await this.request(`/cognitive/patterns${params}`);
        return response.patterns || [];
    }
    /**
     * Find patterns that match a problem
     */
    async matchPatterns(problem, technologies) {
        const response = await this.request('/cognitive/patterns/match', {
            method: 'POST',
            body: JSON.stringify({ problem, technologies }),
        });
        return response.patterns || [];
    }
    /**
     * Submit feedback on pattern effectiveness
     */
    async submitPatternFeedback(feedback) {
        await this.request('/cognitive/patterns/feedback', {
            method: 'POST',
            body: JSON.stringify(feedback),
        });
    }
    /**
     * Get patterns that are candidates for skill synthesis
     */
    async getSkillCandidates() {
        const response = await this.request('/cognitive/patterns/skill-candidates');
        return response.patterns || [];
    }
    // ============================================================================
    // SKILL OPERATIONS (Phase 2)
    // ============================================================================
    /**
     * Get synthesized skills
     */
    async getSkills() {
        const response = await this.request('/cognitive/skills');
        return response.skills || [];
    }
    /**
     * Get a specific skill by ID
     */
    async getSkill(skillId) {
        try {
            const response = await this.request(`/cognitive/skills/${skillId}`);
            return response.skill;
        }
        catch {
            return null;
        }
    }
    async publishSkill(skillId) {
        try {
            const response = await this.request(`/cognitive/skills/${skillId}/publish`, { method: 'POST' });
            return response.skill;
        }
        catch {
            return null;
        }
    }
}
//# sourceMappingURL=client.js.map