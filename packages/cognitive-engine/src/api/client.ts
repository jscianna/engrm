/**
 * FatHippo Cognitive API Client
 * 
 * Handles communication with the FatHippo API for trace storage and retrieval.
 */

import type {
  CodingTrace,
  Pattern,
  RetrievalEvalDataset,
  SynthesizedSkill,
  StoreTraceResponse,
  GetRelevantTracesRequest,
  GetRelevantTracesResponse,
  PatternFeedbackRequest,
  CognitiveEngineConfig,
} from '../types.js';

const DEFAULT_BASE_URL = 'https://fathippo.ai/api/v1';

export class CognitiveClient {
  private apiKey: string;
  private baseUrl: string;
  
  constructor(config: CognitiveEngineConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  }
  
  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
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
      return {} as T;
    }
    
    return JSON.parse(text) as T;
  }
  
  // ============================================================================
  // TRACE OPERATIONS
  // ============================================================================
  
  /**
   * Store a coding trace
   */
  async storeTrace(trace: CodingTrace): Promise<StoreTraceResponse> {
    // Ensure trace is sanitized
    if (!trace.sanitized) {
      throw new Error('Trace must be sanitized before storage');
    }
    
    const response = await this.request<{
      trace: CodingTrace;
      matchedPatterns?: Pattern[];
      suggestedApproaches?: string[];
    }>('/cognitive/traces', {
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
  async getRelevantTraces(request: GetRelevantTracesRequest): Promise<GetRelevantTracesResponse> {
    const response = await this.request<{
      applicationId?: string;
      traces: CodingTrace[];
      patterns: Pattern[];
      skills: SynthesizedSkill[];
    }>('/cognitive/traces/relevant', {
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
  async getRecentTraces(limit = 20): Promise<CodingTrace[]> {
    const response = await this.request<{ traces: CodingTrace[] }>(
      `/cognitive/traces?limit=${limit}`
    );
    return response.traces || [];
  }

  async exportEvalFixtures(limit = 100, acceptedOnly = false): Promise<RetrievalEvalDataset> {
    const params = new URLSearchParams({
      limit: String(limit),
      acceptedOnly: acceptedOnly ? "1" : "0",
    });
    return this.request<RetrievalEvalDataset>(`/cognitive/eval/fixtures?${params.toString()}`);
  }
  
  /**
   * Get trace by ID
   */
  async getTrace(traceId: string): Promise<CodingTrace | null> {
    try {
      const response = await this.request<{ trace: CodingTrace }>(
        `/cognitive/traces/${traceId}`
      );
      return response.trace;
    } catch {
      return null;
    }
  }
  
  // ============================================================================
  // PATTERN OPERATIONS
  // ============================================================================
  
  /**
   * Get all patterns, optionally filtered by domain
   */
  async getPatterns(domain?: string): Promise<Pattern[]> {
    const params = domain ? `?domain=${encodeURIComponent(domain)}` : '';
    const response = await this.request<{ patterns: Pattern[] }>(
      `/cognitive/patterns${params}`
    );
    return response.patterns || [];
  }
  
  /**
   * Find patterns that match a problem
   */
  async matchPatterns(problem: string, technologies?: string[]): Promise<Pattern[]> {
    const response = await this.request<{ patterns: Pattern[] }>(
      '/cognitive/patterns/match',
      {
        method: 'POST',
        body: JSON.stringify({ problem, technologies }),
      }
    );
    return response.patterns || [];
  }
  
  /**
   * Submit feedback on pattern effectiveness
   */
  async submitPatternFeedback(feedback: PatternFeedbackRequest): Promise<void> {
    await this.request('/cognitive/patterns/feedback', {
      method: 'POST',
      body: JSON.stringify(feedback),
    });
  }
  
  /**
   * Get patterns that are candidates for skill synthesis
   */
  async getSkillCandidates(): Promise<Pattern[]> {
    const response = await this.request<{ patterns: Pattern[] }>(
      '/cognitive/patterns/skill-candidates'
    );
    return response.patterns || [];
  }
  
  // ============================================================================
  // SKILL OPERATIONS (Phase 2)
  // ============================================================================
  
  /**
   * Get synthesized skills
   */
  async getSkills(): Promise<SynthesizedSkill[]> {
    const response = await this.request<{ skills: SynthesizedSkill[] }>(
      '/cognitive/skills'
    );
    return response.skills || [];
  }
  
  /**
   * Get a specific skill by ID
   */
  async getSkill(skillId: string): Promise<SynthesizedSkill | null> {
    try {
      const response = await this.request<{ skill: SynthesizedSkill }>(
        `/cognitive/skills/${skillId}`
      );
      return response.skill;
    } catch {
      return null;
    }
  }

  async publishSkill(skillId: string): Promise<SynthesizedSkill | null> {
    try {
      const response = await this.request<{ skill: SynthesizedSkill }>(
        `/cognitive/skills/${skillId}/publish`,
        { method: 'POST' },
      );
      return response.skill;
    } catch {
      return null;
    }
  }
}
