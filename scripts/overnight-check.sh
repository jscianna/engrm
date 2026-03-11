#!/usr/bin/env bash
#
# Overnight Check Script
#
# Captures edge safety metrics, generates report, and updates drift log.
# Designed to run hourly via cron during overnight monitoring.
#
# Usage: ./overnight-check.sh
#
# Environment:
#   FATHIPPO_API_KEY - API key (defaults to configured key)
#   FATHIPPO_BASE_URL - Base URL (defaults to https://fathippo.ai)
#

set -euo pipefail

# Configuration
FATHIPPO_API_KEY="${FATHIPPO_API_KEY:-mem_dfabecd1add7ff435b7c74f79065d788dc2380b98b30b20d}"
FATHIPPO_BASE_URL="${FATHIPPO_BASE_URL:-https://fathippo.ai}"

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
NIGHTLY_DIR="$PROJECT_DIR/docs/operations/nightly"
HISTORY_DIR="$NIGHTLY_DIR/history"

# Timestamp
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DATE_HUMAN=$(date "+%Y-%m-%d %H:%M:%S %Z")

echo "[$DATE_HUMAN] Starting overnight check..."

# Ensure directories exist
mkdir -p "$HISTORY_DIR"

# Change to project directory
cd "$PROJECT_DIR"

# Capture snapshot
echo "Capturing metrics snapshot..."
if SNAPSHOT_OUTPUT=$("$SCRIPT_DIR/edge-safety-snapshot.sh" "$FATHIPPO_BASE_URL" "$FATHIPPO_API_KEY" "$NIGHTLY_DIR" 2>&1); then
  echo "$SNAPSHOT_OUTPUT"
  
  # Find latest snapshot
  LATEST=$(ls -t "$NIGHTLY_DIR"/edge-safety-*.json 2>/dev/null | head -1)
  
  if [ -z "$LATEST" ]; then
    echo "ERROR: No snapshot file found"
    exit 1
  fi
  
  # Archive to history
  cp "$LATEST" "$HISTORY_DIR/"
  echo "Archived to: $HISTORY_DIR/$(basename "$LATEST")"
  
  # Generate report
  echo ""
  echo "Generating safety report..."
  REPORT=$("$SCRIPT_DIR/edge-safety-report.sh" "$LATEST")
  echo "$REPORT"
  
  # Extract decision
  DECISION=$(echo "$REPORT" | grep -o 'Decision: \*\*[A-Z]*\*\*' | sed 's/Decision: \*\*\([A-Z]*\)\*\*/\1/' || echo "UNKNOWN")
  
  # Extract key metrics for drift log
  HIT_RATE=$(jq -r '.localRetrieval.hitRate // "N/A"' "$LATEST")
  SHADOW_OVERLAP=$(jq -r '.localRetrieval.shadowAvgOverlap // "N/A"' "$LATEST")
  RISK_SCORE=$(jq -r '.localRetrieval.avgRiskScore // "N/A"' "$LATEST")
  FLUSH_QUALITY=$(jq -r '.localRetrieval.avgFlushQuality // "N/A"' "$LATEST")
  MISSING=$(jq -r '.localRetrieval.missingConstraints // "N/A"' "$LATEST")
  
  # Update drift log
  DRIFT_ENTRY="
### $DATE_HUMAN - $DECISION

**Metrics:**
- Hit Rate: $HIT_RATE
- Shadow Overlap: $SHADOW_OVERLAP
- Risk Score: $RISK_SCORE
- Flush Quality: $FLUSH_QUALITY
- Missing Constraints: $MISSING

**Snapshot:** \`$(basename "$LATEST")\`
"
  
  echo "$DRIFT_ENTRY" >> "$NIGHTLY_DIR/drift-monitor.md"
  echo "Updated drift log"
  
  # Alert on non-GO status
  if [ "$DECISION" != "GO" ] && [ "$DECISION" != "UNKNOWN" ]; then
    echo ""
    echo "⚠️  ALERT: Safety check returned $DECISION"
    echo "Review the report above and take appropriate action."
    # TODO: Add notification hook
    # curl -X POST "https://api.telegram.org/bot.../sendMessage" \
    #   -d "chat_id=...&text=FatHippo Safety Alert: $DECISION"
  fi
  
  echo ""
  echo "[$DATE_HUMAN] Overnight check complete. Decision: $DECISION"
  
else
  echo "ERROR: Snapshot capture failed"
  echo "$SNAPSHOT_OUTPUT"
  
  # Log failure to drift monitor
  DRIFT_ENTRY="
### $DATE_HUMAN - ERROR

**Status:** Snapshot capture failed
**Reason:** Likely API rate limit or auth issue

**Raw output:**
\`\`\`
$SNAPSHOT_OUTPUT
\`\`\`
"
  echo "$DRIFT_ENTRY" >> "$NIGHTLY_DIR/drift-monitor.md"
  
  exit 1
fi
