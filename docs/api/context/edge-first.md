# Edge-First Context Retrieval

`POST /api/v1/simple/context`

Edge-first retrieval uses local cache to serve frequent queries instantly, bypassing expensive vector/BM25 search for cache hits.

## When to Use

- High-traffic agents with repetitive queries
- Latency-sensitive applications (sub-100ms responses)
- Gradual rollout of new retrieval strategies

## Request Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `message` | string | **required** | The user message to retrieve context for |
| `edgeFirst` | boolean | `false` | Enable edge-first cache lookup |
| `edgeShadowMode` | boolean | `false` | Enable shadow mode (evaluates edge without affecting response) |
| `edgeMinConfidence` | number | `0.8` | Minimum confidence threshold (0.5-0.98) for cache hits |
| `edgeMaxIds` | number | `maxRelevant` | Max memory IDs to prepend from cache (1-20) |
| `edgeRolloutPct` | number | `100` | Percentage of users to include in rollout (0-100) |
| `edgeSeed` | string | `""` | Optional seed for deterministic user bucketing |

### Rollout Parameters

Use `edgeRolloutPct` and `edgeSeed` for gradual, safe rollouts:

```json
{
  "message": "What's my project status?",
  "edgeFirst": true,
  "edgeRolloutPct": 10,
  "edgeSeed": "v1"
}
```

**How it works:**
- Users are deterministically bucketed using `hash(userId + seed) % 100`
- Same user + seed always produces the same bucket
- Changing the seed creates an independent rollout (e.g., `v2` for next iteration)
- `edgeRolloutPct: 100` includes all users (default)
- `edgeRolloutPct: 0` disables edge path for all users

## Shadow Mode

Shadow mode lets you evaluate edge cache performance without affecting production responses. When enabled:

- Edge candidates are computed but **not** used for the response
- Hosted/hybrid selection remains the source of truth
- Comparison metrics are computed and returned in headers
- Samples are recorded for aggregate analysis via `/api/v1/edge/metrics`

### Use Cases

- **Pre-rollout validation**: Compare edge vs hosted results before going live
- **Continuous monitoring**: Track edge quality without user impact
- **A/B analysis**: Measure overlap between edge and hybrid rankings

### Shadow Mode Request

```json
{
  "message": "What's my project status?",
  "edgeFirst": true,
  "edgeShadowMode": true
}
```

### Shadow Mode Response Headers

When `edgeShadowMode: true` (requires `edgeFirst: true`):

| Header | Value | Description |
|--------|-------|-------------|
| `X-FatHippo-Edge-Shadow` | `on` | Shadow mode active |
| `X-FatHippo-Edge-Overlap` | `0.0000` - `1.0000` | Jaccard overlap between edge and hosted top-k |
| `X-FatHippo-Edge-Latency-Ms` | integer | Edge lookup latency in milliseconds |

**Overlap interpretation:**
- `1.0` = Perfect match (edge and hosted return identical top-k)
- `0.5` = Moderate overlap (half of top-k match)
- `0.0` = No overlap (completely different results)

Higher overlap = edge cache is safe to enable for real traffic.

## Response Headers

When `edgeFirst: true`, these headers are returned:

| Header | Value | Description |
|--------|-------|-------------|
| `X-FatHippo-Edge-First` | `on` | Edge-first was enabled |
| `X-FatHippo-Edge-Rollout` | `active` \| `skipped` | Whether user was in rollout |
| `X-FatHippo-Edge-Hit` | `true` \| `false` | Cache hit status |
| `X-FatHippo-Edge-Confidence` | `0.000` - `0.980` | Confidence score of cache match |
| `X-FatHippo-Edge-CB` | `on` \| `off` | Circuit breaker state |
| `X-FatHippo-Edge-Min-Confidence` | `0.50` - `0.98` | Configured threshold |

## Circuit Breaker

The edge cache has built-in circuit breaker protection:

- Triggers after 5 consecutive low-confidence lookups
- Stays open for 30 subsequent lookups
- Prevents cache pollution from unusual query patterns

## Examples

### Basic Edge-First Request

```bash
curl -X POST https://fathippo.ai/api/v1/simple/context \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are my preferences?",
    "edgeFirst": true
  }'
```

### 10% Rollout with Custom Seed

```bash
curl -X POST https://fathippo.ai/api/v1/simple/context \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What's my project status?",
    "edgeFirst": true,
    "edgeRolloutPct": 10,
    "edgeSeed": "experimental-v1"
  }'
```

### Tuned Confidence Threshold

```bash
curl -X POST https://fathippo.ai/api/v1/simple/context \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Remind me about the meeting",
    "edgeFirst": true,
    "edgeMinConfidence": 0.9,
    "edgeMaxIds": 3
  }'
```

### Shadow Mode Request

```bash
curl -X POST https://fathippo.ai/api/v1/simple/context \
  -H "Authorization: Bearer mem_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are my preferences?",
    "edgeFirst": true,
    "edgeShadowMode": true
  }'
```

Shadow mode response includes additional headers:

```http
HTTP/1.1 200 OK
X-FatHippo-Edge-First: on
X-FatHippo-Edge-Shadow: on
X-FatHippo-Edge-Overlap: 0.7500
X-FatHippo-Edge-Latency-Ms: 2
X-FatHippo-Edge-Hit: true
X-FatHippo-Edge-Confidence: 0.920
```

## Response Example

```http
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8
X-FatHippo-Edge-First: on
X-FatHippo-Edge-Rollout: active
X-FatHippo-Edge-Hit: true
X-FatHippo-Edge-Confidence: 0.920
X-FatHippo-Edge-CB: off
X-FatHippo-Edge-Min-Confidence: 0.80

Here's what you know about this user:

## Core Information
- User prefers dark mode for all applications
- User is based in Pacific Time (UTC-8)

## Relevant Context
- Meeting scheduled for tomorrow at 2pm
- Project deadline is end of quarter

Use this context to personalize your responses.
```

## Rollout Strategy

1. **Start small**: `edgeRolloutPct: 5`, monitor headers and latency
2. **Increase gradually**: 5% → 25% → 50% → 100%
3. **Use seeds for iterations**: `v1` → `v2` → `v3` for independent experiments
4. **Monitor metrics**: Watch `X-FatHippo-Edge-Hit` and `X-FatHippo-Edge-Confidence`

### Automated Smoke Testing

Use the provided smoke test script to validate rollout behavior before each stage:

```bash
./scripts/edge-first-smoke.sh https://fathippo.ai mem_xxx
```

This script verifies:
- Baseline requests (edgeFirst=false) don't return edge headers
- 100% rollout always includes the user (active)
- 0% rollout always excludes the user (skipped)

See the full [Edge-First Rollout Playbook](/docs/operations/EDGE_FIRST_ROLLOUT_PLAYBOOK.md) for detailed operational guidance including:
- Recommended rollout sequence (5% → 20% → 50% → 100%)
- Key metrics to monitor
- Rollback criteria and commands

## Default Behavior

When `edgeFirst: false` (default):
- No edge cache lookup
- Standard hybrid search (vector + BM25)
- No edge-related headers returned
- Behavior unchanged from pre-edge versions
