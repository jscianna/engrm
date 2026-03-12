import {
  appendEdgeSnapshot,
  getEdgeSnapshotAggregate24h,
  getLocalRetrievalMetrics,
  localRetrieve,
  localStoreResult,
} from "@fathippo/local";

export async function localOnlyQuickstart() {
  localStoreResult(
    "demo-user",
    "fix clerk middleware redirect loop",
    ["mem_auth_redirect_loop", "mem_matcher_fix"],
    0.93,
  );

  const retrieval = await localRetrieve("fix clerk middleware redirect loop", "demo-user");

  await appendEdgeSnapshot({
    ts: Date.now(),
    hitRate: retrieval.hit ? 1 : 0,
    shadowAvgOverlap: retrieval.hit ? 1 : 0,
    avgRiskScore: 0.08,
    avgFlushQuality: 0.97,
    missingConstraints: 0,
  });

  return {
    retrieval,
    localMetrics: getLocalRetrievalMetrics(),
    edgeAggregate24h: await getEdgeSnapshotAggregate24h(),
  };
}
