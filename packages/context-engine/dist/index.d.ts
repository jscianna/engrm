/**
 * FatHippo Context Engine for OpenClaw
 *
 * Persistent agent memory with hosted cognition or private local mode.
 *
 * Usage:
 *   openclaw plugins install @fathippo/context-engine
 *
 * Config:
 *   plugins:
 *     slots:
 *       contextEngine: "fathippo-context-engine"
 *     entries:
 *       fathippo-context-engine:
 *         enabled: true
 *         config:
 *           apiKey: "${FATHIPPO_API_KEY}"
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
/**
 * Plugin entry point
 */
export default function register(api: OpenClawPluginApi): void;
export { FatHippoContextEngine } from "./engine.js";
export type { FatHippoConfig, Memory, SearchResult } from "./types.js";
export { CONTEXT_ENGINE_ID, CONTEXT_ENGINE_VERSION } from "./version.js";
//# sourceMappingURL=index.d.ts.map