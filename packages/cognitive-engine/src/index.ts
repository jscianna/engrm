/**
 * FatHippo Cognitive Engine
 * 
 * OpenClaw extension that turns coding sessions into compounding expertise.
 * 
 * Components:
 * - Trace Capture: Hook into coding sessions, record reasoning
 * - Pattern Extraction: Cluster traces, identify what works
 * - Skill Synthesis: Auto-generate SKILL.md from patterns (Phase 2)
 * - Context Injection: Inject relevant traces/patterns into sessions
 */

// Types
export * from './types.js';

// Main engine
export { CognitiveEngine } from './engine.js';

// Hooks
export { TraceCapture } from './hooks/trace-capture.js';

// Extraction
export { PatternExtractor } from './extraction/pattern-extractor.js';

// API Client
export { CognitiveClient } from './api/client.js';

// Utilities
export {
  sanitizeTrace,
  sanitizeString,
  sanitizeStringArray,
  containsSecrets,
  detectSecretTypes,
} from './utils/sanitize.js';
