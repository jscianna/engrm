<p align="center">
  <img src="https://raw.githubusercontent.com/jscianna/fathippo/main/public/hippo.png" alt="FatHippo" width="140" />
</p>

<h1 align="center">FatHippo</h1>

<p align="center">
  <strong>Private cognitive substrate for OpenClaw and AI coding agents.</strong><br/>
  Connect it once, then let your agent get better by the day.
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

## What FatHippo Is

FatHippo started as memory infrastructure. It is now a cognitive substrate for coding agents.

When connected to an existing OpenClaw install, FatHippo can:

- remember relevant project context across sessions
- capture coding traces from real work
- extract repeated fix patterns
- synthesize reusable skills
- learn better retrieval mixes over time
- learn better debugging workflows over time
- show lightweight proof that it helped, without interrupting the session

The goal is simple: install it once, then let your agent become more useful every week.

---

## Quick Start: Connect Your Existing OpenClaw

If you already use OpenClaw, this is the main setup path.

```bash
# 1. Install the plugin
openclaw plugins install @fathippo/fathippo-context-engine

# 2. Set it as the active context engine
openclaw config set plugins.slots.contextEngine=fathippo-context-engine

# 3. Configure hosted mode
openclaw config set plugins.entries.fathippo-context-engine.config.mode=hosted
openclaw config set plugins.entries.fathippo-context-engine.config.apiKey=mem_xxx
openclaw config set plugins.entries.fathippo-context-engine.config.baseUrl=https://fathippo.ai/api
openclaw config set plugins.entries.fathippo-context-engine.config.injectCritical=true

# 4. Restart the gateway
openclaw gateway restart
```

If you previously installed `@fathippo/context-engine`, reinstall from `@fathippo/fathippo-context-engine` on the OpenClaw machine so the published package name matches the plugin id OpenClaw discovers.

After that, FatHippo starts working automatically:

- relevant memory is injected each turn
- coding traces are captured after meaningful work
- patterns and skills are promoted from verified outcomes
- retrieval and workflow strategy adapt privately over time
- users see small “Fathippo helped” receipts when it materially contributed

OpenClaw guide: [docs/api/openclaw-integration.md](/Users/johnscianna/Desktop/FatHippo/docs/api/openclaw-integration.md)

---

## Better By The Day

FatHippo does not require end users to run RL hardware jobs.

Instead, it improves the agent with a safe private learning loop:

1. A real coding session happens.
2. FatHippo captures the problem, tools used, reasoning, verification, and outcome.
3. Repeated successful traces become patterns.
4. Strong patterns become reusable skills.
5. Future sessions get better retrieval, better workflow suggestions, and better context.

Today that learning loop includes:

- structured trace capture
- adaptive retrieval policy learning
- adaptive tool-workflow learning
- pattern promotion and decay
- skill synthesis
- benchmark and attribution plumbing
- lightweight in-product receipts so users notice the value

---

## Product Shape

FatHippo is designed to be:

- `silent by default` in the session itself
- `visible in hindsight` through receipts and dashboards
- `private by default` for raw traces and learning data
- `OpenClaw-first` for the easiest install path

The ideal experience is:

1. User already has OpenClaw
2. User connects FatHippo once
3. FatHippo quietly starts helping
4. The agent gets better on repeated bug classes and workflows
5. The user can see proof without having to manage training

---

## Packages

This repo is now split into installable package boundaries:

| Package | Purpose |
| --- | --- |
| `@fathippo/fathippo-context-engine` | OpenClaw plugin and easiest way to connect FatHippo |
| `@fathippo/local` | Local-first retrieval, cache, and edge helpers |
| `@fathippo/hosted` | Hosted sync and retrieval-upgrade helpers |
| `@fathippo/cognition` | Cognitive substrate APIs and learning helpers |

There are also internal/supporting packages in this monorepo, including the web app, dashboards, examples, and test harnesses.

Example quickstarts live in [examples/README.md](/Users/johnscianna/Desktop/FatHippo/examples/README.md):

- [examples/local-only.ts](/Users/johnscianna/Desktop/FatHippo/examples/local-only.ts)
- [examples/hosted-hybrid.ts](/Users/johnscianna/Desktop/FatHippo/examples/hosted-hybrid.ts)
- [examples/cognition-enabled.ts](/Users/johnscianna/Desktop/FatHippo/examples/cognition-enabled.ts)

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

- OpenClaw already knows what to try on repeated issues
- the suggested workflow is better than before
- fewer retries are needed on familiar bug classes
- the dashboard shows short “Fathippo helped” receipts

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

- OpenClaw integration: [docs/api/openclaw-integration.md](/Users/johnscianna/Desktop/FatHippo/docs/api/openclaw-integration.md)
- OpenClaw guide page: [src/app/docs/guides/openclaw/page.tsx](/Users/johnscianna/Desktop/FatHippo/src/app/docs/guides/openclaw/page.tsx)
- Package examples: [examples/README.md](/Users/johnscianna/Desktop/FatHippo/examples/README.md)
- Production launch runbook: [docs/PRODUCTION-LAUNCH-RUNBOOK.md](/Users/johnscianna/Desktop/FatHippo/docs/PRODUCTION-LAUNCH-RUNBOOK.md)
- Cognitive strategy: [docs/COGNITIVE-SUBSTRATE-STRATEGY.md](/Users/johnscianna/Desktop/FatHippo/docs/COGNITIVE-SUBSTRATE-STRATEGY.md)

---

## Contributing

```bash
npm install
npm run build:packages
npm run check:cognitive-launch
```

Keep changes scoped, prefer primary source docs, and avoid changing unrelated product behavior.
