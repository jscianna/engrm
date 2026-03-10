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
export * from './types.js';
export { CognitiveEngine } from './engine.js';
export { TraceCapture } from './hooks/trace-capture.js';
export { PatternExtractor } from './extraction/pattern-extractor.js';
export { CognitiveClient } from './api/client.js';
export { sanitizeTrace, sanitizeString, sanitizeStringArray, containsSecrets, detectSecretTypes, } from './utils/sanitize.js';
//# sourceMappingURL=index.d.ts.map