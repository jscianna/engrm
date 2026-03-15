/**
 * Model Adapters — Model family detection
 *
 * Detects model family from model ID strings using simple string matching.
 * Case-insensitive, handles provider/ prefixes (e.g. "openai/gpt-4o").
 */

import type { ModelDetectionResult } from "./types.js";
import { getAdapter } from "./adapters.js";

interface DetectionRule {
  family: string;
  confidence: number;
  match: (id: string) => boolean;
}

/**
 * Build a matcher that checks if the normalized ID starts with a prefix.
 */
function startsWith(prefix: string): (id: string) => boolean {
  return (id) => id.startsWith(prefix);
}

/**
 * Build a matcher that checks for a provider/ prefix (case-insensitive on the provider part).
 */
function providerPrefix(provider: string): (id: string) => boolean {
  const lower = provider.toLowerCase() + "/";
  return (id) => id.startsWith(lower);
}

const DETECTION_RULES: DetectionRule[] = [
  // Claude
  { family: "claude", confidence: 0.95, match: startsWith("claude-") },
  { family: "claude", confidence: 0.95, match: providerPrefix("anthropic") },

  // GPT / OpenAI reasoning models
  { family: "gpt", confidence: 0.95, match: startsWith("gpt-") },
  { family: "gpt", confidence: 0.95, match: providerPrefix("openai") },
  { family: "gpt", confidence: 0.90, match: startsWith("o1-") },
  { family: "gpt", confidence: 0.90, match: startsWith("o3-") },
  { family: "gpt", confidence: 0.90, match: startsWith("o4-") },

  // DeepSeek
  { family: "deepseek", confidence: 0.95, match: startsWith("deepseek") },

  // Qwen
  { family: "qwen", confidence: 0.95, match: startsWith("qwen") },
  { family: "qwen", confidence: 0.95, match: providerPrefix("qwen") },

  // Llama
  { family: "llama", confidence: 0.95, match: startsWith("llama") },
  { family: "llama", confidence: 0.95, match: providerPrefix("meta-llama") },

  // Mistral (including codestral, pixtral)
  { family: "mistral", confidence: 0.95, match: startsWith("mistral") },
  { family: "mistral", confidence: 0.95, match: providerPrefix("mistralai") },
  { family: "mistral", confidence: 0.90, match: startsWith("codestral") },
  { family: "mistral", confidence: 0.90, match: startsWith("pixtral") },

  // Gemini
  { family: "gemini", confidence: 0.95, match: startsWith("gemini") },
  { family: "gemini", confidence: 0.95, match: providerPrefix("google") },

  // Kimi / Moonshot
  { family: "kimi", confidence: 0.95, match: startsWith("moonshot") },
  { family: "kimi", confidence: 0.95, match: startsWith("kimi") },

  // GLM / ChatGLM / Zhipu
  { family: "glm", confidence: 0.95, match: startsWith("glm") },
  { family: "glm", confidence: 0.95, match: providerPrefix("thudm") },
  { family: "glm", confidence: 0.95, match: startsWith("chatglm") },
  { family: "glm", confidence: 0.95, match: startsWith("zhipu") },
];

/**
 * Detect model family from a model ID string.
 *
 * Handles:
 * - Provider prefixes: "anthropic/claude-3.5-sonnet" → claude
 * - Direct model IDs: "gpt-4o" → gpt
 * - Edge cases: empty string, null, undefined → unknown
 */
export function detectModelFamily(modelId: string | null | undefined): ModelDetectionResult {
  const safe = (modelId ?? "").trim();

  if (!safe) {
    return {
      modelId: "",
      family: "unknown",
      adapter: getAdapter("unknown"),
      confidence: 0,
    };
  }

  const normalized = safe.toLowerCase();

  for (const rule of DETECTION_RULES) {
    if (rule.match(normalized)) {
      return {
        modelId: safe,
        family: rule.family,
        adapter: getAdapter(rule.family),
        confidence: rule.confidence,
      };
    }
  }

  return {
    modelId: safe,
    family: "unknown",
    adapter: getAdapter("unknown"),
    confidence: 0,
  };
}
