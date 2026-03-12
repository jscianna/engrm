import {
  computeRetrievalConfidence,
  createHostedMetrics,
  getRetrievalConfig,
  initSyncQueue,
  queueWrite,
  startSyncWorker,
  stopSyncWorker,
  type SyncWorkerConfig,
} from "@fathippo/hosted";

const workerOptions: Partial<Omit<SyncWorkerConfig, "apiEndpoint" | "apiKey">> = {
  batchSize: 5,
  syncIntervalMs: 15_000,
  maxRetries: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
};

export function hostedHybridQuickstart() {
  const config = getRetrievalConfig();
  const retrievalConfidence = computeRetrievalConfidence([0.88, 0.79, 0.74], config);
  const metrics = createHostedMetrics();

  initSyncQueue(process.env.FATHIPPO_SYNC_ENCRYPTION_KEY ?? "dev-only-sync-key");
  const queueEntryId = queueWrite("demo-user", "update", {
    memoryId: "mem_auth_redirect_loop",
    summary: "Auth middleware fix synced to hosted service.",
  });

  startSyncWorker(
    process.env.FATHIPPO_API_ENDPOINT ?? "https://api.fathippo.com",
    process.env.FATHIPPO_API_KEY ?? "demo-api-key",
    workerOptions,
  );
  stopSyncWorker();

  metrics.retrievalConfidence = retrievalConfidence;
  metrics.usedHostedRerank = retrievalConfidence < config.confidenceThreshold;

  return {
    queueEntryId,
    retrievalConfidence,
    hostedConfig: config,
    metrics,
  };
}
