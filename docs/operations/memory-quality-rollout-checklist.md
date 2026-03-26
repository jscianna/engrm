# Memory Quality Rollout Checklist (All FatHippo Users)

## Objective
Enforce high-quality memory storage at platform level (not per-agent prompts).

## Included in this rollout
- Backend write-path quality gate (durable/decisional/transferable 2-of-3)
- Hard denylist for operational/tool noise
- Canonical dedupe with normalized text
- 14-day near-duplicate cooldown
- Lower baseline importance for normal memories (2/10 equivalent)
- API response reason codes for remember endpoint
- Nightly compaction script for existing noisy memory rows
- Reserved internal memory types (`session_summary`, `compacted`) blocked on public write APIs unless an internal bypass flag is set

## API behavior changes (`POST /api/v1/simple/remember`)
Responses now include:
- `reason_code`:
  - `stored`
  - `updated_existing`
  - `merged_exact_duplicate`
  - `rejected_empty`
  - `rejected_low_quality`
  - `rejected_hard_deny`
  - `rejected_secret`
  - `rejected_duplicate_cooldown`

## Deploy steps
1. Deploy backend with updated `src/lib/turn-capture.ts` and `src/app/api/v1/simple/remember/route.ts`
2. Run smoke checks:
   - high-quality statement stores (`stored`)
   - duplicate statement merges (`merged_exact_duplicate`)
   - operational noise rejects (`rejected_hard_deny` or `rejected_low_quality`)
3. Confirm dashboards/logging include `reason_code` for observability.

## Nightly hygiene job
Script:
- `scripts/nightly_memory_quality.mjs`

NPM commands:
- Dry run: `npm run memory:quality`
- Apply cleanup: `npm run memory:quality:apply`

## Scheduler recommendation
Run daily at 03:15 UTC:
```cron
15 3 * * * cd /srv/fathippo && FATHIPPO_API_KEY=*** npm run memory:quality:apply >> /var/log/fathippo-memory-quality.log 2>&1
```

## Guardrails
- Start with dry-run for 48 hours to inspect deletions.
- If false positives appear, adjust deny patterns before apply mode.
- Keep one-week backup/snapshot of memory DB before first apply run.

## Success metrics
- Duplicate insertion rate down >70%
- Low-signal reject rate stable (not near 0, not near 100)
- Context precision improves (fewer irrelevant recalls)
- Manual cleanup volume trends down week-over-week
