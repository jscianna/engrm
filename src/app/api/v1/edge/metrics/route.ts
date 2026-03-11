import { validateApiKeyAnyScope } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { getLocalRetrievalMetrics } from "@/lib/local-retrieval";
import { getCompactionSafetyMetrics } from "@/lib/compaction-safety";
import { appendEdgeSnapshot, getEdgeSnapshotAggregate24h } from "@/lib/edge-metrics-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await validateApiKeyAnyScope(request, ["simple.context", "edge.metrics.read", "analytics.read"]);

    const localRetrieval = getLocalRetrievalMetrics();
    const compactionSafety = getCompactionSafetyMetrics();

    await appendEdgeSnapshot({
      ts: Date.now(),
      hitRate: localRetrieval.hitRate,
      shadowAvgOverlap: localRetrieval.shadowAvgOverlap,
      avgRiskScore: compactionSafety.avgRiskScore,
      avgFlushQuality: compactionSafety.avgFlushQuality,
      missingConstraints: compactionSafety.postCompactionMissingConstraints,
    });

    const aggregate24h = await getEdgeSnapshotAggregate24h();

    return Response.json({
      ok: true,
      localRetrieval,
      compactionSafety,
      aggregate24h,
      note: "Process-local metrics (resets on restart). aggregate24h is persisted when Upstash is configured.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
