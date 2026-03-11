/**
 * Temporal Awareness for Memory Retrieval
 * 
 * Parses time references in queries ('last week', 'yesterday', 'when we discussed X', 'recently')
 * and returns time window filters that can boost memories from relevant time periods.
 */

interface TemporalMemory {
  id: string;
  text: string;
  createdAt: string;
}

export interface TimeWindow {
  /** Start of time window (ISO 8601 string) */
  start: string;
  /** End of time window (ISO 8601 string) */
  end: string;
  /** Human-readable description of the time window */
  description: string;
  /** Confidence score (0-1) that this window is correct */
  confidence: number;
}

export interface TemporalParseResult {
  /** Whether any temporal references were detected */
  hasTemporalReference: boolean;
  /** The detected time window (if any) */
  timeWindow?: TimeWindow;
  /** Original temporal expression found in query */
  matchedExpression?: string;
  /** Type of temporal expression */
  expressionType?: "relative" | "absolute" | "reference" | "recurring";
}

// =============================================================================
// Temporal Pattern Matching
// =============================================================================

interface TemporalPattern {
  /** Regex pattern to match */
  pattern: RegExp;
  /** Type of temporal expression */
  type: "relative" | "absolute" | "reference" | "recurring";
  /**
   * Function to calculate time window from match
   * Returns [startOffsetMs, endOffsetMs] relative to now
   * Positive = future, Negative = past
   */
  getWindow: (match: RegExpMatchArray, now: Date) => [number, number];
  /** Human-readable description template */
  description: string | ((match: RegExpMatchArray) => string);
}

const TEMPORAL_PATTERNS: TemporalPattern[] = [
  // === RELATIVE TIME PATTERNS ===
  
  // "yesterday", "yesterday morning/afternoon/evening"
  {
    pattern: /\byesterday(?:\s+(morning|afternoon|evening|night))?\b/i,
    type: "relative",
    getWindow: (match, now) => {
      const timeOfDay = match[1]?.toLowerCase();
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - 1);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      
      // Adjust for time of day if specified
      if (timeOfDay) {
        switch (timeOfDay) {
          case "morning":
            dayStart.setHours(6, 0, 0, 0);
            dayEnd.setHours(12, 0, 0, 0);
            break;
          case "afternoon":
            dayStart.setHours(12, 0, 0, 0);
            dayEnd.setHours(18, 0, 0, 0);
            break;
          case "evening":
          case "night":
            dayStart.setHours(18, 0, 0, 0);
            dayEnd.setHours(23, 59, 59, 999);
            break;
        }
      }
      
      return [dayStart.getTime() - now.getTime(), dayEnd.getTime() - now.getTime()];
    },
    description: (match) => match[1] ? `yesterday ${match[1]}` : "yesterday",
  },
  
  // "today", "this morning/afternoon/evening"
  {
    pattern: /\b(today|this\s+(morning|afternoon|evening|night))\b/i,
    type: "relative",
    getWindow: (match, now) => {
      const timeOfDay = match[2]?.toLowerCase();
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(now);
      
      if (timeOfDay) {
        switch (timeOfDay) {
          case "morning":
            dayStart.setHours(6, 0, 0, 0);
            dayEnd.setHours(12, 0, 0, 0);
            break;
          case "afternoon":
            dayStart.setHours(12, 0, 0, 0);
            dayEnd.setHours(18, 0, 0, 0);
            break;
          case "evening":
          case "night":
            dayStart.setHours(18, 0, 0, 0);
            dayEnd.setHours(23, 59, 59, 999);
            break;
        }
      } else {
        dayEnd.setHours(23, 59, 59, 999);
      }
      
      return [dayStart.getTime() - now.getTime(), dayEnd.getTime() - now.getTime()];
    },
    description: (match) => match[2] ? `this ${match[2]}` : "today",
  },
  
  // "last week", "past week", "previous week"
  {
    pattern: /\b(last|past|previous)\s+week\b/i,
    type: "relative",
    getWindow: (_, now) => {
      const weekAgo = 7 * 24 * 60 * 60 * 1000;
      return [-weekAgo, 0];
    },
    description: "last week",
  },
  
  // "this week"
  {
    pattern: /\bthis\s+week\b/i,
    type: "relative",
    getWindow: (_, now) => {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
      startOfWeek.setHours(0, 0, 0, 0);
      return [startOfWeek.getTime() - now.getTime(), 0];
    },
    description: "this week",
  },
  
  // "last month", "past month", "previous month"
  {
    pattern: /\b(last|past|previous)\s+month\b/i,
    type: "relative",
    getWindow: (_, now) => {
      const monthAgo = 30 * 24 * 60 * 60 * 1000;
      return [-monthAgo, 0];
    },
    description: "last month",
  },
  
  // "this month"
  {
    pattern: /\bthis\s+month\b/i,
    type: "relative",
    getWindow: (_, now) => {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return [startOfMonth.getTime() - now.getTime(), 0];
    },
    description: "this month",
  },
  
  // "recently", "lately", "of late"
  {
    pattern: /\b(recently|lately|of\s+late)\b/i,
    type: "relative",
    getWindow: (_, now) => {
      const recentWindow = 14 * 24 * 60 * 60 * 1000; // 2 weeks
      return [-recentWindow, 0];
    },
    description: "recently",
  },
  
  // "a few days ago", "couple days ago"
  {
    pattern: /\b(a\s+few|couple(?:\s+of)?)\s+days?\s+ago\b/i,
    type: "relative",
    getWindow: (_, now) => {
      const fewDaysAgo = 3 * 24 * 60 * 60 * 1000;
      return [-fewDaysAgo, 0];
    },
    description: "a few days ago",
  },
  
  // "X days ago" (where X is 1-30)
  {
    pattern: /\b(\d+)\s+days?\s+ago\b/i,
    type: "relative",
    getWindow: (match, now) => {
      const days = parseInt(match[1], 10);
      const msAgo = days * 24 * 60 * 60 * 1000;
      return [-msAgo, 0];
    },
    description: (match) => `${match[1]} days ago`,
  },
  
  // "X weeks ago"
  {
    pattern: /\b(\d+)\s+weeks?\s+ago\b/i,
    type: "relative",
    getWindow: (match, now) => {
      const weeks = parseInt(match[1], 10);
      const msAgo = weeks * 7 * 24 * 60 * 60 * 1000;
      return [-msAgo, 0];
    },
    description: (match) => `${match[1]} weeks ago`,
  },
  
  // "X months ago"
  {
    pattern: /\b(\d+)\s+months?\s+ago\b/i,
    type: "relative",
    getWindow: (match, now) => {
      const months = parseInt(match[1], 10);
      const msAgo = months * 30 * 24 * 60 * 60 * 1000;
      return [-msAgo, 0];
    },
    description: (match) => `${match[1]} months ago`,
  },
  
  // === REFERENCE PATTERNS ===
  
  // "when we discussed X", "when we talked about X"
  {
    pattern: /\bwhen\s+we\s+(?:discussed|talked\s+about|mentioned|went\s+over)\s+(.+?)(?:\?|$|\s+(?:last|on|at|in)\b)/i,
    type: "reference",
    getWindow: (_, now) => {
      // Default to last 30 days for "when we discussed" without explicit time
      const monthAgo = 30 * 24 * 60 * 60 * 1000;
      return [-monthAgo, 0];
    },
    description: (match) => `when we discussed "${match[1]}"`,
  },
  
  // "the other day"
  {
    pattern: /\bthe\s+other\s+day\b/i,
    type: "relative",
    getWindow: (_, now) => {
      const fewDays = 3 * 24 * 60 * 60 * 1000;
      return [-fewDays, 0];
    },
    description: "the other day",
  },
  
  // "earlier", "earlier today/this week"
  {
    pattern: /\bearlier(?:\s+(today|this\s+week|this\s+month))?\b/i,
    type: "relative",
    getWindow: (match, now) => {
      const timeframe = match[1]?.toLowerCase();
      if (timeframe?.includes("today")) {
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        return [startOfDay.getTime() - now.getTime(), 0];
      } else if (timeframe?.includes("week")) {
        const weekAgo = 7 * 24 * 60 * 60 * 1000;
        return [-weekAgo, 0];
      } else if (timeframe?.includes("month")) {
        const monthAgo = 30 * 24 * 60 * 60 * 1000;
        return [-monthAgo, 0];
      }
      // Default: last 24 hours
      const dayAgo = 24 * 60 * 60 * 1000;
      return [-dayAgo, 0];
    },
    description: (match) => match[1] ? `earlier ${match[1]}` : "earlier",
  },
  
  // "last time", "previous time"
  {
    pattern: /\b(last|previous)\s+time\b/i,
    type: "relative",
    getWindow: (_, now) => {
      // Default to last 30 days
      const monthAgo = 30 * 24 * 60 * 60 * 1000;
      return [-monthAgo, 0];
    },
    description: "last time",
  },
  
  // "before", "previously"
  {
    pattern: /\b(before|previously)\b/i,
    type: "relative",
    getWindow: (_, now) => {
      // Look at memories from before now (open-ended past)
      const farPast = 365 * 24 * 60 * 60 * 1000; // 1 year
      return [-farPast, 0];
    },
    description: "before",
  },
];

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Parse a query for temporal references and extract time window.
 * 
 * @param query The user query to parse
 * @returns TemporalParseResult with time window info
 */
export function parseTemporalQuery(query: string): TemporalParseResult {
  const normalized = query.toLowerCase();
  const now = new Date();

  for (const temporalPattern of TEMPORAL_PATTERNS) {
    const match = normalized.match(temporalPattern.pattern);
    if (match) {
      const [startOffset, endOffset] = temporalPattern.getWindow(match, now);
      
      const start = new Date(now.getTime() + startOffset);
      const end = new Date(now.getTime() + endOffset);
      
      const description = typeof temporalPattern.description === "function"
        ? temporalPattern.description(match)
        : temporalPattern.description;

      return {
        hasTemporalReference: true,
        timeWindow: {
          start: start.toISOString(),
          end: end.toISOString(),
          description,
          confidence: 0.85,
        },
        matchedExpression: match[0],
        expressionType: temporalPattern.type,
      };
    }
  }

  return { hasTemporalReference: false };
}

/**
 * Calculate temporal relevance score for a memory.
 * Returns a score between 0 and 1, where 1 = perfectly within time window.
 * 
 * @param memory The memory to score
 * @param timeWindow The target time window
 * @returns Score from 0-1
 */
export function calculateTemporalScore(
  memory: TemporalMemory,
  timeWindow: TimeWindow
): number {
  const memoryDate = new Date(memory.createdAt);
  const start = new Date(timeWindow.start);
  const end = new Date(timeWindow.end);

  // Memory is within the time window
  if (memoryDate >= start && memoryDate <= end) {
    return 1.0;
  }

  // Memory is outside window - calculate distance
  let distanceMs: number;
  if (memoryDate < start) {
    distanceMs = start.getTime() - memoryDate.getTime();
  } else {
    distanceMs = memoryDate.getTime() - end.getTime();
  }

  // Window duration for normalization
  const windowDuration = end.getTime() - start.getTime();
  const normalizedDistance = distanceMs / Math.max(windowDuration, 24 * 60 * 60 * 1000);

  // Score decays exponentially with distance
  return Math.max(0, Math.exp(-normalizedDistance * 2));
}

/**
 * Apply temporal boost to memories based on time window.
 * Returns memories with boosted scores.
 * 
 * @param memories Array of memories with scores
 * @param timeWindow Time window to boost
 * @param boostFactor How much to boost (1.0 = no boost, 1.5 = 50% boost)
 * @returns Memories with boosted scores
 */
export function applyTemporalBoost<T extends { memory: TemporalMemory; score: number }>(
  memories: T[],
  timeWindow: TimeWindow,
  boostFactor: number = 1.3
): T[] {
  return memories.map((item) => {
    const temporalScore = calculateTemporalScore(item.memory, timeWindow);
    const boost = 1 + (temporalScore * (boostFactor - 1));
    
    return {
      ...item,
      score: item.score * boost,
    };
  });
}

/**
 * Filter memories to only those within a time window.
 * Useful when the query explicitly requires recent context.
 * 
 * @param memories Array of memories
 * @param timeWindow Time window to filter by
 * @param strict If true, only return memories in window. If false, just boost.
 * @returns Filtered/boosted memories
 */
export function filterByTemporalWindow<T extends { memory: TemporalMemory; score: number }>(
  memories: T[],
  timeWindow: TimeWindow,
  strict: boolean = false
): T[] {
  if (strict) {
    return memories.filter((item) => {
      const memoryDate = new Date(item.memory.createdAt);
      const start = new Date(timeWindow.start);
      const end = new Date(timeWindow.end);
      return memoryDate >= start && memoryDate <= end;
    });
  }

  return applyTemporalBoost(memories, timeWindow);
}

/**
 * Check if temporal awareness should be enabled for a query.
 * Returns true if the query contains clear temporal references.
 * 
 * @param query The user query
 * @returns boolean
 */
export function shouldUseTemporal(query: string): boolean {
  const result = parseTemporalQuery(query);
  return result.hasTemporalReference && (result.timeWindow?.confidence ?? 0) > 0.7;
}
