# Edge-First Dashboard Queries

Quick reference for inspecting edge-first metrics via curl and jq.

## Prerequisites

```bash
# Set these environment variables
export BASE_URL="https://fathippo.ai"
export API_KEY="mem_xxx"
```

## API Endpoint

```bash
GET /api/v1/edge/metrics
```

**Example response:**
```json
{
  "ok": true,
  "localRetrieval": {
    "lookups": 1234,
    "hits": 987,
    "misses": 247,
    "directHits": 654,
    "fuzzyHits": 333,
    "stores": 456,
    "evictions": 12,
    "hitRate": 0.7998,
    "users": 89,
    "entries": 2345,
    "shadowSamples": 567,
    "shadowOverlapSum": 345.67,
    "shadowAvgOverlap": 0.6098
  },
  "note": "Process-local metrics (resets on restart)"
}
```

## Key Metrics Queries

### Hit Rate

Cache hit ratio (hits / lookups):

```bash
curl -s -H "Authorization: Bearer ${API_KEY}" \
  "${BASE_URL}/api/v1/edge/metrics" | \
  jq '.localRetrieval.hitRate'
```

**Output:** `0.7998`

### Shadow Average Overlap

Average Jaccard overlap between edge and hybrid results in shadow mode:

```bash
curl -s -H "Authorization: Bearer ${API_KEY}" \
  "${BASE_URL}/api/v1/edge/metrics" | \
  jq '.localRetrieval.shadowAvgOverlap'
```

**Output:** `0.6098`

### Combined Summary

Get both key metrics in one query:

```bash
curl -s -H "Authorization: Bearer ${API_KEY}" \
  "${BASE_URL}/api/v1/edge/metrics" | \
  jq '{hitRate: .localRetrieval.hitRate, shadowAvgOverlap: .localRetrieval.shadowAvgOverlap}'
```

**Output:**
```json
{
  "hitRate": 0.7998,
  "shadowAvgOverlap": 0.6098
}
```

## Full Metrics Overview

Print a formatted table of all metrics:

```bash
curl -s -H "Authorization: Bearer ${API_KEY}" \
  "${BASE_URL}/api/v1/edge/metrics" | \
  jq '.localRetrieval | to_entries[] | "\(.key): \(.value)"'
```

**Output:**
```
"lookups: 1234"
"hits: 987"
"misses: 247"
"directHits: 654"
"fuzzyHits: 333"
"stores: 456"
"evictions: 12"
"hitRate: 0.7998"
"users: 89"
"entries: 2345"
"shadowSamples: 567"
"shadowOverlapSum: 345.67"
"shadowAvgOverlap: 0.6098"
```

## Edge Confidence Distribution (Sample Approach)

To analyze edge confidence distribution, sample response headers from actual requests:

```bash
# Make 10 requests and extract confidence values
for i in {1..10}; do
  curl -s -o /dev/null -D - \
    -X POST "${BASE_URL}/api/v1/simple/context" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"message":"What are my preferences?","edgeFirst":true}' 2>/dev/null | \
    grep -i "X-FatHippo-Edge-Confidence:" | \
    sed 's/.*: //' | tr -d '\r'
done
```

**Output (example):**
```
0.920
0.850
0.000
0.910
0.000
0.880
0.000
0.930
0.870
0.000
```

### Confidence Distribution Analysis

Extract confidence values and bucket them:

```bash
# Sample 20 requests and categorize confidence
declare -A buckets
buckets=([high]=0 [med]=0 [low]=0 [miss]=0)

for i in {1..20}; do
  conf=$(curl -s -o /dev/null -D - \
    -X POST "${BASE_URL}/api/v1/simple/context" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"message":"Test query","edgeFirst":true}' 2>/dev/null | \
    grep -i "X-FatHippo-Edge-Confidence:" | \
    sed 's/.*: //' | tr -d '\r')
  
  if [ -z "$conf" ] || [ "$conf" = "0.000" ]; then
    buckets[miss]=$((buckets[miss] + 1))
  elif (( $(echo "$conf >= 0.9" | bc -l) )); then
    buckets[high]=$((buckets[high] + 1))
  elif (( $(echo "$conf >= 0.75" | bc -l) )); then
    buckets[med]=$((buckets[med] + 1))
  else
    buckets[low]=$((buckets[low] + 1))
  fi
done

echo "Confidence Distribution (n=20):"
echo "  High (≥0.9): ${buckets[high]}"
echo "  Med (0.75-0.9): ${buckets[med]}"
echo "  Low (<0.75): ${buckets[low]}"
echo "  Miss/No header: ${buckets[miss]}"
```

## Response Headers Reference

When `edgeFirst: true`, inspect these headers:

```bash
curl -s -o /dev/null -D - \
  -X POST "${BASE_URL}/api/v1/simple/context" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"message":"Test","edgeFirst":true}' | \
  grep -i "X-FatHippo-Edge-"
```

**Headers returned:**

| Header | Description | Example |
|--------|-------------|---------|
| `X-FatHippo-Edge-First` | Edge-first enabled | `on` |
| `X-FatHippo-Edge-Rollout` | Rollout status | `active` or `skipped` |
| `X-FatHippo-Edge-Hit` | Cache hit status | `true` or `false` |
| `X-FatHippo-Edge-Confidence` | Match confidence | `0.920` |
| `X-FatHippo-Edge-CB` | Circuit breaker state | `off` or `on` |
| `X-FatHippo-Edge-Min-Confidence` | Configured threshold | `0.80` |

### Extract Specific Header Values

```bash
# Get confidence value only
curl -s -o /dev/null -D - \
  -X POST "${BASE_URL}/api/v1/simple/context" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"message":"Test","edgeFirst":true}' | \
  grep -i "X-FatHippo-Edge-Confidence:" | \
  sed 's/.*: //' | tr -d '\r'
```

```bash
# Get hit status
curl -s -o /dev/null -D - \
  -X POST "${BASE_URL}/api/v1/simple/context" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"message":"Test","edgeFirst":true}' | \
  grep -i "X-FatHippo-Edge-Hit:" | \
  sed 's/.*: //' | tr -d '\r'
```

## Rollout Monitoring

### Check Current Rollout Status

```bash
# Single request - check if user is in rollout
curl -s -o /dev/null -D - \
  -X POST "${BASE_URL}/api/v1/simple/context" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"message":"Test","edgeFirst":true}' | \
  grep -i "X-FatHippo-Edge-Rollout:" | \
  sed 's/.*: //' | tr -d '\r'
```

### Circuit Breaker Status

```bash
curl -s -o /dev/null -D - \
  -X POST "${BASE_URL}/api/v1/simple/context" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"message":"Test","edgeFirst":true}' | \
  grep -i "X-FatHippo-Edge-CB:" | \
  sed 's/.*: //' | tr -d '\r'
```

## Automated Monitoring Script

For continuous monitoring, use the snapshot script:

```bash
./scripts/edge-first-snapshot.sh "${BASE_URL}" "${API_KEY}"
```

This creates timestamped JSON snapshots in `./tmp/` and prints a summary line.

See also: [Edge-First Rollout Playbook](./EDGE_FIRST_ROLLOUT_PLAYBOOK.md) for operational guidance.
