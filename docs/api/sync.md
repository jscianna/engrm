# Sync API

The Sync API enables edge clients to queue memory operations locally and sync them to the hosted backend with automatic retry and dead-letter handling.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/sync/batch` | Process batch of sync operations |
| `GET` | `/api/v1/sync/status` | Get queue metrics and worker status |
| `POST` | `/api/v1/sync/status` | Admin actions (retry, purge, force sync) |

## Queue & Retry Policy

The sync system implements:

- **AES-256-GCM encryption** at rest for queued payloads
- **Exponential backoff with jitter** (base: 1s, max: 60s)
- **Max 5 retries** before dead-lettering
- **Batch processing** (default: 10 ops per request)
- **Dead-letter queue** for permanent failures

## Batch Sync

### POST /api/v1/sync/batch

Process a batch of create, update, and delete operations.

```bash
curl -X POST https://fathippo.ai/api/v1/sync/batch \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {
        "id": "sq_123456",
        "userId": "user_abc",
        "operation": "create",
        "payload": {
          "text": "Remember this",
          "memoryType": "episodic"
        },
        "queuedAt": 1699999999000
      }
    ]
  }'
```

**Response:**
```json
{
  "results": [{ "id": "sq_123456", "success": true }],
  "summary": { "total": 1, "success": 1, "failed": 0 }
}
```

## Status & Admin

### GET /api/v1/sync/status

Returns queue metrics, worker status, and dead-letter entries.

```bash
curl -X GET https://fathippo.ai/api/v1/sync/status \
  -H "Authorization: Bearer mem_xxx"
```

### POST /api/v1/sync/status

Admin actions:

```bash
# Retry a dead-lettered entry
curl -X POST https://fathippo.ai/api/v1/sync/status \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{ "action": "retry", "entryId": "sq_123" }'

# Purge a dead-lettered entry permanently
curl -X POST https://fathippo.ai/api/v1/sync/status \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{ "action": "purge", "entryId": "sq_123" }'

# Force immediate sync cycle
curl -X POST https://fathippo.ai/api/v1/sync/status \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{ "action": "force_sync" }'
```

## Client Integration

The `@fathippo/context-engine` package includes the sync queue client:

```typescript
import { initSyncQueue, queueWrite, startSyncWorker } from "@fathippo/context-engine";

// Initialize with encryption key
initSyncQueue("your-32-byte-key");

// Queue operations
queueWrite("user_123", "create", { text: "Remember this" });

// Start background worker
startSyncWorker("https://fathippo.ai", "mem_xxx");
```
