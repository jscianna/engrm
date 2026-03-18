# Runbook: Environment Parity (Local vs Production)

## Goal
Ensure production runs the same critical env+DB assumptions tested locally.

## Required Parity
- `ENCRYPTION_KEY`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- expected DB target (`EXPECTED_TURSO_DATABASE_URL` in CI)

## Checks
1. Preflight gate:
   ```bash
   npm run preflight:deploy
   ```
2. Smoke checks:
   ```bash
   npm run smoke:deploy
   ```

## Common Failure Pattern
- Local migration runs against DB-A
- Production serves DB-B
- Result: "works locally, broken in prod"

## Prevention
- Set `EXPECTED_TURSO_DATABASE_URL` in GitHub Actions secrets
- Require preflight workflow to pass before merge/deploy
- Document and review any env var changes in PR description

## Incident Response
1. Identify active production DB URL
2. Compare against expected URL
3. If mismatch, correct env and redeploy
4. Re-run smoke checks
