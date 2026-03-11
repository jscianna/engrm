#!/usr/bin/env bash
#
# Edge-First Smoke Test
# 
# Validates edge-first rollout behavior by testing 3 scenarios:
# 1. Baseline (edgeFirst=false) - no edge headers expected
# 2. 100% rollout (edgeFirst=true, edgeRolloutPct=100) - should always be active
# 3. 0% rollout (edgeFirst=true, edgeRolloutPct=0) - should always be skipped
#
# Usage: ./edge-first-smoke.sh <BASE_URL> <API_KEY>
# Example: ./edge-first-smoke.sh https://fathippo.ai mem_xxx

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <BASE_URL> <API_KEY>"
  echo "Example: $0 https://fathippo.ai mem_xxx"
  exit 1
fi

BASE_URL="$1"
API_KEY="$2"
ENDPOINT="${BASE_URL}/api/v1/simple/context"

TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test message
TEST_MESSAGE="What are my project preferences and current status?"

# Function to extract header value from curl response headers
get_header() {
  local headers_file="$1"
  local header_name="$2"
  grep -i "^${header_name}:" "$headers_file" | head -1 | tr -d '\r' | sed 's/^[[:space:]]*//' | cut -d: -f2- | sed 's/^[[:space:]]*//'
}

# Function to print a header row
print_header_row() {
  printf "%-20s %-12s %-12s %-12s %-10s %-10s\n" "Test" "Edge-First" "Edge-Rollout" "Edge-Hit" "Edge-CB" "Confidence"
  printf "%-20s %-12s %-12s %-12s %-10s %-10s\n" "----" "----------" "------------" "--------" "-------" "----------"
}

# Function to run a single test case
run_test() {
  local test_name="$1"
  local payload="$2"
  local expected_rollout="${3:-}"
  
  local headers_file="${TEMP_DIR}/${test_name}.headers"
  local body_file="${TEMP_DIR}/${test_name}.body"
  
  # Make the request
  local http_code
  http_code=$(curl -s -o "$body_file" -D "$headers_file" -w "%{http_code}" \
    -X POST "$ENDPOINT" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>/dev/null || echo "000")
  
  if [ "$http_code" != "200" ]; then
    echo -e "${RED}FAIL${NC}: $test_name - HTTP $http_code"
    return 1
  fi
  
  # Extract headers (case-insensitive)
  local edge_first edge_rollout edge_hit edge_cb edge_confidence
  edge_first=$(get_header "$headers_file" "X-FatHippo-Edge-First")
  edge_rollout=$(get_header "$headers_file" "X-FatHippo-Edge-Rollout")
  edge_hit=$(get_header "$headers_file" "X-FatHippo-Edge-Hit")
  edge_cb=$(get_header "$headers_file" "X-FatHippo-Edge-CB")
  edge_confidence=$(get_header "$headers_file" "X-FatHippo-Edge-Confidence")
  
  # Print results row
  printf "%-20s %-12s %-12s %-12s %-10s %-10s\n" \
    "$test_name" \
    "${edge_first:-"-"}" \
    "${edge_rollout:-"-"}" \
    "${edge_hit:-"-"}" \
    "${edge_cb:-"-"}" \
    "${edge_confidence:-"-"}"
  
  # Validate expected rollout behavior
  if [ -n "$expected_rollout" ]; then
    if [ "$edge_rollout" != "$expected_rollout" ]; then
      echo -e "${RED}  FAIL${NC}: Expected rollout=$expected_rollout, got ${edge_rollout:-"(missing)"}"
      return 1
    else
      echo -e "${GREEN}  PASS${NC}: Rollout behavior correct ($edge_rollout)"
    fi
  fi
  
  return 0
}

echo "================================"
echo "Edge-First Smoke Test"
echo "================================"
echo "Endpoint: $ENDPOINT"
echo ""

print_header_row

# Test 1: Baseline (edgeFirst=false) - should NOT have edge headers
TEST1_PAYLOAD="{\"message\":\"$TEST_MESSAGE\",\"edgeFirst\":false}"
run_test "baseline" "$TEST1_PAYLOAD" ""

# Test 2: 100% rollout - should always be active
TEST2_PAYLOAD="{\"message\":\"$TEST_MESSAGE\",\"edgeFirst\":true,\"edgeRolloutPct\":100}"
if ! run_test "100pct-rollout" "$TEST2_PAYLOAD" "active"; then
  echo ""
  echo -e "${RED}SMOKE TEST FAILED${NC}: 100% rollout should always be active"
  exit 1
fi

# Test 3: 0% rollout - should always be skipped
TEST3_PAYLOAD="{\"message\":\"$TEST_MESSAGE\",\"edgeFirst\":true,\"edgeRolloutPct\":0}"
if ! run_test "0pct-rollout" "$TEST3_PAYLOAD" "skipped"; then
  echo ""
  echo -e "${RED}SMOKE TEST FAILED${NC}: 0% rollout should always be skipped"
  exit 1
fi

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}ALL SMOKE TESTS PASSED${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "Edge-first rollout behavior verified:"
echo "  - 100% rollout: users are included (active)"
echo "  - 0% rollout: users are excluded (skipped)"
echo ""
exit 0
