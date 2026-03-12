# FatHippo Quickstarts

These quickstarts match the checked-in examples under [`examples`](/Users/johnscianna/Desktop/FatHippo/examples).

## 1. Local-only in under 10 minutes

1. `npm install`
2. Copy [`examples/env/local-only.env.example`](/Users/johnscianna/Desktop/FatHippo/examples/env/local-only.env.example) into your local env file.
3. Import from `@fathippo/local`.
4. Start with [`examples/local-only.ts`](/Users/johnscianna/Desktop/FatHippo/examples/local-only.ts).

```ts
import { localRetrieve, localStoreResult } from "@fathippo/local";

localStoreResult("demo-user", "fix auth middleware loop", ["mem_1"], 0.92);
const result = await localRetrieve("fix auth middleware loop", "demo-user");
console.log(result.hit, result.memoryIds);
```

## 2. Hosted hybrid in under 10 minutes

1. Copy [`examples/env/hosted-hybrid.env.example`](/Users/johnscianna/Desktop/FatHippo/examples/env/hosted-hybrid.env.example).
2. Initialize the sync queue.
3. Queue writes locally.
4. Start the worker against your hosted API.

```ts
import { initSyncQueue, queueWrite, startSyncWorker } from "@fathippo/hosted";

initSyncQueue(process.env.FATHIPPO_SYNC_ENCRYPTION_KEY ?? "dev-only-sync-key");
queueWrite("demo-user", "update", { memoryId: "mem_1", summary: "Hosted sync payload" });
startSyncWorker(
  process.env.FATHIPPO_API_ENDPOINT ?? "https://api.fathippo.com",
  process.env.FATHIPPO_API_KEY ?? "demo-api-key",
);
```

Reference: [`examples/hosted-hybrid.ts`](/Users/johnscianna/Desktop/FatHippo/examples/hosted-hybrid.ts)

## 3. Cognition enabled in under 10 minutes

1. Copy [`examples/env/cognition-enabled.env.example`](/Users/johnscianna/Desktop/FatHippo/examples/env/cognition-enabled.env.example).
2. Create a `CognitiveEngineConfig`.
3. Instantiate `CognitiveClient` and `CognitiveEngine`.
4. Run a benchmark gate against a tiny fixture set.

```ts
import { CognitiveClient, CognitiveEngine, evaluateBenchmarkGate } from "@fathippo/cognition";
```

Reference: [`examples/cognition-enabled.ts`](/Users/johnscianna/Desktop/FatHippo/examples/cognition-enabled.ts)

## Troubleshooting

### `Cannot find module '@fathippo/local'`

- Run `npm install` from the repo root.
- Make sure the workspace packages were built with `npm run build:packages`.

### Hosted sync queue says it is not initialized

- Call `initSyncQueue()` before `queueWrite()`.
- Use a stable `FATHIPPO_SYNC_ENCRYPTION_KEY` value in development and production.

### Hosted rerank or HyDE never activates

- Check `FATHIPPO_HOSTED_HYDE`, `FATHIPPO_HOSTED_RERANK`, and confidence threshold env vars.
- Confirm the user has the `hosted` entitlement on the server side.

### Cognition requests return entitlement errors

- Confirm the API key/user has the `cognition` entitlement.
- Check whether org sharing/global contribution policy is disabled for that org.

### Quota or rate-limit issues

- Current defaults are `1,000` requests per day and `1,000` memories lifetime per user.
- Feedback and admin/privacy routes also have tighter throttles.

### Benchmark runs are denied

- Set `COGNITIVE_ENABLE_BENCHMARK_RUNS=true`.
- Confirm the API key has the necessary cognitive scopes and entitlement.
