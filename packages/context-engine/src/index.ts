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

import { FatHippoContextEngine } from "./engine.js";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { FatHippoConfig } from "./types.js";
import { CONTEXT_ENGINE_ID, CONTEXT_ENGINE_VERSION } from "./version.js";

/**
 * Plugin entry point
 */
export default function register(api: OpenClawPluginApi): void {
  api.registerContextEngine(CONTEXT_ENGINE_ID, () => {
    const rawConfig = (api.pluginConfig as FatHippoConfig | undefined) ?? {};
    const mode: "hosted" | "local" =
      rawConfig.mode === "hosted"
        ? "hosted"
        : rawConfig.mode === "local"
          ? "local"
          : rawConfig.apiKey
            ? "hosted"
            : "local";

    if (mode === "hosted" && !rawConfig.apiKey) {
      throw new Error(
        "FatHippo hosted mode requires an API key. " +
          "Set plugins.entries.fathippo-context-engine.config.apiKey in your config or switch mode to local."
      );
    }

    const config: FatHippoConfig = {
      ...rawConfig,
      mode,
      pluginId: CONTEXT_ENGINE_ID,
      pluginVersion: CONTEXT_ENGINE_VERSION,
    };

    api.logger?.info(`[FatHippo] Initializing context engine (${mode} mode, v${CONTEXT_ENGINE_VERSION})`);

    return new FatHippoContextEngine(config);
  });
}

// Re-export types for consumers
export { FatHippoContextEngine } from "./engine.js";
export type { FatHippoConfig, Memory, SearchResult } from "./types.js";
export { CONTEXT_ENGINE_ID, CONTEXT_ENGINE_VERSION } from "./version.js";
