/**
 * FatHippo Context Engine for OpenClaw
 *
 * Encrypted agent memory with semantic search, Dream Cycle synthesis,
 * and tiered intelligence.
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
import { FatHippoContextEngine } from "./engine.js";
/**
 * Plugin entry point
 */
export default function register(api) {
    api.registerContextEngine("fathippo-context-engine", () => {
        const config = api.pluginConfig;
        if (!config?.apiKey) {
            throw new Error("FatHippo Context Engine requires an API key. " +
                "Set plugins.entries.fathippo-context-engine.config.apiKey in your config.");
        }
        api.logger?.info("[FatHippo] Initializing context engine");
        return new FatHippoContextEngine(config);
    });
}
// Re-export types for consumers
export { FatHippoContextEngine } from "./engine.js";
//# sourceMappingURL=index.js.map