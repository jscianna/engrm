/**
 * Pattern Extractor
 * 
 * Extracts patterns from clusters of similar traces.
 * MVP: Simple keyword-based clustering. Later: embedding-based.
 */

import type {
  CodingTrace,
  Pattern,
  PatternTrigger,
  PatternStatus,
  TraceType,
  CognitiveEngineConfig,
} from '../types.js';

interface TraceCluster {
  id: string;
  domain: string;
  traces: CodingTrace[];
  keywords: string[];
  successRate: number;
}

export class PatternExtractor {
  private config: CognitiveEngineConfig;
  
  constructor(config: CognitiveEngineConfig) {
    this.config = config;
  }
  
  /**
   * Cluster similar traces using keyword overlap
   * 
   * MVP approach: Group by technology + problem type + key error messages
   * Future: Use embeddings for semantic similarity
   */
  clusterTraces(traces: CodingTrace[]): TraceCluster[] {
    const clusters = new Map<string, CodingTrace[]>();
    
    for (const trace of traces) {
      // Generate cluster key from technologies + type
      const key = this.generateClusterKey(trace);
      
      if (!clusters.has(key)) {
        clusters.set(key, []);
      }
      clusters.get(key)!.push(trace);
    }
    
    // Convert to TraceCluster objects
    const result: TraceCluster[] = [];
    
    for (const [, clusterTraces] of clusters) {
      // Only include clusters with minimum traces
      if (clusterTraces.length < (this.config.minTracesForPattern || 3)) {
        continue;
      }
      
      const successCount = clusterTraces.filter(t => t.outcome === 'success').length;
      const successRate = successCount / clusterTraces.length;
      
      result.push({
        id: crypto.randomUUID(),
        domain: this.extractDomain(clusterTraces),
        traces: clusterTraces,
        keywords: this.extractKeywords(clusterTraces),
        successRate,
      });
    }
    
    return result;
  }
  
  /**
   * Extract a pattern from a cluster of similar traces
   */
  extractPattern(cluster: TraceCluster): Pattern | null {
    // Need minimum success rate
    const minSuccessRate = this.config.minSuccessRateForPattern || 0.7;
    if (cluster.successRate < minSuccessRate) {
      return null;
    }
    
    // Find the most successful approach
    const approach = this.findBestApproach(cluster.traces);
    if (!approach) {
      return null;
    }
    
    // Build trigger from cluster characteristics
    const trigger = this.buildTrigger(cluster);
    
    const successCount = cluster.traces.filter(t => t.outcome === 'success').length;
    const failCount = cluster.traces.filter(t => t.outcome === 'failed').length;
    
    return {
      id: crypto.randomUUID(),
      domain: cluster.domain,
      trigger,
      approach,
      confidence: cluster.successRate,
      successCount,
      failCount,
      sourceTraceIds: cluster.traces.map(t => t.id),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'candidate' as PatternStatus,
    };
  }
  
  /**
   * Update pattern confidence based on new trace feedback
   */
  updatePatternConfidence(
    pattern: Pattern,
    outcome: 'success' | 'failure'
  ): Pattern {
    const newSuccessCount = pattern.successCount + (outcome === 'success' ? 1 : 0);
    const newFailCount = pattern.failCount + (outcome === 'failure' ? 1 : 0);
    const total = newSuccessCount + newFailCount;
    
    return {
      ...pattern,
      successCount: newSuccessCount,
      failCount: newFailCount,
      confidence: newSuccessCount / total,
      updatedAt: new Date().toISOString(),
    };
  }
  
  /**
   * Find patterns that match a given problem
   */
  matchPatterns(
    problem: string,
    technologies: string[],
    patterns: Pattern[]
  ): Pattern[] {
    const problemLower = problem.toLowerCase();
    const techSet = new Set(technologies.map(t => t.toLowerCase()));
    
    const matches: Array<{ pattern: Pattern; score: number }> = [];
    
    for (const pattern of patterns) {
      if (pattern.status === 'deprecated') continue;
      
      let score = 0;
      
      // Check keyword matches
      for (const keyword of pattern.trigger.keywords) {
        if (problemLower.includes(keyword.toLowerCase())) {
          score += 2;
        }
      }
      
      // Check technology matches
      if (pattern.trigger.technologies) {
        for (const tech of pattern.trigger.technologies) {
          if (techSet.has(tech.toLowerCase())) {
            score += 3;
          }
        }
      }
      
      // Check error pattern matches
      if (pattern.trigger.errorPatterns) {
        for (const errorPattern of pattern.trigger.errorPatterns) {
          try {
            const regex = new RegExp(errorPattern, 'i');
            if (regex.test(problem)) {
              score += 5;
            }
          } catch {
            // Invalid regex, skip
          }
        }
      }
      
      // Factor in confidence
      score *= pattern.confidence;
      
      if (score > 0) {
        matches.push({ pattern, score });
      }
    }
    
    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);
    
    // Return top matches
    return matches.slice(0, 5).map(m => m.pattern);
  }
  
  /**
   * Check if a pattern is ready for skill synthesis
   */
  isReadyForSynthesis(pattern: Pattern): boolean {
    const minPatterns = this.config.minPatternsForSkill || 5;
    const minSuccessRate = this.config.minSuccessRateForSkill || 0.8;
    
    const totalApplications = pattern.successCount + pattern.failCount;
    
    return (
      totalApplications >= minPatterns &&
      pattern.confidence >= minSuccessRate &&
      (pattern.status === 'active_local' || pattern.status === 'active_global')
    );
  }
  
  // ============================================================================
  // HELPER METHODS
  // ============================================================================
  
  private generateClusterKey(trace: CodingTrace): string {
    const techs = trace.context.technologies.sort().join(',') || 'unknown';
    const type = trace.type;
    
    // Add error signature if present
    let errorSig = '';
    if (trace.context.errorMessages && trace.context.errorMessages.length > 0) {
      // Extract error type (e.g., "TypeError", "Cannot read")
      const firstError = trace.context.errorMessages[0];
      const errorMatch = firstError.match(/^(\w+Error|Cannot\s+\w+)/);
      if (errorMatch) {
        errorSig = `-${errorMatch[1]}`;
      }
    }
    
    return `${techs}:${type}${errorSig}`;
  }
  
  private extractDomain(traces: CodingTrace[]): string {
    // Find most common technology
    const techCounts = new Map<string, number>();
    
    for (const trace of traces) {
      for (const tech of trace.context.technologies) {
        techCounts.set(tech, (techCounts.get(tech) || 0) + 1);
      }
    }
    
    let maxTech = 'general';
    let maxCount = 0;
    
    for (const [tech, count] of techCounts) {
      if (count > maxCount) {
        maxTech = tech;
        maxCount = count;
      }
    }
    
    return maxTech;
  }
  
  private extractKeywords(traces: CodingTrace[]): string[] {
    const wordCounts = new Map<string, number>();
    
    for (const trace of traces) {
      // Extract words from problem description
      const words = trace.problem
        .toLowerCase()
        .split(/\W+/)
        .filter(w => w.length > 3);
      
      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }
    
    // Get most common words
    const sorted = [...wordCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
    
    return sorted;
  }
  
  private findBestApproach(traces: CodingTrace[]): string | null {
    // Get successful traces
    const successful = traces.filter(t => t.outcome === 'success');
    if (successful.length === 0) {
      return null;
    }
    
    // Find common solution patterns
    const solutions = successful
      .filter(t => t.solution)
      .map(t => t.solution!);
    
    if (solutions.length === 0) {
      return null;
    }
    
    // For MVP, return the first successful solution
    // Future: Use LLM to synthesize common approach
    return solutions[0].slice(0, 1000);
  }
  
  private buildTrigger(cluster: TraceCluster): PatternTrigger {
    const keywords = cluster.keywords;
    
    // Extract technologies from all traces
    const technologies = new Set<string>();
    for (const trace of cluster.traces) {
      for (const tech of trace.context.technologies) {
        technologies.add(tech);
      }
    }
    
    // Extract error patterns
    const errorPatterns: string[] = [];
    for (const trace of cluster.traces) {
      if (trace.context.errorMessages) {
        for (const error of trace.context.errorMessages) {
          // Extract the error type as a pattern
          const match = error.match(/^(\w+Error|Cannot\s+\w+\s+\w+)/);
          if (match && !errorPatterns.includes(match[1])) {
            errorPatterns.push(match[1]);
          }
        }
      }
    }
    
    // Extract problem types
    const problemTypes = new Set<TraceType>();
    for (const trace of cluster.traces) {
      problemTypes.add(trace.type);
    }
    
    return {
      keywords,
      technologies: [...technologies],
      errorPatterns: errorPatterns.length > 0 ? errorPatterns : undefined,
      problemTypes: [...problemTypes],
    };
  }
}
