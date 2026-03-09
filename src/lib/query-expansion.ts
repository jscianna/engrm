/**
 * Query Expansion for Better Retrieval
 * 
 * Detects query intent and generates variants to improve recall,
 * especially for decision-type queries that often mismatch stored memory phrasing.
 */

// Decision-related query patterns
const DECISION_PATTERNS = [
  /^why\s+(did\s+)?(we|i|you|they)\s+/i,
  /^why\s+/i,
  /\bwhy\s+(not|choose|chose|pick|picked|select|selected|decide|decided|use|used)\b/i,
  /\b(rationale|reasoning|tradeoff|trade-off|decision|chose|chosen)\b/i,
  /\binstead\s+of\b/i,
  /\bover\s+(the\s+)?(other|alternative)/i,
  /\bwhat\s+(made|led)\s+(us|you|me|them)\s+to\b/i,
  // "What X do we use" patterns - asking about established decisions
  /\bwhat\s+(strategy|approach|method|framework|tool|process|workflow|system)\s+(do|did|does)\s+(we|you|they)\s+use\b/i,
  /\bwhat\s+.+\s+do\s+we\s+use\b/i,
  /\bhow\s+do\s+(we|you)\s+(handle|manage|do|approach)\b/i,
  /\bwhat\s+(is|are)\s+our\s+(strategy|approach|process|workflow|policy)\b/i,
];

// Technical/config query patterns  
const TECHNICAL_PATTERNS = [
  /\b(ttl|timeout|expir|config|setting|parameter|threshold)\b/i,
  /\bhow\s+(long|many|much|often)\b/i,
  /\bwhat\s+(is|are)\s+the\s+/i,
  // "When does X expire" patterns
  /\bwhen\s+(do|does|did)\s+.+\s+(expire|timeout|reset|refresh)\b/i,
  /\bwhen\s+(is|are)\s+.+\s+(due|scheduled|set)\b/i,
  /\b(lifetime|duration|validity)\s+of\b/i,
];

export type QueryIntent = 'decision' | 'technical' | 'general';

export function detectQueryIntent(query: string): QueryIntent {
  const normalized = query.toLowerCase().trim();
  
  for (const pattern of DECISION_PATTERNS) {
    if (pattern.test(normalized)) {
      return 'decision';
    }
  }
  
  for (const pattern of TECHNICAL_PATTERNS) {
    if (pattern.test(normalized)) {
      return 'technical';
    }
  }
  
  return 'general';
}

/**
 * Expand a query into multiple variants for better recall.
 * Returns the original query plus variants.
 */
export function expandQuery(query: string): string[] {
  const intent = detectQueryIntent(query);
  const variants: string[] = [query]; // Always include original
  
  if (intent === 'decision') {
    variants.push(...expandDecisionQuery(query));
  } else if (intent === 'technical') {
    variants.push(...expandTechnicalQuery(query));
  }
  
  // Dedupe and limit
  return [...new Set(variants)].slice(0, 4);
}

function expandDecisionQuery(query: string): string[] {
  const variants: string[] = [];
  const normalized = query.toLowerCase();
  
  // Extract key entities (simple heuristic: capitalized words, tech terms)
  const entities = extractKeyTerms(query);
  
  // "Why X instead of Y" → "chose X over Y", "decision X vs Y"
  const insteadMatch = normalized.match(/why\s+(.+?)\s+instead\s+of\s+(.+?)(?:\?|$)/i);
  if (insteadMatch) {
    const [, chosen, alternative] = insteadMatch;
    variants.push(`chose ${chosen} over ${alternative}`);
    variants.push(`decision ${chosen} vs ${alternative}`);
    variants.push(`${chosen} instead of ${alternative} rationale`);
  }
  
  // "Why did we choose X" → "decision to use X", "rationale for X"
  const chooseMatch = normalized.match(/why\s+(?:did\s+)?(?:we|i|you)\s+(?:choose|chose|pick|use|select)\s+(.+?)(?:\?|$)/i);
  if (chooseMatch) {
    const [, thing] = chooseMatch;
    variants.push(`decision to use ${thing}`);
    variants.push(`rationale for ${thing}`);
    variants.push(`chose ${thing}`);
  }
  
  // Generic "why" → add decision-related terms
  if (normalized.startsWith('why ') && variants.length === 0) {
    const subject = query.replace(/^why\s+/i, '').replace(/\?$/, '');
    variants.push(`decision: ${subject}`);
    variants.push(`rationale: ${subject}`);
  }
  
  // "What X do we use" → "adopted X", "using X", "switched to X"
  const useMatch = normalized.match(/what\s+(.+?)\s+do\s+(?:we|you)\s+use/i);
  if (useMatch) {
    const [, thing] = useMatch;
    variants.push(`adopted ${thing}`);
    variants.push(`using ${thing}`);
    variants.push(`switched to ${thing}`);
    variants.push(`${thing} we use`);
  }
  
  // "How do we handle X" → "approach to X", "X process"
  const handleMatch = normalized.match(/how\s+do\s+(?:we|you)\s+(?:handle|manage|do|approach)\s+(.+?)(?:\?|$)/i);
  if (handleMatch) {
    const [, thing] = handleMatch;
    variants.push(`approach to ${thing}`);
    variants.push(`${thing} process`);
    variants.push(`${thing} workflow`);
  }
  
  // Add entity-focused variant
  if (entities.length > 0) {
    variants.push(`decision ${entities.join(' ')}`);
  }
  
  return variants;
}

function expandTechnicalQuery(query: string): string[] {
  const variants: string[] = [];
  const normalized = query.toLowerCase();
  
  // "What is the X TTL/timeout/expiry" → "X set to", "X configured"
  const configMatch = normalized.match(/what\s+(?:is|are)\s+(?:the\s+)?(.+?)\s*(ttl|timeout|expir|setting|config)/i);
  if (configMatch) {
    const [, thing, type] = configMatch;
    variants.push(`${thing} ${type} set to`);
    variants.push(`${thing} configured`);
  }
  
  // "How long does X" → "X duration", "X expires after"
  const durationMatch = normalized.match(/how\s+long\s+(?:does|do|is|are)\s+(.+?)(?:\?|$)/i);
  if (durationMatch) {
    const [, thing] = durationMatch;
    variants.push(`${thing} duration`);
    variants.push(`${thing} expires after`);
    variants.push(`${thing} lifetime`);
  }
  
  // "When does X expire" → "X expire after", "X expiration"
  const expireMatch = normalized.match(/when\s+(?:do|does|did)\s+(.+?)\s+(?:expire|timeout|reset)/i);
  if (expireMatch) {
    const [, thing] = expireMatch;
    variants.push(`${thing} expire after`);
    variants.push(`${thing} expiration`);
    variants.push(`${thing} lifetime`);
    variants.push(`${thing} valid for`);
  }
  
  return variants;
}

function extractKeyTerms(query: string): string[] {
  // Extract likely entity names: capitalized words, tech terms, quoted strings
  const terms: string[] = [];
  
  // Capitalized words (excluding sentence start)
  const capMatches = query.match(/(?<!^)(?<![\.\?!]\s)[A-Z][a-z]+/g);
  if (capMatches) terms.push(...capMatches);
  
  // Common tech terms
  const techTerms = query.match(/\b(PostgreSQL|MongoDB|Redis|MySQL|React|Vue|Angular|AWS|GCP|Azure|Docker|Kubernetes|JWT|OAuth|API|REST|GraphQL|TypeScript|JavaScript|Python|Node|Next\.?js)\b/gi);
  if (techTerms) terms.push(...techTerms);
  
  return [...new Set(terms)];
}

/**
 * Merge results from multiple query variants using score boosting.
 * Items that appear in multiple result sets get boosted.
 */
export function mergeExpandedResults<T extends { id: string; score: number }>(
  resultSets: T[][],
): T[] {
  const scoreMap = new Map<string, { item: T; totalScore: number; count: number }>();
  
  for (const results of resultSets) {
    for (const item of results) {
      const existing = scoreMap.get(item.id);
      if (existing) {
        existing.totalScore += item.score;
        existing.count += 1;
        // Keep the item with higher score
        if (item.score > existing.item.score) {
          existing.item = item;
        }
      } else {
        scoreMap.set(item.id, { item, totalScore: item.score, count: 1 });
      }
    }
  }
  
  // Sort by: count (more appearances = better) then by total score
  return Array.from(scoreMap.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.totalScore - a.totalScore;
    })
    .map(({ item, count }) => ({
      ...item,
      // Boost score for items found by multiple queries
      score: item.score * (1 + (count - 1) * 0.2),
    }));
}
