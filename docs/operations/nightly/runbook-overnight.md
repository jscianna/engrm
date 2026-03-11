# Overnight Operations Runbook

**Purpose:** Lightweight overnight monitoring and maintenance for FatHippo edge-first rollout.

---

## Quick Reference

| Time (SGT) | Time (UTC) | Action |
|------------|------------|--------|
| 00:00 | 16:00 | Rate limit reset (previous day) |
| 01:00 | 17:00 | Snapshot #1 |
| 03:00 | 19:00 | Snapshot #2 |
| 05:00 | 21:00 | Snapshot #3 |
| 07:00 | 23:00 | Snapshot #4 (pre-morning) |
| 08:00 | 00:00 | Rate limit reset (new day) |

---

## Environment Setup

```bash
# Required environment variables
export FATHIPPO_API_KEY="mem_dfabecd1add7ff435b7c74f79065d788dc2380b98b30b20d"
export FATHIPPO_BASE_URL="https://fathippo.ai"

# Working directory
cd /Users/clawdaddy/clawd/projects/fathippo
```

---

## Hourly Snapshot Command

Run this command hourly to capture metrics:

```bash
./scripts/edge-safety-snapshot.sh "$FATHIPPO_BASE_URL" "$FATHIPPO_API_KEY" ./docs/operations/nightly
```

**Expected output:**
```
hitRate=0.XX shadowAvgOverlap=0.XX avgRiskScore=0.XX avgFlushQuality=0.XX missingConstraints=0
Snapshot saved to: ./docs/operations/nightly/edge-safety-YYYYMMDD-HHMMSS.json
```

---

## Generate Safety Report

After capturing a snapshot, generate the decision report:

```bash
# Find latest snapshot
LATEST=$(ls -t ./docs/operations/nightly/edge-safety-*.json | head -1)

# Generate report
./scripts/edge-safety-report.sh "$LATEST"
```

**Expected output:**
```markdown
## Edge Safety Report (YYYYMMDD-HHMMSS)

### Metrics
| Metric | Value | Threshold | Status |
...

### Decision: **GO** / **HOLD** / **ROLLBACK**
```

---

## Automated Overnight Script

Create cron job for hourly execution:

```bash
# Edit crontab
crontab -e

# Add hourly job (runs at minute 0 every hour)
0 * * * * cd /Users/clawdaddy/clawd/projects/fathippo && ./scripts/overnight-check.sh >> /tmp/fathippo-overnight.log 2>&1
```

### overnight-check.sh

```bash
#!/usr/bin/env bash
set -euo pipefail

cd /Users/clawdaddy/clawd/projects/fathippo

export FATHIPPO_API_KEY="mem_dfabecd1add7ff435b7c74f79065d788dc2380b98b30b20d"
export FATHIPPO_BASE_URL="https://fathippo.ai"

NIGHTLY_DIR="./docs/operations/nightly"
HISTORY_DIR="$NIGHTLY_DIR/history"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Ensure directories exist
mkdir -p "$HISTORY_DIR"

echo "[$TIMESTAMP] Starting overnight check..."

# Capture snapshot
if ./scripts/edge-safety-snapshot.sh "$FATHIPPO_BASE_URL" "$FATHIPPO_API_KEY" "$NIGHTLY_DIR"; then
  LATEST=$(ls -t "$NIGHTLY_DIR"/edge-safety-*.json | head -1)
  
  # Archive to history
  cp "$LATEST" "$HISTORY_DIR/"
  
  # Generate report
  REPORT=$(./scripts/edge-safety-report.sh "$LATEST")
  echo "$REPORT"
  
  # Extract decision
  DECISION=$(echo "$REPORT" | grep -o 'Decision: \*\*[A-Z]*\*\*' | grep -o '[A-Z]*')
  
  # Alert on non-GO status
  if [ "$DECISION" != "GO" ]; then
    echo "⚠️ ALERT: Safety check returned $DECISION"
    # TODO: Add notification hook (Telegram, Discord, etc.)
  fi
  
  # Update drift log
  echo "" >> "$NIGHTLY_DIR/drift-monitor.md"
  echo "### $TIMESTAMP - $DECISION" >> "$NIGHTLY_DIR/drift-monitor.md"
  echo "" >> "$NIGHTLY_DIR/drift-monitor.md"
  
  echo "[$TIMESTAMP] Snapshot captured, decision: $DECISION"
else
  echo "[$TIMESTAMP] ERROR: Snapshot failed (likely rate limit)"
fi
```

---

## Manual Procedures

### Capture Baseline (First Time)

```bash
# Wait for rate limit reset, then capture 3 samples
./scripts/edge-safety-snapshot.sh "$FATHIPPO_BASE_URL" "$FATHIPPO_API_KEY" ./docs/operations/nightly
sleep 1800  # 30 min
./scripts/edge-safety-snapshot.sh "$FATHIPPO_BASE_URL" "$FATHIPPO_API_KEY" ./docs/operations/nightly
sleep 1800
./scripts/edge-safety-snapshot.sh "$FATHIPPO_BASE_URL" "$FATHIPPO_API_KEY" ./docs/operations/nightly

# Set best as baseline
BEST=$(ls -t ./docs/operations/nightly/edge-safety-*.json | head -1)
cp "$BEST" ./docs/operations/nightly/baseline.json
```

### Compare Against Baseline

```bash
BASELINE="./docs/operations/nightly/baseline.json"
LATEST=$(ls -t ./docs/operations/nightly/edge-safety-*.json | head -1)

echo "Baseline:"
jq '.localRetrieval | {hitRate, shadowAvgOverlap, avgRiskScore, avgFlushQuality}' "$BASELINE"

echo "Latest:"
jq '.localRetrieval | {hitRate, shadowAvgOverlap, avgRiskScore, avgFlushQuality}' "$LATEST"
```

### Emergency Rollback

If safety check returns ROLLBACK:

```bash
# Option 1: Set rollout to 0%
curl -X POST "$FATHIPPO_BASE_URL/api/v1/simple/context" \
  -H "Authorization: Bearer $FATHIPPO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message": "test", "edgeFirst": true, "edgeRolloutPct": 0}'

# Option 2: Disable edge-first entirely (client-side)
# Set edgeFirst: false in all client configs
```

---

## Commit and Push Changes

After overnight run, commit any new artifacts:

```bash
cd /Users/clawdaddy/clawd/projects/fathippo

git add docs/operations/nightly/
git commit -m "chore(ops): nightly snapshot $(date +%Y-%m-%d)"
git push origin main
```

---

## Troubleshooting

### Rate Limit Error

```
Error: API returned error
{"error":{"code":"RATE_LIMIT_DAILY","message":"Daily API limit reached..."}}
```

**Solution:** Wait until UTC midnight (08:00 SGT) for reset. Daily limit is 1000 requests.

### 401 Unauthorized

```
Error: Failed to fetch metrics
HTTP/2 401
x-clerk-auth-status: signed-out
```

**Solution:** Verify API key is valid and has `simple.context` scope. The edge/metrics endpoint uses API key auth, not Clerk session auth.

### Empty Metrics (Process Restarted)

```json
{"localRetrieval": {"lookups": 0, "hits": 0, ...}}
```

**Solution:** Metrics are process-local and reset on Vercel cold start. Need to wait for traffic to accumulate or implement persistent metrics storage (see backlog ticket #3).

---

## Contacts

- **On-call:** Check OpenClaw channel
- **Escalation:** John Scianna (@john_scianna on Telegram)

---

*Last updated: 2026-03-11*
