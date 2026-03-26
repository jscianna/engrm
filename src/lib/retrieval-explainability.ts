type MatchReasonInput = {
  vector_score: number;
  entity_bonus: number;
  feedback_bonus: number;
  access_bonus: number;
  freshness_score: number;
};

const FRESHNESS_HALFLIFE_DAYS = 30;

export function calculateFreshnessScore(created_at: string | Date, now_ms: number = Date.now()): number {
  const created_ms = new Date(created_at).getTime();
  if (!Number.isFinite(created_ms) || created_ms <= 0) {
    return 0;
  }

  const age_ms = Math.max(0, now_ms - created_ms);
  const age_days = age_ms / (1000 * 60 * 60 * 24);
  const decay_power = age_days / FRESHNESS_HALFLIFE_DAYS;
  const score = Math.pow(0.5, decay_power);
  return clampToThreeDecimals(score);
}

export function buildProvenanceSnippet(memory_text: string, max_len: number = 140): string {
  const compact_text = String(memory_text ?? "").replace(/\s+/g, " ").trim();
  if (compact_text.length <= max_len) {
    return compact_text;
  }
  return `${compact_text.slice(0, max_len - 1)}…`;
}

export function deriveMatchReason(input: MatchReasonInput): string {
  const weighted_freshness = input.freshness_score * 0.08;

  const components: Array<{ name: string; value: number }> = [
    { name: "semantic", value: input.vector_score },
    { name: "entity", value: input.entity_bonus },
    { name: "feedback", value: input.feedback_bonus },
    { name: "access", value: input.access_bonus },
    { name: "freshness", value: weighted_freshness },
  ];

  const sorted = components
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 2)
    .map((item) => item.name);

  if (sorted.length === 0) {
    return "low_signal";
  }

  return sorted.join("+");
}

function clampToThreeDecimals(value: number): number {
  return Math.round(value * 1000) / 1000;
}
