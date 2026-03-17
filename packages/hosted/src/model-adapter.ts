/**
 * Model-aware context formatting for FatHippo.
 *
 * Adapts context output format and budget based on which model is consuming it.
 * Claude gets XML, GPT gets markdown, small models get ultra-compressed text.
 */

export type ModelFamily = "claude" | "gpt" | "deepseek" | "gemini" | "small" | "unknown";

export type ContextBudget = {
  max_tokens: number;
  max_memories: number;
  critical_only: boolean;
};

export type TieredMemory = {
  id: string;
  title: string;
  text: string;
  type?: string;
  tier?: string;
};

export type TieredContext = {
  critical?: TieredMemory[];
  working?: TieredMemory[];
  high?: TieredMemory[];
};

// --- Model Family Detection ---

const CLAUDE_PATTERNS = /claude|sonnet|opus|haiku/i;
const GPT_PATTERNS = /gpt|^o[134]-|^o[134]$/i;
const DEEPSEEK_PATTERNS = /deepseek/i;
const GEMINI_PATTERNS = /gemini/i;
const SMALL_MODEL_PATTERNS = /qwen|llama|mistral|phi-|codestral|yi-|internlm|\b[78913]b\b|\b14b\b|\b3[02]b\b/i;

export function detectModelFamily(model?: string | null): ModelFamily {
  if (!model || !model.trim()) return "unknown";

  const m = model.trim();

  // Check small models first (a "qwen-7b" should be "small", not something else)
  if (SMALL_MODEL_PATTERNS.test(m)) return "small";
  if (CLAUDE_PATTERNS.test(m)) return "claude";
  if (GPT_PATTERNS.test(m)) return "gpt";
  if (DEEPSEEK_PATTERNS.test(m)) return "deepseek";
  if (GEMINI_PATTERNS.test(m)) return "gemini";

  return "unknown";
}

// --- Context Budgets ---

const BUDGETS: Record<ModelFamily, ContextBudget> = {
  claude:   { max_tokens: 4000, max_memories: 20, critical_only: false },
  gemini:   { max_tokens: 4000, max_memories: 20, critical_only: false },
  gpt:      { max_tokens: 3000, max_memories: 15, critical_only: false },
  deepseek: { max_tokens: 2500, max_memories: 12, critical_only: false },
  small:    { max_tokens: 1000, max_memories: 6,  critical_only: true },
  unknown:  { max_tokens: 2000, max_memories: 10, critical_only: false },
};

export function getContextBudget(family: ModelFamily): ContextBudget {
  return BUDGETS[family];
}

// --- Token Estimation ---

function estimate_tokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// --- Budget Enforcement ---

function enforce_budget(
  context: TieredContext,
  budget: ContextBudget,
): TieredContext {
  let critical = [...(context.critical ?? [])];
  let working = budget.critical_only ? [] : [...(context.working ?? [])];
  let high = budget.critical_only ? [] : [...(context.high ?? [])];

  // Enforce max_memories: drop from high first, then working, then critical
  let total_count = critical.length + working.length + high.length;
  while (total_count > budget.max_memories && high.length > 0) {
    high.pop();
    total_count--;
  }
  while (total_count > budget.max_memories && working.length > 0) {
    working.pop();
    total_count--;
  }
  while (total_count > budget.max_memories && critical.length > 0) {
    critical.pop();
    total_count--;
  }

  return { critical, working, high };
}

function enforce_token_budget(formatted: string, budget: ContextBudget): string {
  const tokens = estimate_tokens(formatted);
  if (tokens <= budget.max_tokens) return formatted;

  // Truncate to fit budget
  const max_chars = budget.max_tokens * 4;
  return formatted.slice(0, max_chars) + "\n[context truncated]";
}

// --- Formatters ---

function truncate(text: string, max_len: number): string {
  if (text.length <= max_len) return text;
  return text.slice(0, max_len - 1) + "…";
}

// Claude: XML-style structured context
function format_claude(context: TieredContext): string {
  const sections: string[] = [];

  if (context.critical?.length) {
    const items = context.critical.map(
      (m) => `  <memory title="${escape_xml(m.title)}">${escape_xml(m.text)}</memory>`
    );
    sections.push(`<critical>\n${items.join("\n")}\n</critical>`);
  }

  if (context.working?.length) {
    const items = context.working.map(
      (m) => `  <memory title="${escape_xml(m.title)}">${escape_xml(m.text)}</memory>`
    );
    sections.push(`<working>\n${items.join("\n")}\n</working>`);
  }

  if (context.high?.length) {
    const items = context.high.map(
      (m) => `  <memory title="${escape_xml(m.title)}">${escape_xml(m.text)}</memory>`
    );
    sections.push(`<relevant>\n${items.join("\n")}\n</relevant>`);
  }

  if (sections.length === 0) return "";
  return `<fathippo_memory>\n${sections.join("\n")}\n</fathippo_memory>`;
}

function escape_xml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// GPT: Bold markdown
function format_gpt(context: TieredContext): string {
  const sections: string[] = [];

  if (context.critical?.length) {
    const items = context.critical.map((m) => `- **${m.title}**: ${m.text}`);
    sections.push(`## Critical Memory\n${items.join("\n")}`);
  }

  if (context.working?.length) {
    const items = context.working.map((m) => `- **${m.title}**: ${m.text}`);
    sections.push(`## Working Memory\n${items.join("\n")}`);
  }

  if (context.high?.length) {
    const items = context.high.map((m) => `- **${m.title}**: ${m.text}`);
    sections.push(`## Relevant Memory\n${items.join("\n")}`);
  }

  return sections.join("\n\n");
}

// DeepSeek: Technical markdown, no tier headers, concise
function format_deepseek(context: TieredContext): string {
  const all_memories = [
    ...(context.critical ?? []),
    ...(context.working ?? []),
    ...(context.high ?? []),
  ];

  if (all_memories.length === 0) return "";

  const items = all_memories.map((m) => {
    const title = m.title.trim();
    const text = m.text.trim();
    return text ? `- ${title}: ${text}` : `- ${title}`;
  });

  return `## Memory Context\n${items.join("\n")}`;
}

// Small models: Ultra-compressed, critical only
function format_small(context: TieredContext): string {
  const critical = context.critical ?? [];
  if (critical.length === 0) return "";

  const items = critical.map((m) => {
    const title = truncate(m.title.trim(), 30);
    const text = truncate(m.text.trim(), 60);
    return text ? `${title}: ${text}` : title;
  });

  return `CONTEXT: ${items.join(". ")}.`;
}

// Unknown/default: Current plain markdown format (backward compatible)
function format_default(context: TieredContext): string {
  const sections: string[] = [];

  if (context.critical?.length) {
    const items = context.critical.map((m) => {
      const title = m.title.trim() || "Memory";
      const text = m.text.trim();
      return text ? `- ${title}: ${text}` : `- ${title}`;
    });
    sections.push(`## Critical Memory\n${items.join("\n")}`);
  }

  if (context.working?.length) {
    const items = context.working.map((m) => {
      const title = m.title.trim() || "Memory";
      const text = m.text.trim();
      return text ? `- ${title}: ${text}` : `- ${title}`;
    });
    sections.push(`## Working Memory\n${items.join("\n")}`);
  }

  if (context.high?.length) {
    const items = context.high.map((m) => {
      const title = m.title.trim() || "Memory";
      const text = m.text.trim();
      return text ? `- ${title}: ${text}` : `- ${title}`;
    });
    sections.push(`## Relevant Memory\n${items.join("\n")}`);
  }

  return sections.join("\n\n");
}

// --- Public API ---

const FORMATTERS: Record<ModelFamily, (context: TieredContext) => string> = {
  claude: format_claude,
  gpt: format_gpt,
  deepseek: format_deepseek,
  gemini: format_claude, // Gemini handles XML well too
  small: format_small,
  unknown: format_default,
};

/**
 * Format tiered context for a specific model family.
 * Enforces memory count and token budgets, then formats appropriately.
 */
export function formatTieredContextForModel(
  context: TieredContext,
  family: ModelFamily,
): string {
  const budget = getContextBudget(family);
  const pruned = enforce_budget(context, budget);
  const formatter = FORMATTERS[family];
  const formatted = formatter(pruned);
  return enforce_token_budget(formatted, budget);
}

/**
 * Format a memory list for a specific model family.
 * Convenience function for simpler use cases.
 */
export function formatMemoryListForModel(
  memories: TieredMemory[],
  family: ModelFamily,
): string[] {
  if (family === "small") {
    return memories.map((m) => truncate(`${m.title}: ${m.text}`, 60));
  }

  if (family === "claude" || family === "gemini") {
    return memories.map(
      (m) => `<memory title="${escape_xml(m.title)}">${escape_xml(m.text)}</memory>`
    );
  }

  if (family === "gpt") {
    return memories.map((m) => `- **${m.title}**: ${m.text}`);
  }

  // default / deepseek / unknown
  return memories.map((m) => {
    const title = m.title.trim() || "Memory";
    const text = m.text.trim();
    return text ? `- ${title}: ${text}` : `- ${title}`;
  });
}
