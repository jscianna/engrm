#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: overnight-monitor.sh [--dry-run] [--commit]

Environment:
  FATHIPPO_BASE_URL   (default: https://fathippo.ai)
  FATHIPPO_API_KEY    (required)

Options:
  --dry-run   Run checks and print output, no file writes
  --commit    Auto-commit updated nightly docs/history
EOF
}

DRY_RUN=false
AUTO_COMMIT=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --commit) AUTO_COMMIT=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $arg"; usage; exit 1 ;;
  esac
done

BASE_URL="${FATHIPPO_BASE_URL:-https://fathippo.ai}"
API_KEY="${FATHIPPO_API_KEY:-}"
if [ -z "$API_KEY" ]; then
  echo "FATHIPPO_API_KEY is required" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
NIGHTLY_DIR="$PROJECT_DIR/docs/operations/nightly"
HISTORY_DIR="$NIGHTLY_DIR/history"
mkdir -p "$NIGHTLY_DIR" "$HISTORY_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
HUMAN="$(date '+%Y-%m-%d %H:%M:%S %Z')"

if [ "$DRY_RUN" = true ]; then
  SNAPSHOT_PATH="$NIGHTLY_DIR/edge-safety-$TS.json"
  "$SCRIPT_DIR/edge-safety-snapshot.sh" "$BASE_URL" "$API_KEY" "$NIGHTLY_DIR"
  "$SCRIPT_DIR/edge-safety-report.sh" "$SNAPSHOT_PATH"
  exit 0
fi

SNAPSHOT_OUT="$($SCRIPT_DIR/edge-safety-snapshot.sh "$BASE_URL" "$API_KEY" "$NIGHTLY_DIR")"
echo "$SNAPSHOT_OUT"
SNAPSHOT_FILE="$(echo "$SNAPSHOT_OUT" | awk '/Snapshot saved to:/{print $4}' | tail -1)"
if [ -z "$SNAPSHOT_FILE" ] || [ ! -f "$SNAPSHOT_FILE" ]; then
  echo "Could not locate snapshot file" >&2
  exit 1
fi

cp "$SNAPSHOT_FILE" "$HISTORY_DIR/"
REPORT="$($SCRIPT_DIR/edge-safety-report.sh "$SNAPSHOT_FILE")"
echo "$REPORT"

DECISION="$(echo "$REPORT" | sed -n 's/.*Decision: \*\*\([A-Z]*\)\*\*.*/\1/p' | head -1)"
HIT_RATE="$(jq -r '.localRetrieval.hitRate // 0' "$SNAPSHOT_FILE")"
OVERLAP="$(jq -r '.localRetrieval.shadowAvgOverlap // 0' "$SNAPSHOT_FILE")"
RISK="$(jq -r '.compactionSafety.avgRiskScore // 0' "$SNAPSHOT_FILE")"
FLUSH="$(jq -r '.compactionSafety.avgFlushQuality // 0' "$SNAPSHOT_FILE")"
MISSING="$(jq -r '.compactionSafety.postCompactionMissingConstraints // 0' "$SNAPSHOT_FILE")"

cat >> "$NIGHTLY_DIR/drift-monitor.md" <<EOF

### $HUMAN - ${DECISION:-UNKNOWN}
- Hit Rate: $HIT_RATE
- Shadow Overlap: $OVERLAP
- Risk Score: $RISK
- Flush Quality: $FLUSH
- Missing Constraints: $MISSING
- Snapshot: \`$(basename "$SNAPSHOT_FILE")\`
EOF

if [ "$AUTO_COMMIT" = true ]; then
  cd "$PROJECT_DIR"
  git add "$NIGHTLY_DIR" || true
  git commit -m "chore(nightly): monitor snapshot $TS (${DECISION:-UNKNOWN})" || true
fi

echo "[$HUMAN] Overnight monitor done (${DECISION:-UNKNOWN})"
