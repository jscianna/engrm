/**
 * Memory Heuristics Engine
 * 
 * Scores memory importance using deterministic heuristics (no LLM).
 * All processing happens client-side to maintain zero-knowledge.
 */

// =============================================================================
// Types
// =============================================================================

export type MemoryType = 
  | 'constraint' 
  | 'identity' 
  | 'relationship' 
  | 'preference' 
  | 'how_to' 
  | 'fact' 
  | 'event';

export interface ScoringContext {
  messageCount?: number;
  responseLatencyMs?: number;
  wasEdited?: boolean;
  position?: 'opening' | 'middle' | 'closing' | 'after_pause';
  recentMessages?: string[];
  existingEmbeddings?: number[][];
}

export interface ScoringResult {
  score: number;
  type: MemoryType;
  signals: string[];
  entities: string[];
  shouldStore: boolean;
  breakdown: {
    explicit: number;
    entityDensity: number;
    emotional: number;
    decision: number;
    correction: number;
    temporal: number;
    causal: number;
    completion: number;
    context: number;
    typeMultiplier: number;
  };
}

// =============================================================================
// Constants
// =============================================================================

const STORAGE_THRESHOLD = 6.0;

// Type multipliers
const TYPE_MULTIPLIERS: Record<MemoryType, number> = {
  constraint: 1.3,
  identity: 1.2,
  relationship: 1.1,
  preference: 1.0,
  how_to: 1.0,
  fact: 0.9,
  event: 0.8,
};

// Type halflives (days)
export const TYPE_HALFLIVES: Record<MemoryType, number> = {
  constraint: 180,
  how_to: 120,
  identity: 120,
  fact: 90,
  preference: 60,
  relationship: 30,
  event: 14,
};

// =============================================================================
// Pattern Definitions
// =============================================================================

// Explicit memory markers (+3.0)
const EXPLICIT_PATTERNS = [
  /\b(remember|don't forget|note this|important|keep in mind)\b/i,
  /\b(my name is|I work at|I'm a|I have a?|my \w+ is)\b/i,
  /\b(I (?:love|hate|prefer|always|never))\b/i,
  /\b(here's how|the steps are|to fix this|the way to)\b/i,
];

// Decision markers (+2.0)
const DECISION_PATTERNS = [
  { pattern: /\b(decided|chose|committed|going with|booked|ordered|picked)\b/i, weight: 1.0 },
  { pattern: /\b(will|going to|must|need to|have to)\b/i, weight: 0.5 },
  { pattern: /\b(finally|at last|resolved|settled on)\b/i, weight: 0.5 },
];

// Correction markers (+1.5)
const CORRECTION_PATTERNS = [
  /\b(actually|no wait|I meant|correction|sorry,? I meant)\b/i,
  /\b(not .{1,30},? but)\b/i,
];

// Temporal patterns
const TEMPORAL_PATTERNS = {
  absolute: {
    pattern: /\b(\d{4}-\d{2}-\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)\b/i,
    weight: 0.8,
  },
  relative: {
    pattern: /\b(next|last|this)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|week|month|year)\b/i,
    weight: 0.5,
  },
  cyclical: {
    pattern: /\b(every|daily|weekly|monthly|annually|each morning|each day)\b/i,
    weight: 0.7,
  },
};

// Causal markers (+1.0)
const CAUSAL_PATTERNS = [
  /\b(because|therefore|so that|in order to|as a result|this means|which is why)\b/i,
];

// Completion markers (+1.0)
const COMPLETION_PATTERNS = [
  { pattern: /\b(done|finished|completed|shipped|deployed|launched|released)\b/i, weight: 1.0 },
  { pattern: /[✓✅☑️]/u, weight: 1.0 },
  { pattern: /\b(failed|error|didn't work|broken|bug)\b/i, weight: 0.8 },
];

// Emotional intensity words
const HIGH_AROUSAL_WORDS = [
  'amazing', 'incredible', 'awesome', 'fantastic', 'wonderful',
  'terrible', 'horrible', 'awful', 'disaster', 'nightmare',
  'love', 'hate', 'obsessed', 'perfect', 'worst', 'best',
  'crucial', 'critical', 'urgent', 'essential', 'vital',
];

// Safety keywords (always boost constraints)
const SAFETY_KEYWORDS = [
  'allergic', 'allergy', 'emergency', 'diabetic', 'diabetes',
  'medication', 'epipen', 'blood type', 'medical', 'condition',
  'cannot eat', 'deadly', 'fatal', 'life-threatening',
];

// =============================================================================
// Type Detection Patterns
// =============================================================================

const TYPE_PATTERNS: Record<MemoryType, RegExp[]> = {
  constraint: [
    /\b(cannot|can't|must not|mustn't|never|forbidden|prohibited)\b/i,
    /\b(allergic|allergy|intolerant|sensitive to)\b/i,
    /\b(deadline|due by|expires?|must be done by)\b/i,
    /\b(limit|maximum|minimum|no more than|at least)\b/i,
  ],
  identity: [
    /\b(I am|I'm a?|my name is|I work (?:at|for|as))\b/i,
    /\b(my (?:job|role|title|profession) is)\b/i,
    /\b(I (?:was born|grew up|live|am from))\b/i,
    /\b(my background is|I specialize in)\b/i,
  ],
  relationship: [
    /\b(my (?:friend|colleague|partner|wife|husband|boss|mentor|team))\b/i,
    /\b(I (?:work with|report to|manage|know|met))\b/i,
    /\b((?:he|she|they) (?:is|are) my)\b/i,
  ],
  preference: [
    /\b(I (?:prefer|like|love|enjoy|hate|dislike|avoid))\b/i,
    /\b(my (?:favorite|preferred|go-to))\b/i,
    /\b(I (?:always|usually|never|rarely))\b/i,
  ],
  how_to: [
    /\b(how to|here's how|the (?:steps|process|way) (?:is|are|to))\b/i,
    /\b(to (?:fix|solve|do|make|create|build) (?:this|it|a))\b/i,
    /\b((?:first|then|next|finally),? (?:you|we|I))\b/i,
    /\b(step \d|1\.|2\.|3\.)\b/i,
  ],
  fact: [
    /\b(is (?:located|based|found) (?:in|at))\b/i,
    /\b((?:the|a) .{1,20} (?:is|are|has|have|was|were))\b/i,
    /\b(means|refers to|is defined as)\b/i,
  ],
  event: [
    /\b((?:yesterday|today|last week|recently) (?:I|we|they))\b/i,
    /\b((?:happened|occurred|took place))\b/i,
    /\b((?:met|visited|attended|went to|completed|finished))\b/i,
    /\b(on (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))\b/i,
  ],
};

// =============================================================================
// Entity Extraction (Simple NER)
// =============================================================================

const ENTITY_PATTERNS = [
  // Names (capitalized words not at start of sentence)
  /(?<=[.!?]\s+|\n|^)(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
  // Emails
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // URLs
  /https?:\/\/[^\s]+/g,
  // Dates
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b/gi,
  // Times
  /\b\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?\b/g,
  // Money
  /\$[\d,]+(?:\.\d{2})?/g,
  // Phone numbers
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  // Company/product names (Title Case phrases)
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g,
];

function extractEntities(text: string): string[] {
  const entities = new Set<string>();
  
  for (const pattern of ENTITY_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        if (match.length > 2 && match.length < 50) {
          entities.add(match.trim());
        }
      }
    }
  }
  
  return Array.from(entities);
}

// =============================================================================
// Scoring Functions
// =============================================================================

function scoreExplicitMarkers(text: string): number {
  for (const pattern of EXPLICIT_PATTERNS) {
    if (pattern.test(text)) {
      return 3.0;
    }
  }
  return 0;
}

function scoreEntityDensity(text: string, entities: string[]): number {
  const words = text.split(/\s+/).length;
  if (words === 0) return 0;
  
  const density = entities.length / words;
  return Math.min(2.0, density * 4);
}

function scoreEmotionalIntensity(text: string): number {
  let score = 0;
  const lowerText = text.toLowerCase();
  
  // High arousal words
  for (const word of HIGH_AROUSAL_WORDS) {
    if (lowerText.includes(word)) {
      score += 0.5;
    }
  }
  
  // Exclamation points
  const exclamations = (text.match(/!/g) || []).length;
  score += exclamations * 0.2;
  
  // ALL CAPS words (more than 3 chars)
  const capsWords = (text.match(/\b[A-Z]{4,}\b/g) || []).length;
  score += capsWords * 0.3;
  
  return Math.min(1.5, score);
}

function scoreDecisionMarkers(text: string): number {
  let score = 0;
  
  for (const { pattern, weight } of DECISION_PATTERNS) {
    if (pattern.test(text)) {
      score += weight;
    }
  }
  
  return Math.min(2.0, score);
}

function scoreCorrectionMarkers(text: string): number {
  for (const pattern of CORRECTION_PATTERNS) {
    if (pattern.test(text)) {
      return 1.5;
    }
  }
  return 0;
}

function scoreTemporalSpecificity(text: string): number {
  let score = 0;
  
  for (const { pattern, weight } of Object.values(TEMPORAL_PATTERNS)) {
    if (pattern.test(text)) {
      score = Math.max(score, weight);  // Take highest, don't stack
    }
  }
  
  return score;
}

function scoreCausalMarkers(text: string): number {
  for (const pattern of CAUSAL_PATTERNS) {
    if (pattern.test(text)) {
      return 1.0;
    }
  }
  return 0;
}

function scoreCompletionMarkers(text: string): number {
  let score = 0;
  
  for (const { pattern, weight } of COMPLETION_PATTERNS) {
    if (pattern.test(text)) {
      score = Math.max(score, weight);
    }
  }
  
  return score;
}

function scoreContextModifiers(context: ScoringContext): number {
  let score = 0;
  
  // Conversational gravity
  if (context.messageCount && context.messageCount > 20) {
    score += 0.2;
  }
  if (context.responseLatencyMs && context.responseLatencyMs > 30000) {
    score += 0.3;
  }
  if (context.wasEdited) {
    score += 0.2;
  }
  
  // Position bonus
  if (context.position === 'opening' || context.position === 'closing') {
    score += 0.3;
  } else if (context.position === 'after_pause') {
    score += 0.2;
  }
  
  // Emotional state from recent messages
  if (context.recentMessages && context.recentMessages.length > 0) {
    const combined = context.recentMessages.join(' ');
    const capsRatio = (combined.match(/[A-Z]/g) || []).length / combined.length;
    const exclamations = (combined.match(/!/g) || []).length;
    
    if (capsRatio > 0.3) score += 0.2;
    if (exclamations > 3) score += 0.3;
  }
  
  return Math.min(2.0, score);
}

// =============================================================================
// Type Detection
// =============================================================================

function detectMemoryType(text: string): MemoryType {
  const scores: Record<MemoryType, number> = {
    constraint: 0,
    identity: 0,
    relationship: 0,
    preference: 0,
    how_to: 0,
    fact: 0,
    event: 0,
  };
  
  for (const [type, patterns] of Object.entries(TYPE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        scores[type as MemoryType] += 1;
      }
    }
  }
  
  // Find highest scoring type
  let maxType: MemoryType = 'fact';  // default
  let maxScore = 0;
  
  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxType = type as MemoryType;
    }
  }
  
  return maxType;
}

// =============================================================================
// Main Scoring Function
// =============================================================================

export function scoreMemory(text: string, context: ScoringContext = {}): ScoringResult {
  const signals: string[] = [];
  const entities = extractEntities(text);
  
  // Calculate individual scores
  const explicit = scoreExplicitMarkers(text);
  if (explicit > 0) signals.push('explicit_marker');
  
  const entityDensity = scoreEntityDensity(text, entities);
  if (entityDensity > 0.5) signals.push('entity_rich');
  
  const emotional = scoreEmotionalIntensity(text);
  if (emotional > 0.5) signals.push('emotional');
  
  const decision = scoreDecisionMarkers(text);
  if (decision > 0) signals.push('decision');
  
  const correction = scoreCorrectionMarkers(text);
  if (correction > 0) signals.push('correction');
  
  const temporal = scoreTemporalSpecificity(text);
  if (temporal > 0) signals.push('temporal');
  
  const causal = scoreCausalMarkers(text);
  if (causal > 0) signals.push('causal');
  
  const completion = scoreCompletionMarkers(text);
  if (completion > 0) signals.push(completion === 0.8 ? 'failure' : 'completion');
  
  const contextScore = scoreContextModifiers(context);
  if (contextScore > 0.5) signals.push('high_context');
  
  // Detect type
  const type = detectMemoryType(text);
  const typeMultiplier = TYPE_MULTIPLIERS[type];
  
  // Safety boost for constraints
  let safetyBoost = 0;
  if (type === 'constraint') {
    const lowerText = text.toLowerCase();
    for (const keyword of SAFETY_KEYWORDS) {
      if (lowerText.includes(keyword)) {
        safetyBoost = 2.0;
        signals.push('safety_critical');
        break;
      }
    }
  }
  
  // Calculate base score
  const baseScore = explicit + entityDensity + emotional + decision + 
                    correction + temporal + causal + completion + contextScore + safetyBoost;
  
  // Apply type multiplier
  const finalScore = baseScore * typeMultiplier;
  
  return {
    score: Math.round(finalScore * 100) / 100,
    type,
    signals,
    entities,
    shouldStore: finalScore >= STORAGE_THRESHOLD,
    breakdown: {
      explicit,
      entityDensity,
      emotional,
      decision,
      correction,
      temporal,
      causal,
      completion,
      context: contextScore,
      typeMultiplier,
    },
  };
}

// =============================================================================
// Batch Processing
// =============================================================================

export function extractMemoriesFromConversation(
  messages: Array<{ role: string; content: string }>,
  windowSize: number = 10
): Array<{ content: string; result: ScoringResult }> {
  const recent = messages.slice(-windowSize);
  const candidates: Array<{ content: string; result: ScoringResult }> = [];
  
  for (let i = 0; i < recent.length; i++) {
    const msg = recent[i];
    
    // Skip very short messages
    if (msg.content.length < 20) continue;
    
    // Skip assistant messages (usually)
    if (msg.role === 'assistant') continue;
    
    const context: ScoringContext = {
      messageCount: messages.length,
      position: i === 0 ? 'opening' : i === recent.length - 1 ? 'closing' : 'middle',
      recentMessages: recent.slice(Math.max(0, i - 3), i).map(m => m.content),
    };
    
    const result = scoreMemory(msg.content, context);
    
    if (result.shouldStore) {
      candidates.push({ content: msg.content, result });
    }
  }
  
  return candidates;
}

// =============================================================================
// Reinforcement Helpers
// =============================================================================

export function calculateFrequencyBoost(mentionCount: number): number {
  if (mentionCount === 1) return 1.0;
  if (mentionCount === 2) return 1.4;
  if (mentionCount <= 5) return 1.4 + (mentionCount - 2) * 0.2;
  return Math.min(2.5, 1.4 + 0.6 + (mentionCount - 5) * 0.05);
}

export function calculateDecayedStrength(
  baseStrength: number,
  daysSinceAccess: number,
  halflifeDays: number,
  retentionRate: number = 0.9
): number {
  const decay = Math.pow(retentionRate, daysSinceAccess / halflifeDays);
  return baseStrength * decay;
}

export function shouldArchive(currentStrength: number): boolean {
  return currentStrength < 0.3;
}
