# Package Smoke Examples

## `@fathippo/local`

```ts
import { localRetrieve, localStoreResult } from "@fathippo/local";

localStoreResult("user_123", "fix next auth middleware", ["mem_1", "mem_2"]);
const result = await localRetrieve("fix next auth middleware", "user_123");
console.log(result.hit, result.memoryIds);
```

## `@fathippo/hosted`

```ts
import { getRetrievalConfig, initSyncQueue, queueWrite, startSyncWorker } from "@fathippo/hosted";

initSyncQueue(process.env.FATHIPPO_SYNC_KEY ?? "dev-only-key");
queueWrite("user_123", "create", { memoryId: "mem_1" });
startSyncWorker("https://api.fathippo.com", process.env.FATHIPPO_API_KEY ?? "");
console.log(getRetrievalConfig().hostedRerankEnabled);
```

## `@fathippo/cognition`

```ts
import { CognitiveClient, evaluateBenchmarkGate } from "@fathippo/cognition";

const client = new CognitiveClient({
  apiKey: process.env.FATHIPPO_API_KEY ?? "",
  baseUrl: "https://api.fathippo.com",
});

console.log(typeof client.captureTrace);
console.log(evaluateBenchmarkGate({ current: { traceMrr: 1, patternRecallAtK: 1, skillHitRate: 1, weakOutcomeLift: 1, successRate: 1, retryDelta: 0, timeToResolutionDelta: 0, verificationCompletionRate: 1, cases: 1 } }).passed);
```
