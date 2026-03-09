/**
 * Memory Classification & Structuring
 * 
 * The moat: We don't just store memories, we understand them.
 * 
 * On write: Classify → Structure → Dual-embed
 * On read: Match query intent to memory type → Boost relevance
 */

import OpenAI from "openai";

// =============================================================================
// Types
// =============================================================================

export type MemoryType = 
  | 'decision'      // Choices made, rationale, tradeoffs
  | 'fact'          // Objective information, data points
  | 'preference'    // User likes/dislikes, settings
  | 'person'        // Information about people
  | 'project'       // Project details, status, goals
  | 'event'         // Scheduled items, dates, deadlines
  | 'technical'     // Config, settings, technical details
  | 'process'       // How things are done, workflows
  | 'insight'       // Learnings, observations, conclusions
  | 'conversation'  // Discussion summaries, meeting notes
  | 'general';      // Default fallback

export interface ClassificationResult {
  type: MemoryType;
  confidence: number;
  entities: string[];
  structured: StructuredMemory | null;
}

export interface StructuredMemory {
  type: MemoryType;
  canonical: string;        // Optimized for search
  fields: Record<string, string>;
}

// =============================================================================
// Classification Prompt
// =============================================================================

const CLASSIFICATION_PROMPT = `Classify this memory and extract structure.

Memory types:
- decision: Choices made with rationale ("chose X because Y", "decided to", "went with")
- fact: Objective info ("X is Y", "the address is", "founded in")
- preference: Likes/settings ("prefers", "likes", "always uses", "favorite")
- person: About people ("John is", "Sarah works at", "met with")
- project: Project info ("Project X is", "working on", "building")
- event: Dates/schedules ("meeting on", "deadline is", "scheduled for")
- technical: Config/settings ("TTL is", "configured to", "set at", "expires after")
- process: Workflows ("we do X by", "the process is", "workflow for")
- insight: Learnings ("learned that", "realized", "key insight")
- conversation: Discussions ("discussed", "talked about", "meeting notes")
- general: Doesn't fit above

For decisions, extract: choice, rationale, alternatives (if mentioned)
For facts, extract: subject, value, source (if mentioned)
For people, extract: name, role, context
For events, extract: event, date, participants
For technical, extract: setting, value, scope

Respond in JSON:
{
  "type": "decision|fact|preference|person|project|event|technical|process|insight|conversation|general",
  "confidence": 0.0-1.0,
  "entities": ["extracted", "key", "terms"],
  "fields": {
    "field1": "value1",
    "field2": "value2"
  }
}`;

// =============================================================================
// Classifier
// =============================================================================

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

/**
 * Classify a memory and extract structured fields
 */
export async function classifyMemory(text: string): Promise<ClassificationResult> {
  // Fast path: very short memories are usually facts
  if (text.length < 20) {
    return {
      type: 'fact',
      confidence: 0.6,
      entities: extractEntitiesSimple(text),
      structured: null,
    };
  }

  try {
    const client = getOpenAI();
    
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini", // Fast and cheap for classification
      messages: [
        { role: "system", content: CLASSIFICATION_PROMPT },
        { role: "user", content: text },
      ],
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0.1, // Consistent classification
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return fallbackClassification(text);
    }

    const parsed = JSON.parse(content) as {
      type: string;
      confidence: number;
      entities: string[];
      fields: Record<string, string>;
    };

    const memoryType = validateMemoryType(parsed.type);
    const structured = buildStructuredMemory(memoryType, text, parsed.fields);

    return {
      type: memoryType,
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.7)),
      entities: parsed.entities || [],
      structured,
    };
  } catch (error) {
    console.error("Classification failed:", error);
    return fallbackClassification(text);
  }
}

// =============================================================================
// Structured Memory Builder
// =============================================================================

/**
 * Build a canonical structured version optimized for search
 */
function buildStructuredMemory(
  type: MemoryType,
  originalText: string,
  fields: Record<string, string>
): StructuredMemory | null {
  switch (type) {
    case 'decision': {
      const choice = fields.choice || fields.decision || '';
      const rationale = fields.rationale || fields.reason || fields.why || '';
      const alternatives = fields.alternatives || fields.options || '';
      
      if (!choice && !rationale) return null;
      
      const parts = [`DECISION: ${choice || 'unspecified'}`];
      if (rationale) parts.push(`RATIONALE: ${rationale}`);
      if (alternatives) parts.push(`ALTERNATIVES: ${alternatives}`);
      
      return {
        type,
        canonical: parts.join('. '),
        fields: { choice, rationale, alternatives },
      };
    }

    case 'fact': {
      const subject = fields.subject || fields.what || '';
      const value = fields.value || fields.is || '';
      
      if (!subject || !value) return null;
      
      return {
        type,
        canonical: `FACT: ${subject} is ${value}`,
        fields: { subject, value },
      };
    }

    case 'person': {
      const name = fields.name || fields.person || '';
      const role = fields.role || fields.title || '';
      const context = fields.context || fields.info || '';
      
      if (!name) return null;
      
      const parts = [`PERSON: ${name}`];
      if (role) parts.push(`ROLE: ${role}`);
      if (context) parts.push(`CONTEXT: ${context}`);
      
      return {
        type,
        canonical: parts.join('. '),
        fields: { name, role, context },
      };
    }

    case 'event': {
      const event = fields.event || fields.what || '';
      const date = fields.date || fields.when || '';
      
      if (!event) return null;
      
      const parts = [`EVENT: ${event}`];
      if (date) parts.push(`DATE: ${date}`);
      
      return {
        type,
        canonical: parts.join('. '),
        fields: { event, date },
      };
    }

    case 'technical': {
      const setting = fields.setting || fields.config || fields.what || '';
      const value = fields.value || fields.is || '';
      
      if (!setting || !value) return null;
      
      return {
        type,
        canonical: `CONFIG: ${setting} = ${value}`,
        fields: { setting, value },
      };
    }

    case 'preference': {
      const subject = fields.subject || fields.what || '';
      const preference = fields.preference || fields.prefers || '';
      
      if (!preference) return null;
      
      return {
        type,
        canonical: `PREFERENCE: ${subject ? subject + ' - ' : ''}${preference}`,
        fields: { subject, preference },
      };
    }

    case 'process': {
      const process = fields.process || fields.workflow || fields.how || '';
      
      if (!process) return null;
      
      return {
        type,
        canonical: `PROCESS: ${process}`,
        fields: { process },
      };
    }

    default:
      return null;
  }
}

// =============================================================================
// Helpers
// =============================================================================

function validateMemoryType(type: string): MemoryType {
  const validTypes: MemoryType[] = [
    'decision', 'fact', 'preference', 'person', 'project',
    'event', 'technical', 'process', 'insight', 'conversation', 'general'
  ];
  
  return validTypes.includes(type as MemoryType) 
    ? (type as MemoryType) 
    : 'general';
}

function fallbackClassification(text: string): ClassificationResult {
  // Simple heuristic fallback
  const lower = text.toLowerCase();
  
  let type: MemoryType = 'general';
  
  if (/\b(chose|decided|decision|went with|picked|selected)\b/.test(lower)) {
    type = 'decision';
  } else if (/\b(prefers?|likes?|favorite|always uses?)\b/.test(lower)) {
    type = 'preference';
  } else if (/\b(meeting|deadline|scheduled|on \w+ \d+)\b/.test(lower)) {
    type = 'event';
  } else if (/\b(ttl|timeout|config|set to|expires?)\b/.test(lower)) {
    type = 'technical';
  }
  
  return {
    type,
    confidence: 0.5,
    entities: extractEntitiesSimple(text),
    structured: null,
  };
}

function extractEntitiesSimple(text: string): string[] {
  // Extract capitalized words and tech terms
  const capitalizedWords = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  const techTerms = text.match(/\b[A-Z]{2,}[a-z]*\b/g) || []; // PostgreSQL, JWT, etc.
  
  return [...new Set([...capitalizedWords, ...techTerms])].slice(0, 10);
}

// =============================================================================
// Query Intent to Memory Type Mapping
// =============================================================================

/**
 * Map query intent to preferred memory types for boosting
 */
export function getPreferredMemoryTypes(queryIntent: string): MemoryType[] {
  switch (queryIntent) {
    case 'decision':
      return ['decision', 'process', 'insight'];
    case 'technical':
      return ['technical', 'fact', 'process'];
    default:
      return [];
  }
}

/**
 * Calculate boost factor based on query intent and memory type match
 */
export function calculateTypeBoost(
  queryIntent: string,
  memoryType: MemoryType
): number {
  const preferred = getPreferredMemoryTypes(queryIntent);
  
  if (preferred.length === 0) return 1.0;
  
  const index = preferred.indexOf(memoryType);
  if (index === -1) return 1.0;
  
  // Primary match: 1.3x boost, secondary: 1.15x, tertiary: 1.05x
  return [1.3, 1.15, 1.05][index] || 1.0;
}
