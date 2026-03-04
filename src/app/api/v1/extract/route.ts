/**
 * Memory Extract Endpoint
 * 
 * Analyze a conversation and extract suggested memories.
 * Uses heuristic extraction (no LLM needed for v1).
 */

import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";
import type { MemoryKind, MemoryImportanceTier } from "@/lib/types";

export const runtime = "nodejs";

// Extraction patterns with confidence scores
const EXTRACT_PATTERNS: Array<{
  pattern: RegExp;
  memoryType: MemoryKind;
  tierHint: MemoryImportanceTier;
  confidence: number;
}> = [
  // High confidence patterns
  { 
    pattern: /\b(?:I prefer|I always|I never)\b/i, 
    memoryType: "preference", 
    tierHint: "high",
    confidence: 0.92 
  },
  { 
    pattern: /\b(?:remember that|don't forget|keep in mind|important:)\b/i, 
    memoryType: "fact", 
    tierHint: "high",
    confidence: 0.88 
  },
  { 
    pattern: /\b(?:my name is|I am called|call me|I go by)\b/i, 
    memoryType: "identity", 
    tierHint: "critical",
    confidence: 0.95 
  },
  
  // Medium-high confidence
  { 
    pattern: /\b(?:I like|I love|I enjoy|I'm a fan of)\b/i, 
    memoryType: "preference", 
    tierHint: "normal",
    confidence: 0.75 
  },
  { 
    pattern: /\b(?:I hate|I dislike|I can't stand)\b/i, 
    memoryType: "preference", 
    tierHint: "normal",
    confidence: 0.75 
  },
  { 
    pattern: /\b(?:I decided|we agreed|the decision is|we're going with)\b/i, 
    memoryType: "decision", 
    tierHint: "high",
    confidence: 0.82 
  },
  
  // Factual patterns
  { 
    pattern: /\b(?:I work at|I work for|my job is|I'm employed)\b/i, 
    memoryType: "fact", 
    tierHint: "high",
    confidence: 0.85 
  },
  { 
    pattern: /\b(?:I live in|I'm from|I'm based in|my home is)\b/i, 
    memoryType: "fact", 
    tierHint: "normal",
    confidence: 0.80 
  },
  { 
    pattern: /\b(?:my (?:email|phone|number|address) is)\b/i, 
    memoryType: "fact", 
    tierHint: "high",
    confidence: 0.90 
  },
  
  // Procedural/how-to patterns
  { 
    pattern: /\b(?:the way to|how I|my process for|the steps are)\b/i, 
    memoryType: "how_to", 
    tierHint: "normal",
    confidence: 0.70 
  },
  
  // Constraint patterns
  { 
    pattern: /\b(?:must always|never do|always ensure|required to)\b/i, 
    memoryType: "constraint", 
    tierHint: "critical",
    confidence: 0.85 
  },
  
  // Relationship patterns
  { 
    pattern: /\b(?:my (?:wife|husband|partner|friend|colleague|boss|child|parent))\b/i, 
    memoryType: "relationship", 
    tierHint: "high",
    confidence: 0.80 
  },
  
  // Event patterns
  { 
    pattern: /\b(?:yesterday|last week|on monday|we had a meeting|the event)\b/i, 
    memoryType: "event", 
    tierHint: "normal",
    confidence: 0.60 
  },
  
  // Belief patterns
  { 
    pattern: /\b(?:I believe|I think that|in my opinion|my view is)\b/i, 
    memoryType: "belief", 
    tierHint: "normal",
    confidence: 0.65 
  },
];

// Generate a title from extracted content
function generateTitle(content: string, memoryType: MemoryKind): string {
  const typeLabels: Record<string, string> = {
    preference: "User Preference",
    identity: "User Identity",
    fact: "User Fact",
    decision: "Decision Made",
    how_to: "Process/How-To",
    constraint: "User Constraint",
    relationship: "User Relationship",
    event: "Event Reference",
    belief: "User Belief",
  };
  
  const prefix = typeLabels[memoryType] || "Extracted Memory";
  const snippet = content.slice(0, 40).trim();
  return `${prefix}: ${snippet}${content.length > 40 ? "..." : ""}`;
}

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "extract");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new MemryError("VALIDATION_ERROR", { field: "body", reason: "Invalid request body" });
    }

    // Parse conversation
    const conversation = Array.isArray(body.conversation) ? body.conversation : [];
    if (conversation.length === 0) {
      throw new MemryError("VALIDATION_ERROR", { field: "conversation", reason: "required" });
    }

    const namespace = typeof body.namespace === "string" ? body.namespace.trim() : null;

    // Extract suggestions from user messages
    const suggestions: Array<{
      title: string;
      content: string;
      memoryType: MemoryKind;
      suggestedTier: MemoryImportanceTier;
      confidence: number;
    }> = [];

    let tokensAnalyzed = 0;

    for (const message of conversation) {
      if (!isObject(message) || message.role !== "user" || typeof message.content !== "string") {
        continue;
      }

      const content = message.content;
      tokensAnalyzed += Math.ceil(content.length / 4);

      // Check each pattern
      for (const { pattern, memoryType, tierHint, confidence } of EXTRACT_PATTERNS) {
        if (!pattern.test(content)) {
          continue;
        }

        // Extract sentences containing the pattern
        const sentences = content.split(/[.!?]+/).filter(Boolean);
        for (const sentence of sentences) {
          const trimmed = sentence.trim();
          if (!trimmed || !pattern.test(trimmed)) {
            continue;
          }

          // Avoid duplicates
          const alreadyAdded = suggestions.some(
            (s) => s.content.toLowerCase() === trimmed.toLowerCase()
          );
          if (alreadyAdded) {
            continue;
          }

          suggestions.push({
            title: generateTitle(trimmed, memoryType),
            content: trimmed,
            memoryType,
            suggestedTier: tierHint,
            confidence,
          });
        }
      }
    }

    // Sort by confidence descending, limit to top 10
    const sortedSuggestions = suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);

    return Response.json({
      suggestions: sortedSuggestions,
      tokensAnalyzed,
      ...(namespace ? { namespace } : {}),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
