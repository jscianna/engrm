/**
 * Model Adapters — Context formatter
 *
 * Pure function that formats context sections according to model adapter preferences.
 * Uses chars/4 as a rough token estimate (no external deps).
 */

import type { ContextSection, ModelAdapter } from "./types.js";

/**
 * Estimate token count from a string. Rough: chars / 4.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Sort sections by priority (ascending = higher priority first).
 * Lower number = higher priority.
 */
function sortByPriority(sections: ContextSection[]): ContextSection[] {
  return [...sections].sort((a, b) => a.priority - b.priority);
}

/**
 * Fit sections within a token budget.
 *
 * Strategy:
 * 1. Sort by priority (lower number = higher priority)
 * 2. Greedily add sections that fit within budget (up to maxTokens each)
 * 3. If budget overflows, drop lowest priority sections first (highest number)
 * 4. Truncate remaining sections to minTokens if needed
 */
function fitToBudget(
  sections: ContextSection[],
  budget: number,
): ContextSection[] {
  if (sections.length === 0 || budget <= 0) {
    return [];
  }

  const sorted = sortByPriority(sections);
  const result: Array<{ section: ContextSection; allocatedContent: string }> = [];
  let remaining = budget;

  for (const section of sorted) {
    if (remaining <= 0) break;

    const contentTokens = estimateTokens(section.content);
    const maxAllowed = Math.min(contentTokens, section.maxTokens);

    if (maxAllowed <= remaining) {
      // Full section fits
      result.push({ section, allocatedContent: section.content });
      remaining -= maxAllowed;
    } else if (remaining >= section.minTokens) {
      // Partial fit — truncate content to remaining budget
      const charBudget = remaining * 4;
      const truncated = section.content.slice(0, charBudget).trimEnd();
      result.push({ section, allocatedContent: truncated });
      remaining = 0;
    }
    // else: skip this section entirely (can't even fit minTokens)
  }

  // Rebuild sections with allocated content
  return result.map(({ section, allocatedContent }) => ({
    ...section,
    content: allocatedContent,
  }));
}

/**
 * Format a single section in XML style (Claude preference).
 */
function formatSectionXml(section: ContextSection): string {
  return `<section id="${section.id}">\n${section.content}\n</section>`;
}

/**
 * Format a single section in markdown style (GPT and most others).
 */
function formatSectionMarkdown(section: ContextSection): string {
  // Use the id as a readable heading
  const heading = section.id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return `## ${heading}\n\n${section.content}`;
}

/**
 * Format a single section in terse style (small models with tight budgets).
 * Strips headers/metadata, uses bullet points, compresses aggressively.
 */
function formatSectionTerse(section: ContextSection): string {
  // Split content into lines, strip empty lines and headers, convert to bullets
  const lines = section.content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("#") && !line.startsWith("---"))
    .map((line) => {
      // If already a bullet, keep it; otherwise make it one
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return line;
      }
      return `- ${line}`;
    });

  return lines.join("\n");
}

/**
 * Format context sections for a specific model adapter.
 *
 * @param sections - Context sections to format
 * @param adapter - Model adapter with formatting preferences
 * @param totalBudget - Optional total token budget override (defaults to adapter.optimalContextBudget)
 * @returns Formatted context string
 */
export function formatContextForModel(
  sections: ContextSection[],
  adapter: ModelAdapter,
  totalBudget?: number,
): string {
  if (!sections || sections.length === 0) {
    return "";
  }

  const budget = totalBudget ?? adapter.optimalContextBudget;
  const fitted = fitToBudget(sections, budget);

  if (fitted.length === 0) {
    return "";
  }

  // Determine formatting style
  const isTerse = budget < 2000;

  if (isTerse) {
    return fitted.map(formatSectionTerse).join("\n");
  }

  if (adapter.prefersXml) {
    return fitted.map(formatSectionXml).join("\n\n");
  }

  // Markdown (default for GPT and others)
  return fitted.map(formatSectionMarkdown).join("\n\n---\n\n");
}
