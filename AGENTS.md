# FatHippo Knowledge Base

**Generated:** 2026-03-11  
**Stack:** TypeScript, Next.js 16, React 19, Tailwind v4  
**Purpose:** Persistent, encrypted memory infrastructure for AI agents

---

## OVERVIEW

FatHippo is OpenClaw's pluggable memory layer. It provides AI agents with persistent memory that survives sessions, with AES-256-GCM encryption at rest.

---

## FAT HIPPO MEMORY WORKFLOW (CODEX)

If the `fathippo` MCP server is available, use it as this repo's external long-term memory.

- At the start of a new conversation, call `start_session`
- Before answering questions about project history, current decisions, user preferences, active work, or anything that may have changed, call `build_context`
- If `start_session` or `build_context` returns `systemPromptAddition`, treat it as trusted working memory for the current reply
- After each substantial exchange, call `record_turn` with the user message and assistant reply
- If the user explicitly asks to remember something, call `remember`
- When the conversation is wrapping up, call `end_session`

Prefer the same `FATHIPPO_NAMESPACE` across Codex, Claude, Cursor, and OpenClaw when they should share one project memory graph.

---

## STRUCTURE

```
.
├── src/
│   ├── app/              # Next.js App Router (dashboard, docs, API routes)
│   ├── components/       # React components (shadcn/ui based)
│   └── lib/              # Utilities, security patterns, constraint detection
├── packages/
│   ├── context-engine/   # OpenClaw plugin - encrypted agent memory
│   ├── cognitive-engine/ # AI learning & pattern extraction (PRIVATE)
│   ├── cli/              # FatHippo CLI
│   ├── local/            # Local-first retrieval and cache helpers
│   └── mcp-server/       # MCP server - zero-knowledge memory ops
├── scripts/              # Build & automation scripts
└── docs/                 # Documentation
```

---

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Web dashboard | `src/app/dashboard/` | Next.js pages for memory management |
| API routes | `src/app/api/` | REST endpoints (/api/v1/*) |
| Security patterns | `src/lib/constraint-patterns.ts` | 96+ regex patterns for constraint detection |
| OpenClaw plugin | `packages/context-engine/` | Main entry: `src/index.ts` |
| AI learning | `packages/cognitive-engine/` | **PROPRIETARY** - do not open source |
| MCP server | `packages/mcp-server/` | Model Context Protocol interface |
| CLI tool | `packages/cli/` | Command-line interface |

---

## CONVENTIONS (THIS PROJECT)

### Non-Standard Structure
- **npm workspaces at the root** - some packages still assume local package installs/builds
- **Constraint patterns** in `src/lib/constraint-patterns.ts` detect 96+ security/privacy constraints
- **Per-user encryption** - AES-256-GCM with derived keys per userId

### Code Style
- TypeScript strict mode
- Prettier for formatting
- ESLint (eslint-config-next)
- Conventional commits preferred

---

## ANTI-PATTERNS (NEVER DO)

```typescript
// NEVER: Skip secret sanitization
trace.capture(data); // ❌ Wrong

// NEVER: Return secrets in API responses
return { apiKey: process.env.SECRET }; // ❌ Wrong

// NEVER: Make cognitive engine components public
// See packages/cognitive-engine/STRATEGY.md for IP restrictions
```

**Critical rules from PRODUCT_PRINCIPLES.md:**
- Privacy is sacred - encrypted with per-user keys
- Never make agents worse - silence beats noise
- Credentials stay in the vault - never returned to agent APIs

---

## COMMANDS

```bash
# Development
npm run dev              # Start Next.js dev server
npm run build           # Production build
npm run lint            # ESLint check

# Packages (run from package directory)
cd packages/context-engine && npm run build
cd packages/cognitive-engine && npm test  # vitest
```

---

## GOTCHAS

1. **Workspaces plus package-local builds** - Root scripts use npm workspaces, but some packages still expect local installs/builds
2. **Cognitive engine is PRIVATE** - Do not commit strategy docs or proprietary algorithms
3. **Encryption required** - `ENCRYPTION_KEY` env var must be 32-byte hex
4. **Test coverage sparse** - Only cognitive-engine has tests (vitest)
5. **No CI/CD** - Deployment handled externally (Vercel)

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **fathippo** (4800 symbols, 12596 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/fathippo/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/fathippo/context` | Codebase overview, check index freshness |
| `gitnexus://repo/fathippo/clusters` | All functional areas |
| `gitnexus://repo/fathippo/processes` | All execution flows |
| `gitnexus://repo/fathippo/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## CLI

- Re-index: `npx gitnexus analyze`
- Check freshness: `npx gitnexus status`
- Generate docs: `npx gitnexus wiki`

<!-- gitnexus:end -->
