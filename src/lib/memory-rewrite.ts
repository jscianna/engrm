export type RewriteSuggestion = {
  candidate_text: string;
  reason: string;
};

const DECISION_PATTERN = /\b(decided|choose|chose|prefer|must|never|always|resolved|fixed)\b/i;
const PREFERENCE_PATTERN = /\b(i like|i prefer|my style|naming convention|timezone|call me)\b/i;
const LESSON_PATTERN = /\b(root cause|lesson|pattern|playbook|rule|best practice)\b/i;

export function buildRewriteSuggestion(raw_text: string): RewriteSuggestion | null {
  const compact = String(raw_text || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (compact.length < 24) {
    return null;
  }

  const lines = compact
    .split(/\n|\.\s+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const candidate =
    lines.find((line) => DECISION_PATTERN.test(line)) ||
    lines.find((line) => PREFERENCE_PATTERN.test(line)) ||
    lines.find((line) => LESSON_PATTERN.test(line));

  if (!candidate) {
    return null;
  }

  const cleaned = candidate.replace(/^[-*]\s*/, "").slice(0, 280).trim();
  if (cleaned.length < 20) {
    return null;
  }

  return {
    candidate_text: cleaned,
    reason: "Extracted likely durable signal from noisy input",
  };
}
