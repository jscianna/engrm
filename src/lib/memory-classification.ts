/**
 * Memory Type Classification
 * 
 * Classifies memories into types based on title patterns and content heuristics.
 * Types:
 * - identity: who the user is (name, role, background)
 * - preference: how they like things (communication style, UI preferences)
 * - belief: what they think (investment thesis, philosophy)
 * - decision: choices made (architecture decisions, product decisions)
 * - fact: external events (company raised $X, person joined Y)
 */

import type { MemoryKind } from "@/lib/types";

// =============================================================================
// Title Pattern Matching (Priority 1)
// =============================================================================

const TITLE_PATTERNS: Array<{ pattern: RegExp; type: MemoryKind }> = [
  // Decision patterns
  { pattern: /\bdecision\b/i, type: "decision" },
  { pattern: /\bdecided\b/i, type: "decision" },
  { pattern: /\bchose\b/i, type: "decision" },
  { pattern: /\bselected\b/i, type: "decision" },
  { pattern: /\bgoing with\b/i, type: "decision" },
  { pattern: /\bwill use\b/i, type: "decision" },
  { pattern: /\barchitecture\b/i, type: "decision" },
  { pattern: /\btech stack\b/i, type: "decision" },
  
  // Identity patterns
  { pattern: /\bmy name\b/i, type: "identity" },
  { pattern: /\bI am\b/i, type: "identity" },
  { pattern: /\bmy role\b/i, type: "identity" },
  { pattern: /\bmy background\b/i, type: "identity" },
  { pattern: /\bwho I am\b/i, type: "identity" },
  { pattern: /\bmy job\b/i, type: "identity" },
  { pattern: /\bI work at\b/i, type: "identity" },
  { pattern: /\bI'm a\b/i, type: "identity" },
  
  // Preference patterns
  { pattern: /\bprefers?\b/i, type: "preference" },
  { pattern: /\bpreference\b/i, type: "preference" },
  { pattern: /\bI like\b/i, type: "preference" },
  { pattern: /\bI hate\b/i, type: "preference" },
  { pattern: /\bI always\b/i, type: "preference" },
  { pattern: /\bI never\b/i, type: "preference" },
  { pattern: /\bfavorite\b/i, type: "preference" },
  { pattern: /\bstyle\b/i, type: "preference" },
  
  // Belief patterns
  { pattern: /\bbelief\b/i, type: "belief" },
  { pattern: /\bbelieve\b/i, type: "belief" },
  { pattern: /\bthesis\b/i, type: "belief" },
  { pattern: /\bphilosophy\b/i, type: "belief" },
  { pattern: /\bprinciple\b/i, type: "belief" },
  { pattern: /\bopinion\b/i, type: "belief" },
  { pattern: /\bthink that\b/i, type: "belief" },
  { pattern: /\bconviction\b/i, type: "belief" },
  { pattern: /\bvalue\b/i, type: "belief" },
  
  // Fact patterns
  { pattern: /\braised\b/i, type: "fact" },
  { pattern: /\bfunding\b/i, type: "fact" },
  { pattern: /\bjoined\b/i, type: "fact" },
  { pattern: /\bannounced\b/i, type: "fact" },
  { pattern: /\blaunched\b/i, type: "fact" },
  { pattern: /\bacquired\b/i, type: "fact" },
  { pattern: /\bIPO\b/i, type: "fact" },
  { pattern: /\bnews\b/i, type: "fact" },
];

// =============================================================================
// Content Keyword Heuristics (Priority 2)
// =============================================================================

interface ContentPattern {
  patterns: RegExp[];
  keywords: string[];
  type: MemoryKind;
}

const CONTENT_HEURISTICS: ContentPattern[] = [
  // Decision indicators
  {
    type: "decision",
    patterns: [
      /\b(we|I) (decided|chose|picked|selected|went with|committed to)\b/i,
      /\b(architecture|tech stack|framework|database|stack) (decision|choice)\b/i,
      /\b(final|ultimate) (choice|decision)\b/i,
      /\bafter (consideration|deliberation|discussion)\b/i,
      /\b(decision|choice) (was|is) to\b/i,
      /\bgoing (forward|ahead) with\b/i,
    ],
    keywords: [
      "decided", "decision", "chose", "choice", "selected", "picking",
      "committed", "settled", "resolved", "finalized", "architecture",
      "tech stack", "trade-off", "tradeoff"
    ],
  },
  
  // Identity indicators
  {
    type: "identity",
    patterns: [
      /\b(my|I'm a|I am a?|I work as)\s+(name|role|job|title|profession|background)\b/i,
      /\bI (work|am employed) (at|for|with)\b/i,
      /\b(founder|CEO|CTO|engineer|developer|designer|manager) (of|at)\b/i,
      /\bmy (expertise|specialty|specialization) is\b/i,
      /\bI (specialize|focus) (in|on)\b/i,
    ],
    keywords: [
      "name is", "my name", "I am", "I'm a", "my role", "my job",
      "my background", "I work at", "I work for", "founder of",
      "my expertise", "my specialty"
    ],
  },
  
  // Preference indicators
  {
    type: "preference",
    patterns: [
      /\bI (prefer|like|love|enjoy|hate|dislike|avoid)\b/i,
      /\bmy (favorite|preferred|go-to)\b/i,
      /\b(always|usually|typically|normally) (use|prefer|choose)\b/i,
      /\b(don't|never) (like|use|want)\b/i,
      /\b(communication|coding|working) style\b/i,
    ],
    keywords: [
      "prefer", "preference", "favorite", "always use", "never use",
      "like to", "hate to", "my style", "I enjoy", "I avoid",
      "my way", "how I like"
    ],
  },
  
  // Belief indicators
  {
    type: "belief",
    patterns: [
      /\bI (believe|think|feel) that\b/i,
      /\b(my|our) (thesis|philosophy|conviction|principle)\b/i,
      /\bin my (view|opinion|experience)\b/i,
      /\b(strongly|firmly) (believe|think|feel)\b/i,
      /\b(investment|product|engineering) (thesis|philosophy)\b/i,
      /\bfundamentally\b/i,
    ],
    keywords: [
      "believe", "belief", "thesis", "philosophy", "principle",
      "conviction", "opinion", "my view", "I think that",
      "fundamentally", "core value"
    ],
  },
  
  // Fact indicators (external events)
  {
    type: "fact",
    patterns: [
      /\b(raised|secured|closed)\s+\$[\d.]+[MBK]?\b/i,
      /\b(series [A-Z]|seed|pre-seed) (round|funding)\b/i,
      /\b(joined|left|hired|fired)\s+(as|at)\b/i,
      /\b(company|startup|team) (announced|launched|released)\b/i,
      /\b(acquired|merged|IPO|went public)\b/i,
      /\b(revenue|ARR|MRR|valuation) (of|at|reached)\b/i,
    ],
    keywords: [
      "raised", "funding", "series", "joined", "announced",
      "launched", "released", "acquired", "IPO", "valuation",
      "revenue", "ARR", "MRR", "partnership", "collaboration"
    ],
  },
];

// =============================================================================
// Classification Functions
// =============================================================================

/**
 * Classify a memory based on title pattern matching.
 * Returns null if no match found.
 */
function classifyByTitle(title: string): MemoryKind | null {
  const normalizedTitle = title.toLowerCase().trim();
  
  for (const { pattern, type } of TITLE_PATTERNS) {
    if (pattern.test(normalizedTitle)) {
      return type;
    }
  }
  
  return null;
}

/**
 * Classify a memory based on content keyword heuristics.
 * Returns the type with highest match score, or null if no clear winner.
 */
function classifyByContent(content: string): MemoryKind | null {
  const normalizedContent = content.toLowerCase();
  const scores: Partial<Record<MemoryKind, number>> = {};
  
  for (const { type, patterns, keywords } of CONTENT_HEURISTICS) {
    let score = 0;
    
    // Pattern matches (higher weight)
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        score += 2;
      }
    }
    
    // Keyword matches (lower weight)
    for (const keyword of keywords) {
      if (normalizedContent.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }
    
    if (score > 0) {
      scores[type] = score;
    }
  }
  
  // Find highest scoring type
  let maxType: MemoryKind | null = null;
  let maxScore = 0;
  
  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxType = type as MemoryKind;
    }
  }
  
  // Only return if score is significant (at least 2 matches)
  return maxScore >= 2 ? maxType : null;
}

/**
 * Classify a memory into a type based on title and content.
 * Priority: title patterns > content heuristics > default
 * 
 * @param title - Memory title
 * @param content - Memory content text
 * @param defaultType - Fallback type if no classification matches (default: 'fact')
 */
export function classifyMemoryType(
  title: string,
  content: string,
  defaultType: MemoryKind = "fact"
): MemoryKind {
  // Priority 1: Title pattern matching
  const titleType = classifyByTitle(title);
  if (titleType) {
    return titleType;
  }
  
  // Priority 2: Content keyword heuristics
  const contentType = classifyByContent(content);
  if (contentType) {
    return contentType;
  }
  
  // Fallback to default
  return defaultType;
}

/**
 * Check if a memory type is one of the core classification types.
 */
export function isCoreMemoryType(type: MemoryKind): boolean {
  return ["identity", "preference", "belief", "decision", "fact"].includes(type);
}
