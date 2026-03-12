# FatHippo Package Migration Guide

This repo now exposes three installable package entrypoints:

- `@fathippo/local`
- `@fathippo/hosted`
- `@fathippo/cognition`

## Import Mapping

Move package consumers off monolith-style imports like:

```ts
import { localRetrieve } from "@/lib/local-retrieval";
import { getRetrievalConfig } from "@/lib/retrieval-config";
import { CognitiveClient } from "../../packages/cognitive-engine/src/index.js";
```

To package imports:

```ts
import { localRetrieve, localStoreResult } from "@fathippo/local";
import { getRetrievalConfig, initSyncQueue, startSyncWorker } from "@fathippo/hosted";
import { CognitiveClient, CognitiveEngine, evaluateBenchmarkGate } from "@fathippo/cognition";
```

## Migration Steps

1. Install only the SKU you need.
2. Replace direct repo/internal imports with package imports.
3. Copy the matching env template from [`examples/env`](/Users/johnscianna/Desktop/FatHippo/examples/env).
4. Run the matching example from [`examples`](/Users/johnscianna/Desktop/FatHippo/examples).
5. Run `npm run build:packages && npm run check:examples`.

## SKU Boundaries

### Local-only

Use `@fathippo/local` when you only need:

- local retrieval caching
- invalidation hooks
- edge snapshot metrics

### Hosted hybrid

Use `@fathippo/hosted` when you also need:

- sync queue + dead-letter handling
- sync worker
- hosted HyDE/rerank confidence gating

### Cognition enabled

Use `@fathippo/cognition` when you need:

- trace capture
- pattern extraction
- benchmark/eval helpers
- cognitive API client + engine

## Common Refactors

### Retrieval helpers

```ts
// before
import { localRetrieve, localStoreResult } from "@/lib/local-retrieval";

// after
import { localRetrieve, localStoreResult } from "@fathippo/local";
```

### Hosted flags and sync

```ts
// before
import { getRetrievalConfig } from "@/lib/retrieval-config";
import { queueWrite, startSyncWorker } from "@/lib/sync";

// after
import { getRetrievalConfig, queueWrite, startSyncWorker } from "@fathippo/hosted";
```

### Cognitive client and benchmark gates

```ts
// before
import { CognitiveClient, evaluateBenchmarkGate } from "../../packages/cognitive-engine/src/index.js";

// after
import { CognitiveClient, evaluateBenchmarkGate } from "@fathippo/cognition";
```
