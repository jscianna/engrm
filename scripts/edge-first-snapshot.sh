#!/usr/bin/env bash
#
# Edge-First Metrics Snapshot
#
# Captures a timestamped snapshot of edge-first metrics for tracking
# rollout progress over time.
#
# Usage: ./edge-first-snapshot.sh <BASE_URL> <API_KEY>
# Example: ./edge-first-snapshot.sh https://fathippo.ai mem_xxx
#
# Output:
#   - JSON snapshot: ./tmp/edge-metrics-<timestamp>.json
#   - Summary line printed to stdout
#

set -euo pipefail

# Validate arguments
if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <BASE_URL> <API_KEY>"
  echo "Example: $0 https://fathippo.ai mem_xxx"
  exit 1
fi

BASE_URL="$1"
API_KEY="$2"
ENDPOINT="${BASE_URL}/api/v1/edge/metrics"

# Create tmp directory if it doesn't exist
mkdir -p ./tmp

# Generate timestamp
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_FILE="./tmp/edge-metrics-${TIMESTAMP}.json"

# Fetch metrics
echo "Fetching edge metrics from ${ENDPOINT}..." >&2

if ! RESPONSE=$(curl -s -f -H "Authorization: Bearer ${API_KEY}" "${ENDPOINT}" 2>&1); then
  echo "Error: Failed to fetch metrics from ${ENDPOINT}" >&2
  echo "Response: ${RESPONSE}" >&2
  exit 1
fi

# Validate JSON
if ! echo "${RESPONSE}" | jq -e . >/dev/null 2>&1; then
  echo "Error: Invalid JSON response" >&2
  echo "Response: ${RESPONSE}" >&2
  exit 1
fi

# Check for API errors
if echo "${RESPONSE}" | jq -e '.error' >/dev/null 2>&1; then
  echo "Error: API returned error" >&2
  echo "${RESPONSE}" | jq . >&2
  exit 1
fi

# Save snapshot
echo "${RESPONSE}" | jq . > "${OUTPUT_FILE}"

# Extract key metrics
HIT_RATE=$(echo "${RESPONSE}" | jq -r '.localRetrieval.hitRate // "N/A"')
SHADOW_OVERLAP=$(echo "${RESPONSE}" | jq -r '.localRetrieval.shadowAvgOverlap // "N/A"')
LOOKUPS=$(echo "${RESPONSE}" | jq -r '.localRetrieval.lookups // "N/A"')
HITS=$(echo "${RESPONSE}" | jq -r '.localRetrieval.hits // "N/A"')
USERS=$(echo "${RESPONSE}" | jq -r '.localRetrieval.users // "N/A"')
ENTRIES=$(echo "${RESPONSE}" | jq -r '.localRetrieval.entries // "N/A"')

# Print summary
SUMMARY="[${TIMESTAMP}] hitRate=${HIT_RATE} shadowAvgOverlap=${SHADOW_OVERLAP} lookups=${LOOKUPS} hits=${HITS} users=${USERS} entries=${ENTRIES}"

echo "${SUMMARY}"
echo "Snapshot saved to: ${OUTPUT_FILE}" >&2

exit 0
