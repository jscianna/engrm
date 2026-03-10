# FatHippo Production Launch Runbook

This runbook covers the minimum rollout procedure for launching FatHippo's cognitive substrate safely.

## Required environment

Set these before launch:

- `ENCRYPTION_KEY`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN` when required by the target database
- `ADMIN_API_KEY`
- `ADMIN_EMAILS=<your company email>` or `ADMIN_USER_IDS=<comma-separated Clerk user ids>`
- `COGNITIVE_ENABLE_BENCHMARK_RUNS=true`
- `COGNITIVE_ENABLE_SKILL_PUBLICATION=false` unless publication is intentionally enabled later
- `COGNITIVE_GLOBAL_ARTIFACT_AGENT_IDS=<comma-separated allowlist>`
- `OPS_ALERT_WEBHOOK_URL=<webhook endpoint>`
- `OPS_ALERT_WEBHOOK_FORMAT=generic` or `slack`
- `OPS_ALERT_WEBHOOK_BEARER_TOKEN=<optional webhook bearer token>`

Recommended:

- `CLOUDFLARE_WAF_ENABLED=true`
- Clerk production keys configured for all user-facing auth paths
- optional Clerk metadata with `role: "admin"` for admin users

## Preflight checks

Run this in the repo root:

```bash
npm run check:cognitive-launch
```

Then verify admin health:

1. `GET /api/admin/security-status`
2. Confirm `authentication.apiAuth.scopesEnforced` is `true`
3. Confirm `monitoring.delivery.configured` is `true`
4. Confirm `monitoring.alertCount` is `0`

## API key scope migration

Inspect migration state:

1. `GET /api/admin/auth-migrations`
2. Review `legacyKeysMissingScopes`
3. Review `revocableWildcardKeys`

Dry-run the backfill first:

```json
POST /api/admin/auth-migrations
{
  "dryRun": true
}
```

Apply the backfill only after reviewing the candidate set:

```json
POST /api/admin/auth-migrations
{
  "dryRun": false
}
```

If wildcard keys remain intentionally, document the owner and justification before launch.

## Operational alert delivery

Inspect current alert state:

1. `GET /api/admin/operational-alerts`
2. Confirm the webhook destination is configured
3. Confirm the alert list is empty or understood

Send a manual delivery test:

```json
POST /api/admin/operational-alerts
{
  "force": true,
  "reason": "launch smoke test"
}
```

If the delivery call fails, do not launch until the webhook is fixed.

## Cognitive launch gates

Before launch:

1. Run `npm run check:cognitive-launch`
2. Confirm recent benchmark runs are passing
3. Confirm there are no stale heartbeat jobs
4. Confirm shared learning is opt-in only
5. Confirm global artifact agents are explicitly allowlisted
6. Confirm skill publication remains disabled unless deliberately approved

## Rollout sequence

1. Deploy code with new schema-aware paths.
2. Verify `GET /api/admin/security-status`.
3. Dry-run API key scope backfill.
4. Apply scope backfill if the candidate set is correct.
5. Send a forced alert delivery smoke test.
6. Run one benchmark job and verify the gate output.
7. Watch the dashboard and admin status for heartbeat freshness and new alerts.
8. Open traffic gradually.

## Rollback

Rollback if any of these occur:

- benchmark gates fail unexpectedly
- operational alert delivery is not working
- scope enforcement blocks critical agent traffic unexpectedly
- heartbeat jobs stop succeeding

Rollback procedure:

1. Disable traffic or revert the deployment.
2. Set `COGNITIVE_ENABLE_BENCHMARK_RUNS=false` if benchmark jobs are destabilizing production.
3. Set `COGNITIVE_ENABLE_SKILL_PUBLICATION=false`.
4. Review `/api/admin/security-status` and `/api/admin/operational-alerts`.
5. Inspect recent audit events for `admin.migrate`, `admin.maintenance`, `cognitive.pattern.extract`, and `cognitive.skill.synthesize`.

## Daily operator checks after launch

Review at least once per day:

1. `GET /api/admin/security-status`
2. `GET /api/admin/operational-alerts`
3. the cognitive dashboard
4. failed benchmark runs in the last 24 hours
5. wildcard or legacy API keys that reappear

## Launch blockers

Do not launch if any of these are true:

- `OPS_ALERT_WEBHOOK_URL` is not configured
- wildcard API keys exist without explicit owner approval
- benchmark gates are failing
- heartbeat jobs are stale
- admin auth is not configured
- shared learning defaults are not opt-in
