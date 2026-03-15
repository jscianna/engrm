/**
 * FatHippo Context Engine for OpenClaw
 *
 * Persistent agent memory with full hosted features or private local mode.
 *
 * Usage:
 *   openclaw plugins install @fathippo/fathippo-context-engine
 *
 * Config:
 *   plugins:
 *     slots:
 *       contextEngine: "fathippo-context-engine"
 *     entries:
 *       fathippo-context-engine:
 *         enabled: true
 *         config:
 *           mode: "hosted"
 *           apiKey: "${FATHIPPO_API_KEY}"
 *           baseUrl: "https://fathippo.ai/api"
 *           injectCritical: true
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
/**
 * Plugin entry point
 */
export default function register(api: OpenClawPluginApi): void;
export { FatHippoContextEngine } from "./engine.js";
export type { FatHippoConfig, Memory, SearchResult } from "./types.js";
export { CONTEXT_ENGINE_ID, CONTEXT_ENGINE_VERSION } from "./version.js";
export type { UserDNA, SessionAnalysisInput, SessionSignals } from "./user-dna/types.js";
export type { CollectivePattern, SharedSignal } from "./collective/types.js";
//# sourceMappingURL=index.d.ts.map