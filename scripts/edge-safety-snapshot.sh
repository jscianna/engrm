#!/usr/bin/env bash
#
# Edge Safety Metrics Snapshot
#
# Captures a timestamped snapshot of edge safety metrics for tracking
# security and risk metrics over time.
#
# Usage: ./edge-safety-snapshot.sh <BASE_URL> <API_KEY> [OUT_DIR]
# Example: ./edge-safety-snapshot.sh https://fathippo.ai mem_xxx ./tmp
#
# Output:
#   - JSON snapshot: <OUT_DIR>/edge-safety-<timestamp>.json
#   - Summary line printed to stdout
#

set -euo pipefail

# Validate arguments
if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <BASE_URL> <API_KEY> [OUT_DIR]"
  echo "Example: $0 https://fathippo.ai mem_xxx ./tmp"
  exit 1
fi

BASE_URL="$1"
API_KEY="$2"
OUT_DIR="${3:-./tmp}"
ENDPOINT="${BASE_URL}/api/v1/edge/metrics"

# Create OUT_DIR if it doesn't exist
mkdir -p "${OUT_DIR}"

# Generate timestamp
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_FILE="${OUT_DIR}/edge-safety-${TIMESTAMP}.json"

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
AVG_RISK_SCORE=$(echo "${RESPONSE}" | jq -r '.localRetrieval.avgRiskScore // "N/A"')
AVG_FLUSH_QUALITY=$(echo "${RESPONSE}" | jq -r '.localRetrieval.avgFlushQuality // "N/A"')
MISSING_CONSTRAINTS=$(echo "${RESPONSE}" | jq -r '.localRetrieval.missingConstraints // "N/A"')

# Print summary
SUMMARY="hitRate=${HIT_RATE} shadowAvgOverlap=${SHADOW_OVERLAP} avgRiskScore=${AVG_RISK_SCORE} avgFlushQuality=${AVG_FLUSH_QUALITY} missingConstraints=${MISSING_CONSTRAINTS}"

echo "${SUMMARY}"
echo "Snapshot saved to: ${OUTPUT_FILE}" >&2

exit 0