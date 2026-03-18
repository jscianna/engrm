# Runbook: Decryption Failures

## Symptoms
- Dashboard shows `[encrypted — unable to decrypt]`
- API 500s with `Failed to decrypt memory content`
- Logs contain `Unsupported state or unable to authenticate data`

## Likely Causes
1. ENCRYPTION_KEY mismatch between environments
2. Wrong TURSO database target (local vs prod DB mismatch)
3. Partial key-derivation migration (mixed SHA-256/HKDF states)

## Triage Checklist
1. Verify runtime key format (64-char hex or canonical 32-byte base64)
2. Verify DB endpoint parity (`TURSO_DATABASE_URL`)
3. Run deploy preflight:
   ```bash
   npm run preflight:deploy
   ```
4. Run smoke checks:
   ```bash
   npm run smoke:deploy
   ```

## Recovery Steps
1. Freeze writes if broad decrypt failures are active
2. Confirm correct key + DB target in production env
3. Run migration runner (idempotent)
4. Re-run smoke checks
5. Monitor logs for residual failures

## Prevention
- Keep preflight gate required in CI
- Keep post-deploy smoke checks required
- Never rotate ENCRYPTION_KEY without explicit migration plan
