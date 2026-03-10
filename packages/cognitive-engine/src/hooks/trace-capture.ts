/**
 * Trace Capture Hook
 * 
 * Captures reasoning traces from coding sessions for pattern extraction.
 */

import type {
  CodingTrace,
  TraceType,
  TraceOutcome,
  TraceContext,
  Approach,
  CognitiveEngineConfig,
} from '../types.js';
import { sanitizeTrace, sanitizeString } from '../utils/sanitize.js';

// Message type from OpenClaw/agent
interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | ContentBlock[];
}

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
}

interface CaptureParams {
  sessionId: string;
  messages: AgentMessage[];
  toolsUsed?: string[];
  filesModified?: string[];
  startTime: number;
  endTime: number;
}

/**
 * Keywords that indicate problem types
 */
const PROBLEM_TYPE_KEYWORDS: Record<TraceType, string[]> = {
  debugging: ['bug', 'error', 'fix', 'broken', 'issue', 'crash', 'fail', 'debug', 'not working', 'exception', 'undefined'],
  building: ['build', 'create', 'implement', 'add', 'new feature', 'write', 'develop', 'make'],
  refactoring: ['refactor', 'clean up', 'reorganize', 'restructure', 'improve', 'optimize', 'simplify'],
  reviewing: ['review', 'check', 'look at', 'examine', 'audit', 'analyze'],
  configuring: ['config', 'setup', 'configure', 'install', 'deploy', 'environment'],
};

/**
 * Keywords that indicate success
 */
const SUCCESS_KEYWORDS = [
  'fixed', 'works', 'working', 'done', 'complete', 'success', 'resolved',
  'tests pass', 'passing', 'solved', 'finished', 'implemented', 'deployed',
];

/**
 * Keywords that indicate failure
 */
const FAILURE_KEYWORDS = [
  'still broken', 'not working', 'failed', 'error persists', 'giving up',
  'can\'t fix', 'stuck', 'blocked', 'need help', 'doesn\'t work',
];

export class TraceCapture {
  private config: CognitiveEngineConfig;
  
  constructor(config: CognitiveEngineConfig) {
    this.config = config;
  }
  
  /**
   * Extract reasoning from thinking blocks in messages
   */
  extractReasoning(messages: AgentMessage[]): string {
    const thinkingBlocks: string[] = [];
    
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'thinking' && block.thinking) {
            thinkingBlocks.push(block.thinking);
          }
        }
      }
    }
    
    if (thinkingBlocks.length === 0) {
      // Fallback: extract from assistant responses
      const assistantMessages = messages
        .filter(m => m.role === 'assistant')
        .map(m => this.getMessageText(m))
        .filter(Boolean);
      
      return assistantMessages.join('\n\n---\n\n').slice(0, 5000); // Limit size
    }
    
    return thinkingBlocks.join('\n\n---\n\n').slice(0, 5000);
  }
  
  /**
   * Detect problem type from conversation
   */
  detectProblemType(messages: AgentMessage[]): TraceType {
    const text = messages
      .map(m => this.getMessageText(m))
      .join(' ')
      .toLowerCase();
    
    // Score each type
    const scores: Record<TraceType, number> = {
      debugging: 0,
      building: 0,
      refactoring: 0,
      reviewing: 0,
      configuring: 0,
    };
    
    for (const [type, keywords] of Object.entries(PROBLEM_TYPE_KEYWORDS)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          scores[type as TraceType] += 1;
        }
      }
    }
    
    // Find highest scoring type
    let maxType: TraceType = 'building';
    let maxScore = 0;
    
    for (const [type, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        maxType = type as TraceType;
      }
    }
    
    return maxType;
  }
  
  /**
   * Detect outcome from conversation
   */
  detectOutcome(messages: AgentMessage[]): TraceOutcome {
    // Look at the last few messages
    const recentMessages = messages.slice(-5);
    const text = recentMessages
      .map(m => this.getMessageText(m))
      .join(' ')
      .toLowerCase();
    
    // Check for explicit success indicators
    const successScore = SUCCESS_KEYWORDS.filter(k => text.includes(k)).length;
    const failureScore = FAILURE_KEYWORDS.filter(k => text.includes(k)).length;
    
    if (successScore > failureScore && successScore > 0) {
      return 'success';
    }
    
    if (failureScore > successScore && failureScore > 0) {
      return 'failed';
    }
    
    // Check for partial success
    if (successScore > 0 && failureScore > 0) {
      return 'partial';
    }
    
    // Default to partial if unclear
    return 'partial';
  }
  
  /**
   * Extract problem description from first user message
   */
  extractProblem(messages: AgentMessage[]): string {
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (!firstUserMessage) {
      return 'Unknown problem';
    }
    
    const text = this.getMessageText(firstUserMessage);
    // Take first 500 chars as problem description
    return text.slice(0, 500);
  }
  
  /**
   * Extract solution from last assistant message (if success)
   */
  extractSolution(messages: AgentMessage[], outcome: TraceOutcome): string | undefined {
    if (outcome === 'failed' || outcome === 'abandoned') {
      return undefined;
    }
    
    // Find last assistant message
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    const lastAssistant = assistantMessages[assistantMessages.length - 1];
    
    if (!lastAssistant) {
      return undefined;
    }
    
    const text = this.getMessageText(lastAssistant);
    return text.slice(0, 2000); // Limit size
  }
  
  /**
   * Extract context (technologies, files, errors) from messages
   */
  extractContext(messages: AgentMessage[], filesModified?: string[]): TraceContext {
    const allText = messages.map(m => this.getMessageText(m)).join(' ');
    
    // Detect technologies from text
    const techPatterns: Record<string, RegExp> = {
      typescript: /typescript|\.tsx?|tsc/i,
      javascript: /javascript|\.jsx?|node/i,
      python: /python|\.py|pip/i,
      react: /react|jsx|useState|useEffect/i,
      nextjs: /next\.js|nextjs|next\/|app router/i,
      turso: /turso|libsql/i,
      postgres: /postgres|psql|pg_/i,
      docker: /docker|dockerfile|container/i,
      git: /\bgit\b|commit|branch|merge/i,
    };
    
    const technologies: string[] = [];
    for (const [tech, pattern] of Object.entries(techPatterns)) {
      if (pattern.test(allText)) {
        technologies.push(tech);
      }
    }
    
    // Extract error messages
    const errorMessages: string[] = [];
    const errorPatterns = [
      /Error:?\s+([^\n]+)/gi,
      /TypeError:?\s+([^\n]+)/gi,
      /SyntaxError:?\s+([^\n]+)/gi,
      /ReferenceError:?\s+([^\n]+)/gi,
      /Cannot\s+([^\n]+)/gi,
    ];
    
    for (const pattern of errorPatterns) {
      const matches = allText.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && errorMessages.length < 5) {
          errorMessages.push(match[0].slice(0, 200));
        }
      }
    }
    
    return {
      technologies,
      files: filesModified || [],
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
    };
  }
  
  /**
   * Extract approaches tried from conversation
   */
  extractApproaches(messages: AgentMessage[]): Approach[] {
    const approaches: Approach[] = [];
    
    // Look for tool calls and their results
    let currentApproach: Partial<Approach> | null = null;
    
    for (const message of messages) {
      if (message.role === 'assistant') {
        const text = this.getMessageText(message);
        
        // Check for approach indicators
        if (text.includes('try') || text.includes('let me') || text.includes('I\'ll')) {
          if (currentApproach) {
            approaches.push(currentApproach as Approach);
          }
          currentApproach = {
            description: text.slice(0, 300),
            result: 'partial', // Default, may be updated
          };
        }
      }
      
      // Tool results might indicate success/failure
      if (message.role === 'tool' && currentApproach) {
        const text = this.getMessageText(message);
        if (text.toLowerCase().includes('error') || text.toLowerCase().includes('failed')) {
          currentApproach.result = 'failed';
        } else if (text.toLowerCase().includes('success') || text.toLowerCase().includes('done')) {
          currentApproach.result = 'worked';
        }
      }
    }
    
    if (currentApproach) {
      approaches.push(currentApproach as Approach);
    }
    
    return approaches.slice(0, 10); // Limit to 10 approaches
  }
  
  /**
   * Capture a complete trace from a coding session
   */
  async captureTrace(params: CaptureParams): Promise<CodingTrace> {
    const { sessionId, messages, toolsUsed = [], filesModified = [], startTime, endTime } = params;
    
    // Skip if below minimum duration
    const durationMs = endTime - startTime;
    if (this.config.minTraceDurationMs && durationMs < this.config.minTraceDurationMs) {
      throw new Error(`Trace duration ${durationMs}ms below minimum ${this.config.minTraceDurationMs}ms`);
    }
    
    const outcome = this.detectOutcome(messages);
    
    const trace: CodingTrace = {
      id: crypto.randomUUID(),
      userId: '', // Will be set by API
      sessionId,
      timestamp: new Date().toISOString(),
      
      type: this.detectProblemType(messages),
      problem: this.extractProblem(messages),
      context: this.extractContext(messages, filesModified),
      
      reasoning: this.extractReasoning(messages),
      approaches: this.extractApproaches(messages),
      
      solution: this.extractSolution(messages, outcome),
      outcome,
      
      toolsUsed,
      filesModified,
      durationMs,
      
      sanitized: false,
    };
    
    // CRITICAL: Always sanitize before returning
    if (this.config.sanitizeSecrets !== false) {
      return sanitizeTrace(trace);
    }
    
    return trace;
  }
  
  /**
   * Check if a session should be captured (filtering)
   */
  shouldCapture(messages: AgentMessage[]): boolean {
    if (!this.config.captureEnabled) {
      return false;
    }
    
    // Must have at least a few messages
    if (messages.length < 3) {
      return false;
    }
    
    // Must have user and assistant messages
    const hasUser = messages.some(m => m.role === 'user');
    const hasAssistant = messages.some(m => m.role === 'assistant');
    
    return hasUser && hasAssistant;
  }
  
  // --- Helper methods ---
  
  private getMessageText(message: AgentMessage): string {
    if (typeof message.content === 'string') {
      return message.content;
    }
    
    if (Array.isArray(message.content)) {
      return message.content
        .filter(block => block.type === 'text' && block.text)
        .map(block => block.text!)
        .join('\n');
    }
    
    return '';
  }
}
