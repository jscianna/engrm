#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 \"checkpoint message\" \"ultrawork prompt\""
  exit 1
fi

CHECKPOINT_MSG="$1"
PROMPT="$2"

echo "[ultrawork-safe] Running scoped task..."
opencode run "$PROMPT"

echo "[ultrawork-safe] Checkpointing..."
git add -A
git commit -m "checkpoint: ${CHECKPOINT_MSG}" || true
git push || true

echo "[ultrawork-safe] Done."
