# OpenClaw One-Command Connect Plan

## Goal

Ship a hosted install flow that lets a user run:

```bash
npx @fathippo/connect openclaw
```

and finish with FatHippo connected to OpenClaw without manually creating, copying, or pasting an API key.

The installer should:

1. Verify OpenClaw is available.
2. Create a secure login link and copy it to the clipboard.
3. Wait for the user to authenticate in the browser.
4. Receive a fresh OpenClaw-scoped API key automatically.
5. Install and configure the OpenClaw plugin.
6. Restart OpenClaw.
7. Confirm success and point the user back to the dashboard.

## Why This Matters

Our current hosted OpenClaw setup is technically automatic after install, but operationally it is still a multi-step handoff:

- install plugin
- set context engine
- create or find API key
- paste API key into config
- restart gateway

The biggest activation drop-off is between "interested" and "has a working hosted key in OpenClaw."

One-command connect solves the biggest UX problem first. It does not need to wait for broader memory-pipeline changes.

## Current State

Relevant existing surfaces:

- OpenClaw plugin package already exists at `packages/context-engine`
- Signed-in API key creation already exists at `/api/v1/auth`
- Dashboard already has an OpenClaw setup card at `src/components/openclaw-connect-card.tsx`
- Plugin check-in metadata is already recorded in `src/lib/api-auth.ts` and `src/lib/db.ts`

Current plugin behavior:

- Per-turn retrieval already happens in `assemble()`
- Selective user-message capture happens in `ingest()`
- Post-turn trace capture happens in `afterTurn()`

Current blocker:

- Hosted connect still requires the user to manually handle `mem_xxx`

## Product Requirements

### Primary UX

```text
$ npx @fathippo/connect openclaw

Checking OpenClaw...
Creating secure login link...
Link copied to your clipboard.

Finish login in your browser:
https://fathippo.ai/connect/openclaw?connectId=...

Waiting for authorization...
Authorized. Installing FatHippo for OpenClaw...
Restarting OpenClaw...

FatHippo is connected to OpenClaw.
```

### Secondary UX

- `npx @fathippo/connect openclaw --local`
  No login, no hosted key, configures local-only mode.
- `npx @fathippo/connect openclaw --api-key mem_xxx`
  Bypass browser login entirely.
- `npx @fathippo/connect openclaw --namespace my-project`
  Associate the OpenClaw install with a shared FatHippo namespace.

### Guardrails

- Always mint a fresh key for installer-based hosted setup.
- Never reveal an existing stored key in the browser.
- Use least-privilege OpenClaw scopes instead of the broad default agent scopes.
- Do not promise "every exchange gets extracted and merged" until the hosted turn pipeline is upgraded.

## Recommendation

Create a new package:

- `packages/connect`
- published as `@fathippo/connect`
- executable via `npx @fathippo/connect openclaw`

Why a new package instead of reusing `packages/cli`:

- The existing CLI is for memory operations and workspace migration.
- The installer has a different trust model, auth flow, and product surface.
- A dedicated package keeps the one-command experience small, clear, and easy to publish/document.

Optional follow-up:

- Add `fathippo connect openclaw` as an alias inside the existing CLI later.

## Proposed Architecture

There are four pieces.

### 1. Installer CLI

New package: `packages/connect`

Responsibilities:

- detect `openclaw` on PATH
- detect OS and clipboard availability
- create a temporary hosted connect session
- print and copy the login link
- poll for completion
- install plugin
- configure OpenClaw with hosted or local mode
- restart gateway
- run best-effort verification

Suggested command surface:

```bash
npx @fathippo/connect openclaw [--local] [--api-key <key>] [--namespace <name>] [--base-url <url>] [--no-restart] [--json]
```

### 2. Hosted Connect Session API

Add a dedicated connect flow for the CLI.

New endpoints:

- `POST /api/connect/openclaw/start`
- `GET /api/connect/openclaw/poll`
- `POST /api/connect/openclaw/claim`

Purpose:

- `start` creates a short-lived connect session and returns a login URL
- `claim` is called by the authenticated browser page and creates a fresh OpenClaw key
- `poll` lets the CLI receive the claimed install payload once

### 3. Browser Connect Page

Add a signed-in landing page for the login link:

- `src/app/connect/openclaw/page.tsx`

Responsibilities:

- require Clerk sign-in
- show user what is being connected
- optionally let them confirm namespace
- run entitlement preflight
- mint a fresh OpenClaw-scoped key
- mark the connect session complete
- show "you can return to the terminal"

### 4. OpenClaw Plugin Runtime Metadata

The OpenClaw plugin currently has no first-class `namespace` or `installationId` config even though the hosted runtime layer already supports these concepts.

Add config support in `packages/context-engine` for:

- `namespace`
- `installationId`
- `workspaceId` (optional, can be deferred if we want to keep the first pass smaller)

Then forward them via request headers from the hosted client:

- `X-Fathippo-Runtime: openclaw`
- `X-Fathippo-Namespace`
- `X-Fathippo-Installation-Id`
- optionally `X-Fathippo-Workspace-Id`

This matters because:

- namespace auto-create already exists when a runtime header is present
- installation identity makes plugin check-in and future reconnect/update UX much better

## Hosted Login Flow

### CLI start

`POST /api/connect/openclaw/start`

Request:

```json
{
  "cliVersion": "0.1.0",
  "platform": "darwin",
  "arch": "arm64",
  "mode": "hosted",
  "namespaceHint": "fat-hippo",
  "installationName": "johns-macbook-openclaw"
}
```

Response:

```json
{
  "connectId": "conn_xxx",
  "pollToken": "poll_xxx",
  "loginUrl": "https://fathippo.ai/connect/openclaw?connectId=conn_xxx",
  "userCode": "ABCD-EFGH",
  "expiresAt": "2026-03-14T12:00:00.000Z",
  "pollIntervalMs": 2000
}
```

Installer behavior:

- attempts clipboard copy for `loginUrl`
- prints the full link
- optionally offers `--open` later, but do not require desktop browser integration for v1

### Browser claim

User opens the link.

Page flow:

1. If signed out, Clerk sign-in and redirect back.
2. Load the connect session by `connectId`.
3. Show:
   - OpenClaw connect request
   - account email
   - hosted entitlement status
   - namespace choice
4. On confirm, `POST /api/connect/openclaw/claim`.

Claim request:

```json
{
  "connectId": "conn_xxx",
  "namespace": "my-project",
  "installationName": "johns-macbook-openclaw"
}
```

Claim server behavior:

1. Require Clerk auth.
2. Confirm the connect session is pending and unexpired.
3. Check hosted entitlement.
4. Create or resolve namespace if provided.
5. Create a fresh OpenClaw-scoped API key.
6. Generate a stable `installationId`.
7. Store a short-lived encrypted install payload on the connect session.
8. Mark the session claimed.

### CLI poll + exchange

`GET /api/connect/openclaw/poll?connectId=conn_xxx`

Authenticated with:

- `Authorization: Bearer poll_xxx`

Poll responses:

- `pending`
- `claimed`
- `expired`
- `consumed`

Once claimed, response returns the install payload exactly once:

```json
{
  "status": "claimed",
  "payload": {
    "apiKey": "mem_xxx",
    "baseUrl": "https://fathippo.ai/api",
    "namespace": "my-project",
    "installationId": "inst_xxx",
    "pluginPackage": "@fathippo/fathippo-context-engine"
  }
}
```

Then the server marks the connect session consumed.

## Local-Only Flow

No hosted API work is needed.

Command:

```bash
npx @fathippo/connect openclaw --local
```

Installer does:

1. verify `openclaw` exists
2. install plugin
3. set context engine slot
4. set mode to `local`
5. restart gateway

No API key, browser, or entitlement checks.

## OpenClaw Config Writes

For v1, prefer calling the OpenClaw CLI instead of directly editing YAML.

Hosted mode commands:

```bash
openclaw plugins install @fathippo/fathippo-context-engine
openclaw config set plugins.slots.contextEngine fathippo-context-engine
openclaw config set plugins.entries.fathippo-context-engine.config.mode hosted
openclaw config set plugins.entries.fathippo-context-engine.config.apiKey mem_xxx
openclaw config set plugins.entries.fathippo-context-engine.config.baseUrl https://fathippo.ai/api
openclaw config set plugins.entries.fathippo-context-engine.config.namespace my-project
openclaw config set plugins.entries.fathippo-context-engine.config.installationId inst_xxx
openclaw config set plugins.entries.fathippo-context-engine.config.injectCritical true
openclaw gateway restart
```

Local mode commands:

```bash
openclaw plugins install @fathippo/fathippo-context-engine
openclaw config set plugins.slots.contextEngine fathippo-context-engine
openclaw config set plugins.entries.fathippo-context-engine.config.mode local
openclaw gateway restart
```

## Required Plugin Changes

### Add config fields

Update:

- `packages/context-engine/src/types.ts`
- `packages/context-engine/openclaw.plugin.json`
- `packages/context-engine/README.md`

New config fields:

- `namespace?: string | null`
- `installationId?: string | null`
- `workspaceId?: string | null` optional

### Forward runtime headers

Update:

- `packages/hosted/src/client.ts`
- `packages/context-engine/src/engine.ts`

Needed behavior:

- hosted client should accept runtime metadata-like headers
- context engine should pass:
  - runtime `openclaw`
  - namespace from config
  - installationId from installer

Without this, the installer cannot fully set up shared namespace behavior for OpenClaw.

## Recommended OpenClaw Key Scopes

Do not use `DEFAULT_AGENT_API_KEY_SCOPES` for installer-created OpenClaw keys.

Create a dedicated scope set such as:

```ts
const OPENCLAW_CONNECT_API_KEY_SCOPES = [
  "context",
  "search",
  "memories.create",
  "indexed.list",
  "lifecycle.maintenance",
  "cognitive.constraints.list",
  "cognitive.constraints.create",
  "cognitive.traces.create",
  "cognitive.traces.relevant",
  "cognitive.patterns.extract",
  "cognitive.skills.synthesize",
];
```

Reason:

- least privilege
- safer installer-generated keys
- easier future auditing and revocation

## Data Model

Add a short-lived connect session store.

Preferred first version:

- DB-backed table in Turso

Suggested columns:

- `id`
- `purpose` (`openclaw_connect`)
- `poll_token_hash`
- `status` (`pending`, `claimed`, `consumed`, `expired`)
- `user_id`
- `namespace_name`
- `installation_name`
- `installation_id`
- `encrypted_payload_json`
- `created_at`
- `expires_at`
- `claimed_at`
- `consumed_at`
- `last_polled_at`
- `cli_version`
- `platform`

Security notes:

- never store raw `pollToken`
- encrypt any payload containing the API key
- expire sessions aggressively, e.g. 10 minutes
- delete or tombstone consumed sessions

## Browser UX

New page: `src/app/connect/openclaw/page.tsx`

States:

- loading
- sign-in required
- hosted plan required
- ready to connect
- connected successfully
- expired link

Copy should be plain:

- "This will create a fresh OpenClaw key for this device."
- "You can close this tab after the terminal says setup is complete."

Do not show the raw API key in the browser unless recovery is absolutely necessary.

## CLI UX Details

### Preflight checks

- `openclaw` command available
- network reachable to `fathippo.ai`
- if hosted mode, confirm server says the connect session is valid

### Clipboard

Attempt clipboard copy on supported platforms:

- macOS: `pbcopy`
- Linux: `xclip` or `wl-copy` if present
- Windows: `clip`

If clipboard copy fails:

- print the link and continue

### Restart behavior

Default:

- restart automatically

Flags:

- `--no-restart`
- `--json`

### Verification

Best-effort v1 verification:

- confirm the config commands succeeded
- confirm the plugin install command succeeded
- confirm restart command exited cleanly

Hosted verification can remain indirect in v1:

- plugin metadata check-in on first real request

## Files To Add

### New package

- `packages/connect/package.json`
- `packages/connect/tsconfig.json`
- `packages/connect/src/index.ts`
- `packages/connect/src/openclaw.ts`
- `packages/connect/src/cli.ts`
- `packages/connect/src/shell.ts`
- `packages/connect/src/http.ts`
- `packages/connect/src/clipboard.ts`

### Web/API

- `src/app/connect/openclaw/page.tsx`
- `src/app/api/connect/openclaw/start/route.ts`
- `src/app/api/connect/openclaw/poll/route.ts`
- `src/app/api/connect/openclaw/claim/route.ts`
- `src/lib/connect-sessions.ts`

### Plugin/runtime

- `packages/context-engine/src/types.ts`
- `packages/context-engine/openclaw.plugin.json`
- `packages/context-engine/src/index.ts`
- `packages/context-engine/src/engine.ts`
- `packages/hosted/src/client.ts`

### Docs

- root `README.md`
- `packages/context-engine/README.md`
- `src/app/docs/guides/openclaw/page.tsx`
- dashboard card copy in `src/components/openclaw-connect-card.tsx`

## Delivery Phases

### Phase 1: Installer skeleton

Goal:

- Local-only one-command flow ships first.

Scope:

- new `@fathippo/connect` package
- `openclaw` detection
- plugin install
- config set
- restart

Acceptance:

- `npx @fathippo/connect openclaw --local` works on a clean machine with OpenClaw installed

### Phase 2: Hosted connect sessions

Goal:

- Browser login link creates and returns a fresh OpenClaw key automatically.

Scope:

- connect session DB table
- start/claim/poll endpoints
- browser connect page
- CLI polling

Acceptance:

- user never manually handles `mem_xxx`

### Phase 3: Namespace + installation identity

Goal:

- OpenClaw joins the same hosted project graph as MCP clients.

Scope:

- plugin config fields for `namespace` and `installationId`
- hosted client runtime headers from OpenClaw plugin

Acceptance:

- namespace auto-create works from OpenClaw
- dashboard can distinguish connected installs more reliably

### Phase 4: Hardening and polish

Scope:

- least-privilege OpenClaw scopes
- reconnect flow
- better terminal UX
- analytics
- failure recovery

Acceptance:

- retries are clean
- expired links are understandable
- reconnecting the same machine is obvious

## Risks

### 1. OpenClaw config persistence

Risk:

- CLI-based config writes may behave differently across OpenClaw versions.

Mitigation:

- use official `openclaw config set` commands first
- keep a fallback direct-config writer behind a feature flag only if needed

### 2. Browser login on a different machine

Risk:

- user may open the link on a phone or another computer

Mitigation:

- polling-based device flow already supports this well

### 3. Plaintext key storage in OpenClaw config

Risk:

- v1 likely stores the API key in config

Mitigation:

- treat this as acceptable short-term parity with current setup
- explore OpenClaw secret-ref integration later

### 4. Installer ships before richer turn pipeline

Risk:

- users may expect Mem0-style "every exchange gets captured and merged"

Mitigation:

- market installer as "one-command activation"
- keep "full exchange extraction" as a separate follow-up track

## Success Metrics

- OpenClaw hosted connect time under 90 seconds
- 80%+ of hosted OpenClaw connects complete without dashboard assistance
- materially higher OpenClaw hosted activation rate from dashboard/settings page
- reduced creation of orphaned OpenClaw API keys

## Recommendation Summary

Build this in the following order:

1. Ship `@fathippo/connect` for local mode first.
2. Add hosted connect sessions with browser login link + polling.
3. Extend the OpenClaw plugin with `namespace` and `installationId`.
4. Replace current dashboard "copy commands + raw key" setup with "copy link + one command."

This is the fastest path to the biggest activation unlock.
