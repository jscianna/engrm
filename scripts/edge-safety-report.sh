#!/usr/bin/env bash
#
# Edge Safety Report Generator
#
# Generates a markdown report from an edge safety snapshot JSON file
# with GO/HOLD/ROLLBACK decision based on safety thresholds.
#
# Usage: ./edge-safety-report.sh <snapshot-json-file>
# Example: ./edge-safety-report.sh ./tmp/edge-safety-20260311-143022.json
#
# Output:
#   - Markdown report printed to stdout
#

set -euo pipefail

# Usage function
usage() {
    echo "Usage: $0 <snapshot-json-file>"
    echo "Generate a markdown report from an edge safety snapshot JSON file."
    exit 1
}

# Check arguments
if [ $# -ne 1 ]; then
    usage
fi

SNAPSHOT_FILE="$1"

# Validate file exists and is readable
if [ ! -f "$SNAPSHOT_FILE" ] || [ ! -r "$SNAPSHOT_FILE" ]; then
    echo "Error: File '$SNAPSHOT_FILE' does not exist or is not readable." >&2
    exit 1
fi

# Validate JSON
if ! jq empty "$SNAPSHOT_FILE" >/dev/null 2>&1; then
    echo "Error: File '$SNAPSHOT_FILE' contains invalid JSON." >&2
    exit 1
fi

# Extract timestamp from filename or use current time
if [[ "$SNAPSHOT_FILE" =~ edge-safety-([0-9]{8}-[0-9]{6})\.json$ ]]; then
    TIMESTAMP="${BASH_REMATCH[1]}"
else
    TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
fi

# Extract metrics
HIT_RATE=$(jq -r '.localRetrieval.hitRate // 0' "$SNAPSHOT_FILE")
SHADOW_AVG_OVERLAP=$(jq -r '.localRetrieval.shadowAvgOverlap // 0' "$SNAPSHOT_FILE")
AVG_RISK_SCORE=$(jq -r '.localRetrieval.avgRiskScore // 0' "$SNAPSHOT_FILE")
AVG_FLUSH_QUALITY=$(jq -r '.localRetrieval.avgFlushQuality // 0' "$SNAPSHOT_FILE")
MISSING_CONSTRAINTS=$(jq -r '.localRetrieval.missingConstraints // 0' "$SNAPSHOT_FILE")

# Function to compare floats
compare_float() {
    local val="$1"
    local op="$2"
    local thresh="$3"
    bc -l <<< "$val $op $thresh"
}

# Evaluate GO criteria
GO_HIT_RATE=$(compare_float "$HIT_RATE" ">=" 0.60 && echo true || echo false)
GO_SHADOW_OVERLAP=$(compare_float "$SHADOW_AVG_OVERLAP" ">=" 0.55 && echo true || echo false)
GO_RISK_SCORE=$(compare_float "$AVG_RISK_SCORE" "<" 0.60 && echo true || echo false)
GO_FLUSH_QUALITY=$(compare_float "$AVG_FLUSH_QUALITY" ">=" 0.60 && echo true || echo false)

# Evaluate ROLLBACK criteria
ROLLBACK_SHADOW_OVERLAP=$(compare_float "$SHADOW_AVG_OVERLAP" "<" 0.35 && echo true || echo false)
ROLLBACK_RISK_SCORE=$(compare_float "$AVG_RISK_SCORE" ">=" 0.75 && echo true || echo false)
ROLLBACK_MISSING_CONSTRAINTS=$([ "$MISSING_CONSTRAINTS" -gt 0 ] && echo true || echo false)

# Determine decision
if [ "$GO_HIT_RATE" = true ] && [ "$GO_SHADOW_OVERLAP" = true ] && [ "$GO_RISK_SCORE" = true ] && [ "$GO_FLUSH_QUALITY" = true ]; then
    DECISION="GO"
elif [ "$ROLLBACK_SHADOW_OVERLAP" = true ] || [ "$ROLLBACK_RISK_SCORE" = true ] || [ "$ROLLBACK_MISSING_CONSTRAINTS" = true ]; then
    DECISION="ROLLBACK"
else
    DECISION="HOLD"
fi

# Function to get status for GO criteria
get_go_status() {
    local met="$1"
    if [ "$met" = true ]; then
        echo "✅ PASS"
    else
        echo "❌ FAIL"
    fi
}

# Function to get status for ROLLBACK criteria
get_rollback_status() {
    local triggered="$1"
    if [ "$triggered" = true ]; then
        echo "❌ FAIL"
    else
        echo "✅ PASS"
    fi
}

# Generate markdown report
cat << EOF
## Edge Safety Report ($TIMESTAMP)

### Metrics

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Hit Rate | $HIT_RATE | ≥ 0.60 | $(get_go_status "$GO_HIT_RATE") |
| Shadow Avg Overlap | $SHADOW_AVG_OVERLAP | ≥ 0.55 | $(get_go_status "$GO_SHADOW_OVERLAP") |
| Avg Risk Score | $AVG_RISK_SCORE | < 0.60 | $(get_go_status "$GO_RISK_SCORE") |
| Avg Flush Quality | $AVG_FLUSH_QUALITY | ≥ 0.60 | $(get_go_status "$GO_FLUSH_QUALITY") |
| Missing Constraints | $MISSING_CONSTRAINTS | = 0 | $(get_rollback_status "$ROLLBACK_MISSING_CONSTRAINTS") |

### Decision: **$DECISION**

### Recommendation
EOF

case "$DECISION" in
    GO)
        echo "All safety criteria met. Proceed with rollout to next stage."
        ;;
    HOLD)
        echo "Some criteria not met but no rollback required. Hold for further evaluation."
        ;;
    ROLLBACK)
        echo "Critical safety criteria failed. Rollback immediately."
        ;;
esac
