# Product Split Plan (Monorepo)

## Products
- **Local Hippo (OSS/free):** local-only context engine, no auth, no hosted dependency.
- **Hippo Hosted Context Engine (paid):** managed API, sync, premium retrieval.
- **Hippo Cognition (paid+):** hosted context + group learnings/governance.

## Package Map
- `packages/core` — shared types, scoring, filters, crypto interfaces.
- `packages/local` (`@fathippo/local`) — local capture/retrieval/cache/index.
- `packages/hosted` (`@fathippo/hosted`) — hosted SDK/client, sync, API adapters.
- `packages/cognition` (`@fathippo/cognition`) — org graph, pattern transfer, policy checks.
- `packages/context-engine` — OpenClaw integration glue.
- `apps/cloud-api` — hosted APIs.
- `apps/dashboard` — plan UX, org/admin, analytics.

## Feature Matrix
| Capability | Local | Hosted | Cognition |
|---|---:|---:|---:|
| Local capture/filter | ✅ | ✅ | ✅ |
| Local BM25/vector retrieval | ✅ | ✅ (edge cache) | ✅ |
| Hosted sync | ❌ | ✅ | ✅ |
| Premium rerank/HyDE at scale | ❌ | ✅ | ✅ |
| Team workspace | ❌ | ✅ | ✅ |
| Group learnings/pattern transfer | ❌ | ❌ | ✅ |
| Governance/policies | ❌ | ⚠️ basic | ✅ advanced |

## OSS vs Proprietary Boundary
- **Open-source:** `packages/local`, core local retrieval helpers, basic connectors.
- **Proprietary/private:** cognitive engine internals, pattern extraction strategy, group learning logic, hosted ranking policies.
- Keep cognitive engine code private and never publish to public repos.

## Migration Strategy
1. Stabilize interfaces in `packages/core`.
2. Move local-first pieces into `packages/local` (non-breaking wrappers in place).
3. Move hosted client logic into `packages/hosted`.
4. Add plan gating at API and dashboard level.
5. Add cognition package + org-scoped storage and policy layer.

## Distribution
- Users install one package (npm), not whole repo:
  - `npm i @fathippo/local`
  - `npm i @fathippo/hosted`
  - `npm i @fathippo/cognition`
- Monorepo remains internal dev structure.