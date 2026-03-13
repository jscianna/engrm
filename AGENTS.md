# FatHippo Knowledge Base

**Generated:** 2026-03-11  
**Stack:** TypeScript, Next.js 16, React 19, Tailwind v4  
**Purpose:** Persistent, encrypted memory infrastructure for AI agents

---

## OVERVIEW

FatHippo is OpenClaw's pluggable memory layer. It provides AI agents with persistent memory that survives sessions, with AES-256-GCM encryption at rest.

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
│   ├── engrm-mcp/        # MCP server - zero-knowledge memory ops
│   ├── cli/              # FatHippo CLI
│   ├── mcp-server/       # Additional MCP implementation
│   └── python-sdk/       # Python client SDK
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
| MCP server | `packages/engrm-mcp/` | Model Context Protocol interface |
| CLI tool | `packages/cli/` | Command-line interface |

---

## CONVENTIONS (THIS PROJECT)

### Non-Standard Structure
- **NO npm workspaces** despite monorepo layout - manual dependency management
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

1. **No workspace config** - Install deps in each package separately
2. **Cognitive engine is PRIVATE** - Do not commit strategy docs or proprietary algorithms
3. **Encryption required** - `ENCRYPTION_KEY` env var must be 32-byte hex
4. **Test coverage sparse** - Only cognitive-engine has tests (vitest)
5. **No CI/CD** - Deployment handled externally (Vercel)
