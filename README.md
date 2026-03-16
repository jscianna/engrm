<p align="center">
  <img src="https://raw.githubusercontent.com/jscianna/fathippo/main/public/hippo.png" alt="FatHippo" width="140" />
</p>

<h1 align="center">FatHippo</h1>

<p align="center">
  <strong>Your coding agent gets smarter every session — across every platform.</strong><br/>
  One setup command connects FatHippo to Claude Code, Cursor, Codex, Windsurf, Zed, VS Code, OpenCode, Antigravity, Trae, Qoder, Hermes Agent, and OpenClaw. Your agent remembers context, learns from coding patterns, and synthesizes reusable skills — automatically.
</p>

<p align="center">
  <a href="https://fathippo.ai">Website</a> •
  <a href="https://fathippo.ai/docs">Documentation</a> •
  <a href="https://www.npmjs.com/package/@fathippo/fathippo-context-engine">OpenClaw Context Engine</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/typescript-5.0+-blue.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/next.js-16+-black.svg" alt="Next.js" />
  <img src="https://img.shields.io/npm/v/@fathippo/fathippo-context-engine.svg" alt="npm" />
</p>

---

## Quick Start

The fastest way to get started — connects all your coding agents in one command:

```bash
# Connect to all your coding agents in one command
npx fathippo setup

# Or connect to OpenClaw specifically
npx @fathippo/connect openclaw
```

---

## Works Everywhere

| Platform               | Setup Method                     | Status |
|------------------------|----------------------------------|--------|
| Claude Code            | `npx fathippo setup`             | ✅     |
| Cursor                 | `npx fathippo setup`             | ✅     |
| Codex                  | `npx fathippo setup`             | ✅     |
| Windsurf               | `npx fathippo setup`             | ✅     |
| Zed                    | `npx fathippo setup`             | ✅     |
| VS Code                | `npx fathippo setup`             | ✅     |
| OpenCode               | `npx fathippo setup`             | ✅     |
| Antigravity (Google)   | `npx fathippo setup`             | ✅     |
| Trae (ByteDance)       | `npx fathippo setup`             | ✅     |
| Qoder (Alibaba)        | `npx fathippo setup`             | ✅     |
| Hermes Agent (Nous Research) | `npx fathippo setup`       | ✅     |
| OpenClaw               | `npx @fathippo/connect openclaw` | ✅     |

---

## What FatHippo Is

FatHippo is a cognitive layer for AI coding agents. When connected:

- Your agent learns from real coding sessions — not pre-trained data
- Repeated fix patterns are automatically extracted and reused
- Successful approaches become synthesized skills
- Memory, patterns, and skills flow across all connected platforms
- Everything improves with a built-in feedback loop

The goal is simple: connect it once, then let your agent become more capable every week.

---

## How The Learning Loop Works

```
Coding Session → Trace Capture → Pattern Extraction → Skill Synthesis
     ↑                                                        |
     └──────── Better context + suggestions ←──── Feedback ←──┘
```

1. You code. FatHippo captures structured traces (problem, approach, outcome).
2. Repeated successful traces cluster into patterns.
3. High-confidence patterns synthesize into reusable skills.
4. Next session: your agent gets relevant patterns and skills injected before it starts.
5. Automatic feedback detection improves pattern confidence over time.

---

## Two Ways To Use FatHippo

FatHippo currently has two customer-facing offers:

- **Free (Local-Only) - $0/month**: private on-device memory plus lightweight local workflow/fix reuse, without hosted sync/imports or account-backed cognition. No account required.
- **Hosted - $4.99/month or $49.99/year (save 17%)**: the full FatHippo experience with cloud sync across devices, cognitive traces & pattern extraction, skill synthesis, dashboard with receipts & analytics, plugin version management, and priority support.

---

## Quick Start: Interactive Installer (Recommended)

The fastest way to connect FatHippo to OpenClaw:

```bash
npx @fathippo/connect openclaw
```

The installer prompts you to choose your plan:

```
How do you want to use FatHippo?

  [1] Free (local-only) — memories stay on your machine, no account needed
  [2] Hosted ($4.99/mo) — cloud sync, cognitive features, cross-device memory

Choose [1/2]:
```

It handles plugin installation, configuration, and gateway restart automatically.

---

## Quick Start: Hosted OpenClaw (Manual)

If you prefer manual setup or need a locked-down environment:

```bash
# 1. Install the plugin
openclaw plugins install @fathippo/fathippo-context-engine

# 2. Set it as the active context engine
openclaw config set plugins.slots.contextEngine fathippo-context-engine

# 3. Configure hosted mode
openclaw config set plugins.entries.fathippo-context-engine.config.mode hosted
openclaw config set plugins.entries.fathippo-context-engine.config.apiKey mem_xxx
openclaw config set plugins.entries.fathippo-context-engine.config.baseUrl https://fathippo.ai/api
openclaw config set plugins.entries.fathippo-context-engine.config.injectCritical true

# 4. Restart the gateway
openclaw gateway restart
```

If you previously installed `@fathippo/context-engine`, reinstall from `@fathippo/fathippo-context-engine` on the OpenClaw machine so the published package name matches the plugin id OpenClaw discovers.

After that, FatHippo starts working automatically:

- relevant memory is injected each turn
- coding traces are captured after meaningful work
- patterns and skills are promoted from verified outcomes
- retrieval and workflow strategy adapt privately over time
- users see small "FatHippo helped" receipts when it materially contributed

---

## Quick Start: Local-Only OpenClaw (Manual)

If you want a fully private setup on the machine running OpenClaw:

```bash
# 1. Install the plugin
openclaw plugins install @fathippo/fathippo-context-engine

# 2. Set it as the active context engine
openclaw config set plugins.slots.contextEngine fathippo-context-engine

# 3. Force local-only mode
openclaw config set plugins.entries.fathippo-context-engine.config.mode local

# 4. Restart the gateway
openclaw gateway restart
```

Local-only mode keeps memory and lightweight learning private on-device, but it does not use hosted features like sync/imports, dashboard receipts, or hosted cognition.

OpenClaw guide: [docs/api/openclaw-integration.md](docs/api/openclaw-integration.md)

---

## Packages

This repo is split into installable package boundaries. These are developer/package surfaces, not separate end-user plans:

| Package | Purpose |
| --- | --- |
| `fathippo` | CLI — setup, store, search, init |
| `@fathippo/mcp-server` | MCP server for Claude Code, Cursor, Codex, etc. (13 tools) |
| `@fathippo/fathippo-context-engine` | OpenClaw plugin |
| `@fathippo/hosted` | Hosted sync and retrieval helpers |
| `@fathippo/local` | Local-first retrieval and cache |

There are also internal/supporting packages in this monorepo, including the web app, dashboards, examples, and test harnesses.

Example quickstarts live in [examples/README.md](examples/README.md):

- [examples/local-only.ts](examples/local-only.ts)
- [examples/hosted-hybrid.ts](examples/hosted-hybrid.ts)
- [examples/cognition-enabled.ts](examples/cognition-enabled.ts)

---

## MCP Tools

The MCP server (`@fathippo/mcp-server`) exposes 13 tools for any connected coding agent:

**Memory:** `start_session`, `build_context`, `record_turn`, `end_session`, `remember`, `recall`, `search`

**Cognitive:** `record_trace`, `get_cognitive_context`, `submit_feedback`, `get_skill_detail`, `create_skill`

- `get_skill_detail` — Load full skill content on demand (progressive disclosure)
- `create_skill` — Agent explicitly saves reusable skills (with guardrails)
- `submit_feedback` — Report whether a pattern or skill helped

---

### Security & Guardrails

- **Skill quarantine**: Agent-created skills start as `pending_review` — only surface in context after validation
- **Content scanning**: Skills are scanned for exfiltration patterns (curl pipes, suspicious URLs, eval/exec, base64 decode)
- **Rate limiting**: Max 3 agent-created skills per session
- **No system prompt modification**: Skills inject as context suggestions, never as instructions
- **Encryption**: AES-256-GCM at rest, frequency-based anonymization for shared patterns

---

### Intelligent Learning

- **6 trace types**: Automatically classifies traces as coding, debugging, user corrections, knowledge gaps, best practices, or feature requests
- **User correction detection**: "No, that's wrong" and "Actually, it should be..." are captured as the highest-signal learning events
- **Recurrence tracking**: Patterns deduplicate via stable keys — recurrence count grows, confidence increases automatically
- **Prevention rules**: Patterns inject as concise DO/DON'T rules, not verbose docs
- **Progressive disclosure**: Only skill summaries in context (~100 tokens each) — full content loaded on demand
- **Cross-linking**: Related patterns reference each other via "see also"

---

## Hosted Capabilities

The hosted FatHippo stack in this repo includes:

- encrypted memory storage
- hybrid retrieval
- edge-first retrieval rollout
- sync queue, retry, and dead-letter handling
- cognition APIs for traces, patterns, skills, and constraints
- benchmark and evaluation plumbing
- admin and cognitive dashboards
- privacy controls for export, deletion, retention, and sharing

The primary hosted surface for OpenClaw users is still the context engine plugin.

---

## Privacy Model

FatHippo is privacy-first, but it is not a zero-knowledge system.

Current principles:

- raw traces remain user-scoped
- shared learning is opt-in
- shared/global learning uses redacted, coarsened, aggregated artifacts
- stable user/session-linked shared signatures are avoided
- cognitive data can be exported and deleted
- retention controls exist for raw traces
- API keys and admin paths are scoped and audited

Important nuance:

- shared learning is more privacy-safe and less linkable than before
- it should not be described as fully anonymous without additional legal and technical review

---

## What Users See

Users do not need to babysit FatHippo.

They should mainly notice:

- Their agent already knows what to try on repeated issues
- The suggested workflow is better than before
- Fewer retries are needed on familiar bug classes
- Skill detail pages where they can view and edit synthesized skills
- Manual feedback on patterns (did this help? yes/no)
- Impact stats: success rates, usage counts, verification pass rates
- Clean trace display showing real coding problems solved
- The dashboard shows short "FatHippo helped" receipts

That means the product stays low-friction while still making the value legible.

---

## Development

### Prerequisites

- Node.js 20+
- npm 10+
- the environment variables needed for your chosen app mode

### Install

```bash
git clone https://github.com/jscianna/fathippo.git
cd fathippo
npm install
```

### Useful Commands

```bash
npm run dev
npm run build
npm run build:packages
./node_modules/.bin/tsc --noEmit
npm run check:cognitive-launch
npm run check:examples
```

### Workspace Layout

```text
src/                    Next.js app and hosted APIs
packages/context-engine OpenClaw plugin
packages/local          Local retrieval/cache helpers
packages/hosted         Hosted sync and retrieval helpers
packages/cognition      Cognitive substrate package surface
packages/cognitive-engine
                        Eval harness, tests, and cognition support code
examples/               Package quickstarts
docs/                   Product, API, operations, and rollout docs
```

---

## Documentation

- OpenClaw integration: [docs/api/openclaw-integration.md](docs/api/openclaw-integration.md)
- OpenClaw guide page: [src/app/docs/guides/openclaw/page.tsx](src/app/docs/guides/openclaw/page.tsx)
- Package examples: [examples/README.md](examples/README.md)
- Production launch runbook: [docs/PRODUCTION-LAUNCH-RUNBOOK.md](docs/PRODUCTION-LAUNCH-RUNBOOK.md)
- Cognitive strategy: [docs/COGNITIVE-SUBSTRATE-STRATEGY.md](docs/COGNITIVE-SUBSTRATE-STRATEGY.md)

---

## Contributing

```bash
npm install
npm run build:packages
npm run check:cognitive-launch
```

Keep changes scoped, prefer primary source docs, and avoid changing unrelated product behavior.
