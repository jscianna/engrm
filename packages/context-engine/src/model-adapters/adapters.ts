/**
 * Model Adapters — Per-family adapter configurations
 *
 * Returns a ModelAdapter with sensible defaults for each known model family.
 */

import type { ModelAdapter } from "./types.js";

const ADAPTER_MAP: Record<string, ModelAdapter> = {
  claude: {
    modelFamily: "claude",
    contextWindowSize: 200_000,
    prefersXml: true,
    prefersMarkdown: false,
    supportsSystemPrompt: true,
    optimalContextBudget: 4000,
    toolCallFormat: "anthropic",
  },
  gpt: {
    modelFamily: "gpt",
    contextWindowSize: 128_000,
    prefersXml: false,
    prefersMarkdown: true,
    supportsSystemPrompt: true,
    optimalContextBudget: 3000,
    toolCallFormat: "openai",
  },
  deepseek: {
    modelFamily: "deepseek",
    contextWindowSize: 128_000,
    prefersXml: false,
    prefersMarkdown: true,
    supportsSystemPrompt: true,
    optimalContextBudget: 2000,
    toolCallFormat: "openai",
  },
  qwen: {
    modelFamily: "qwen",
    contextWindowSize: 32_000,
    prefersXml: false,
    prefersMarkdown: true,
    supportsSystemPrompt: true,
    optimalContextBudget: 1500,
    toolCallFormat: "hermes",
  },
  llama: {
    modelFamily: "llama",
    contextWindowSize: 128_000,
    prefersXml: false,
    prefersMarkdown: true,
    supportsSystemPrompt: true,
    optimalContextBudget: 1500,
    toolCallFormat: "hermes",
  },
  mistral: {
    modelFamily: "mistral",
    contextWindowSize: 32_000,
    prefersXml: false,
    prefersMarkdown: true,
    supportsSystemPrompt: true,
    optimalContextBudget: 2000,
    toolCallFormat: "native",
  },
  gemini: {
    modelFamily: "gemini",
    contextWindowSize: 1_000_000,
    prefersXml: false,
    prefersMarkdown: true,
    supportsSystemPrompt: true,
    optimalContextBudget: 4000,
    toolCallFormat: "openai",
  },
  kimi: {
    modelFamily: "kimi",
    contextWindowSize: 128_000,
    prefersXml: false,
    prefersMarkdown: true,
    supportsSystemPrompt: true,
    optimalContextBudget: 3000,
    toolCallFormat: "openai",
  },
  glm: {
    modelFamily: "glm",
    contextWindowSize: 128_000,
    prefersXml: false,
    prefersMarkdown: true,
    supportsSystemPrompt: true,
    optimalContextBudget: 2000,
    toolCallFormat: "openai",
  },
  unknown: {
    modelFamily: "unknown",
    contextWindowSize: 8_000,
    prefersXml: false,
    prefersMarkdown: true,
    supportsSystemPrompt: true,
    optimalContextBudget: 1500,
    toolCallFormat: "unknown",
  },
};

/**
 * Get the adapter configuration for a model family.
 * Falls back to 'unknown' for unrecognized families.
 */
export function getAdapter(family: string): ModelAdapter {
  return ADAPTER_MAP[family] ?? ADAPTER_MAP["unknown"];
}
