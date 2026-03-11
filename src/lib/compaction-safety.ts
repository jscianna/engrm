type FlushMetrics = {
  samples: number;
  flushQualitySum: number;
  riskScoreSum: number;
  postCompactionMissingConstraints: number;
};

const metrics: FlushMetrics = {
  samples: 0,
  flushQualitySum: 0,
  riskScoreSum: 0,
  postCompactionMissingConstraints: 0,
};

export function computeCompactionRiskScore(input: {
  messageLength: number;
  criticalCount: number;
  relevantCount: number;
  edgeEnabled: boolean;
}): number {
  const lengthRisk = Math.min(1, input.messageLength / 1200);
  const memoryPressure = Math.min(1, (input.criticalCount + input.relevantCount) / 16);
  const edgeRelief = input.edgeEnabled ? -0.08 : 0;
  const score = 0.55 * lengthRisk + 0.45 * memoryPressure + edgeRelief;
  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}

export function estimateFlushQuality(input: {
  hasCritical: boolean;
  hasDurableMemories: boolean;
  relevantCount: number;
}): number {
  let score = 0.35;
  if (input.hasCritical) score += 0.3;
  if (input.hasDurableMemories) score += 0.25;
  if (input.relevantCount >= 3) score += 0.1;
  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}

export function countMissingConstraints(before: string[], after: string[]): number {
  if (before.length === 0) return 0;
  const afterSet = new Set(after.map((x) => x.toLowerCase().trim()));
  let missing = 0;
  for (const b of before) {
    if (!afterSet.has(b.toLowerCase().trim())) missing += 1;
  }
  return missing;
}

export function recordCompactionSafetySample(input: {
  riskScore: number;
  flushQuality: number;
  missingConstraints: number;
}): void {
  metrics.samples += 1;
  metrics.riskScoreSum += input.riskScore;
  metrics.flushQualitySum += input.flushQuality;
  metrics.postCompactionMissingConstraints += input.missingConstraints;
}

export function getCompactionSafetyMetrics() {
  return {
    ...metrics,
    avgRiskScore: metrics.samples > 0 ? Number((metrics.riskScoreSum / metrics.samples).toFixed(4)) : 0,
    avgFlushQuality: metrics.samples > 0 ? Number((metrics.flushQualitySum / metrics.samples).toFixed(4)) : 0,
  };
}
