# Runbook: Schema Drift

## Symptoms
- API errors like `no such column: peer`
- Feature works locally but fails in production

## Triage
1. Run preflight:
   ```bash
   npm run preflight:deploy
   ```
2. Inspect required columns/indexes in `scripts/preflight-deploy.mjs`
3. Check startup bootstrap path in `src/lib/db.ts` (`ensureMemoriesColumns`, `ensureMemoriesIndexes`)

## Immediate Fix
If a required column is missing in production, apply a safe ALTER:
```sql
ALTER TABLE memories ADD COLUMN peer TEXT NOT NULL DEFAULT 'user';
CREATE INDEX IF NOT EXISTS idx_memories_user_peer ON memories(user_id, peer);
```

## Follow-up
- Add explicit migration file for any new schema fields
- Keep runtime bootstrap as safety net, not primary migration strategy
- Add regression test covering the new column/index assumptions
