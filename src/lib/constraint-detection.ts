import {
  checkConstraintExists,
  createConstraint,
  type Constraint,
} from "@/lib/constraints-db";
import { CONSTRAINT_PATTERNS, TRIGGER_KEYWORDS } from "@/lib/constraint-patterns";

export type DetectedConstraint = {
  isConstraint: boolean;
  rule?: string;
  triggers?: string[];
  severity?: "critical" | "warning";
  category?: string;
};

export function detectConstraint(message: string): DetectedConstraint {
  for (const { pattern, category, severity } of CONSTRAINT_PATTERNS) {
    pattern.lastIndex = 0;
    if (!pattern.test(message)) {
      continue;
    }

    const sentences = message.split(/[.!?\n]+/).filter((sentence) => sentence.trim());
    pattern.lastIndex = 0;
    const matchingSentence = sentences.find((sentence) => {
      pattern.lastIndex = 0;
      return pattern.test(sentence);
    });

    if (!matchingSentence) {
      continue;
    }

    return {
      isConstraint: true,
      rule: matchingSentence.trim(),
      triggers: extractTriggers(message.toLowerCase()),
      severity,
      category,
    };
  }

  return { isConstraint: false };
}

export function extractTriggers(message: string): string[] {
  const triggers: string[] = [];

  for (const [category, keywords] of Object.entries(TRIGGER_KEYWORDS)) {
    for (const keyword of keywords) {
      if (!message.includes(keyword)) {
        continue;
      }
      triggers.push(keyword);
      if (!triggers.includes(category)) {
        triggers.push(category);
      }
    }
  }

  return [...new Set(triggers)];
}

export async function storeDetectedConstraints(params: {
  userId: string;
  messages: string[];
}): Promise<{
  constraints: Constraint[];
  created: number;
}> {
  const created: Constraint[] = [];
  const seenRules = new Set<string>();

  for (const message of params.messages) {
    const detected = detectConstraint(message);
    if (!detected.isConstraint || !detected.rule || !detected.severity) {
      continue;
    }

    const normalizedRule = detected.rule.toLowerCase();
    if (seenRules.has(normalizedRule)) {
      continue;
    }
    seenRules.add(normalizedRule);

    const exists = await checkConstraintExists(params.userId, detected.rule);
    if (exists) {
      continue;
    }

    const constraint = await createConstraint({
      userId: params.userId,
      rule: detected.rule,
      triggers: detected.triggers ?? [],
      severity: detected.severity,
      source: message.slice(0, 500),
    });
    created.push(constraint);
  }

  return {
    constraints: created,
    created: created.length,
  };
}
