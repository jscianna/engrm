# Codebase Profiler ("Codebase DNA") — Feature Plan

> **Status:** Draft  
> **Author:** Vex (subagent: profiler-plan)  
> **Date:** 2026-03-15  
> **Target:** FatHippo Context Engine + Hosted API

---

## Overview

When a user connects FatHippo to their coding agent (via OpenClaw), FatHippo profiles their codebase and creates a compact **Codebase DNA** — a structured summary of tech stack, architecture, hotspots, conventions, and dependency topology. This profile is injected into every agent session from day 1, so the agent immediately has project-native awareness without the user having to explain their codebase.

**Key constraint:** The serialized profile must be **under 2,000 tokens** when injected into a system prompt.

---

## 1. Data Model

### 1.1 Profile JSON Schema

```typescript
interface CodebaseProfile {
  version: 1;
  generatedAt: string;          // ISO timestamp
  generatedFromCommit?: string;  // git HEAD SHA at profile time
  workspaceRoot: string;         // absolute path (local only; stripped for hosted)

  // === FREE DATA (no LLM cost) ===
  techStack: {
    languages: Array<{ name: string; percentage: number }>;  // e.g. [{name:"typescript", percentage:72}]
    frameworks: string[];         // e.g. ["next.js", "react", "tailwind"]
    runtime: string;              // e.g. "node 20", "python 3.12", "go 1.22"
    packageManager: string;       // e.g. "pnpm", "pip", "cargo"
    buildTools: string[];         // e.g. ["turbo", "vite", "webpack"]
    testing: string[];            // e.g. ["vitest", "jest", "pytest"]
    database: string[];           // e.g. ["turso/libsql", "postgres"]
    deployment: string[];         // e.g. ["vercel", "docker", "railway"]
  };

  structure: {
    type: "monorepo" | "single" | "workspace";
    entryPoints: string[];        // e.g. ["src/app/", "packages/context-engine/"]
    workspaces?: string[];        // monorepo workspace names
    totalFiles: number;
    totalDirectories: number;
    fileTreeSummary: string;      // compact tree (top 2 levels, max 40 lines)
  };

  hotspots: Array<{
    path: string;
    reason: "most-changed" | "largest" | "most-imported" | "entry-point";
    metric?: number;              // e.g. commit count, LOC, import count
  }>;                             // top 10-15 files

  dependencies: {
    topDirect: string[];          // top 10 direct deps by import frequency
    peerProjects?: string[];      // monorepo cross-package deps
  };

  git: {
    totalCommits: number;
    activeContributors: number;   // last 90 days
    mostActiveDirectories: string[];  // top 5 dirs by recent commits
    branchingModel?: string;      // "trunk" | "gitflow" | "unknown"
  };

  // === LLM-SUMMARIZED DATA (costs tokens) ===
  architecture: {
    summary: string;              // 2-3 sentence architectural overview
    patterns: string[];           // e.g. ["app-router", "server-components", "api-routes", "monorepo-packages"]
    conventions: string[];        // e.g. ["barrel exports", "collocated tests", "kebab-case files"]
  };
}
```

### 1.2 Token Budget Breakdown

| Section | Target Tokens | Notes |
|---------|--------------|-------|
| `techStack` | ~200 | Mostly short strings |
| `structure` | ~250 | Tree summary is the bulk |
| `hotspots` | ~200 | 10-15 entries |
| `dependencies` | ~100 | Top 10 deps |
| `git` | ~100 | Numeric stats |
| `architecture` | ~400 | LLM summary — this is the expensive/valuable part |
| Formatting overhead | ~150 | Markdown headers, bullets |
| **Total** | **~1,400** | Safely under 2,000 |

### 1.3 Serialized Injection Format

```markdown
## Codebase DNA
**Stack:** TypeScript (72%), Next.js 15, React 19, Tailwind, pnpm, Turbo
**Runtime:** Node 20 · **DB:** Turso/libsql · **Deploy:** Vercel
**Structure:** Monorepo (5 workspaces) · 847 files
**Architecture:** App Router with server components. API routes at src/app/api/. 
Monorepo packages for context-engine, hosted client, local store, CLI, and MCP server.
Uses barrel exports, collocated tests, kebab-case filenames.

**Hotspot files:**
- src/lib/cognitive-db.ts (most changed, 1.2k LOC)
- packages/context-engine/src/engine.ts (core engine, 580 LOC)
- src/app/api/v1/cognitive/traces/relevant/route.ts (high churn)

**Key deps:** @libsql/client, openclaw/plugin-sdk, ai (vercel), stripe, drizzle-orm
**Git:** 1,247 commits · 3 active contributors · trunk-based
```

---

## 2. Trigger Mechanism

### 2.1 When Profiling Runs

**Primary trigger — on `bootstrap()`:**

In `FatHippoContextEngine.bootstrap()`, after `detectWorkspaceRoot()` resolves a workspace path:

1. Check if a profile exists for this `workspaceRoot` (local: file on disk; hosted: API lookup).
2. If **no profile exists** → trigger profiling asynchronously (don't block bootstrap).
3. If **profile exists but stale** (see §6 Incremental Updates) → schedule background re-profile.

```typescript
// In engine.ts bootstrap(), after workspaceRoot is detected:
const profile = await this.getCodebaseProfile(workspaceRoot);
if (!profile) {
  // Fire-and-forget: profile in background, next assemble() will pick it up
  this.profileCodebaseAsync(workspaceRoot, params.sessionId).catch(console.error);
} else if (this.isProfileStale(profile, workspaceRoot)) {
  this.updateProfileAsync(profile, workspaceRoot, params.sessionId).catch(console.error);
}
```

**Secondary trigger — CLI command:**

```bash
fathippo profile [path]           # Generate/regenerate profile
fathippo profile --show           # Print current profile
fathippo profile --force          # Force full rescan
```

### 2.2 Detection: "Fresh Install, No Profile Yet"

**Local mode:** Check for `.fathippo/codebase-profile.json` in the workspace root. If missing → fresh.

**Hosted mode:** On `startSession()`, pass `workspaceRoot` in runtime metadata (already done via `buildHostedRuntimeMetadata()`). The hosted API checks if a profile exists for this `(userId, workspaceId)` pair. The `FatHippoSessionStartOutput` gains a new field:

```typescript
interface FatHippoSessionStartOutput {
  // ... existing fields ...
  codebaseProfile?: CodebaseProfile | null;  // null = no profile yet
  profileStale?: boolean;
}
```

---

## 3. Execution: Data Gathering

### 3.1 Phase 1: Free Data (No LLM)

All of these run locally via the context engine or CLI. **Zero token cost.**

| Data | Method | Command / API |
|------|--------|---------------|
| Language breakdown | File extension counting + LOC (via `tokei` or custom walker) | Walk file tree, count by extension |
| Frameworks | Parse `package.json` (deps), `requirements.txt`, `Cargo.toml`, `go.mod` | Read config files |
| Build tools | Detect `turbo.json`, `vite.config`, `webpack.config`, `tsconfig.json` | Check marker files |
| Testing | Detect `vitest.config`, `jest.config`, `pytest.ini`, `Cargo.toml [dev-deps]` | Check marker files |
| Database | Grep deps for `@libsql`, `pg`, `prisma`, `drizzle`, `mongoose`, `sqlalchemy` | Parse dep files |
| Deployment | Detect `vercel.json`, `Dockerfile`, `fly.toml`, `railway.json`, `.github/workflows` | Check marker files |
| Package manager | Detect `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `bun.lockb` | Check lock files |
| Structure type | Detect `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json` | Check workspace configs |
| File tree summary | Walk tree, skip `.git`, `node_modules`, `dist`, `build`, `.next` | Custom walker with depth limit |
| Hotspots (git) | `git log --format='' --name-only \| sort \| uniq -c \| sort -rn \| head -20` | Git CLI |
| Hotspots (size) | Sort files by LOC | File walker |
| Hotspots (imports) | Grep for `import` / `require` and count per-file references | Simple regex scan |
| Git stats | `git rev-list --count HEAD`, `git shortlog -sn --since="90 days ago"` | Git CLI |
| Top dependencies | Parse `package.json` dependencies, `requirements.txt`, etc. | Parse dep files |
| Import graph | Scan `import`/`require`/`from` statements, build adjacency map | Regex-based scanner |

**Estimated execution time:** 2-8 seconds for a typical repo (1-5k files).

### 3.2 Phase 2: LLM Summarization (Costs Tokens)

After gathering all raw data, send **one single prompt** to the LLM to generate the `architecture` section:

```
Given the following codebase analysis, provide:
1. A 2-3 sentence architectural summary
2. A list of architectural patterns used (e.g., "app-router", "microservices", "event-driven")
3. A list of coding conventions (e.g., "barrel exports", "collocated tests", "kebab-case files")

Tech Stack: [techStack JSON]
File Tree (top 2 levels): [fileTreeSummary]
Hotspot Files: [hotspots list]
Top Dependencies: [deps list]
Sample import patterns from top 5 files: [import snippets]
```

**Estimated token cost:**

| | Tokens |
|---|--------|
| Input (raw data summary) | ~2,000-3,000 |
| Output (architecture section) | ~300-500 |
| **Total per profile** | **~2,500-3,500 tokens** |
| **Cost at Claude Sonnet pricing** | **~$0.01-0.02** |

This is a one-time cost per codebase (amortized over all future sessions).

### 3.3 Minimizing Token Cost

1. **Raw data first:** Gather everything we can without an LLM. This forms ~70% of the profile.
2. **Single prompt:** One summarization call, not multiple. Pass all raw data as context.
3. **Cache aggressively:** Profile is stored and reused across all sessions.
4. **Skip LLM if user opts out:** The profile is still useful with just free data. Architecture section becomes "Not yet analyzed — run `fathippo profile --analyze` to generate."
5. **Use cheapest capable model:** Haiku/Flash tier is sufficient for summarization.

---

## 4. Storage

### 4.1 Local Storage

**Path:** `{workspaceRoot}/.fathippo/codebase-profile.json`

- Stored alongside the workspace (like `.git/`).
- Gitignored by default — add `.fathippo/` to `.gitignore` on first profile.
- Alternative for users who don't want a dotfile: `~/.fathippo/profiles/{workspace-hash}.json`

**Local mode profile lookup** in `FatHippoContextEngine`:

```typescript
private getLocalProfilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.fathippo', 'codebase-profile.json');
}

private async getLocalCodebaseProfile(workspaceRoot: string): Promise<CodebaseProfile | null> {
  const profilePath = this.getLocalProfilePath(workspaceRoot);
  if (!existsSync(profilePath)) return null;
  return JSON.parse(await readFile(profilePath, 'utf-8'));
}
```

### 4.2 Hosted Storage

**New API endpoints:**

```
GET  /api/v1/codebase/profile?workspaceId={id}
POST /api/v1/codebase/profile
PUT  /api/v1/codebase/profile/{profileId}
```

**Request/Response:**

```typescript
// POST /api/v1/codebase/profile
interface StoreProfileRequest {
  workspaceId: string;     // derived from workspaceRoot
  profile: CodebaseProfile;
}

// GET /api/v1/codebase/profile?workspaceId={id}
interface GetProfileResponse {
  profile: CodebaseProfile | null;
  stale: boolean;
  lastUpdatedAt: string;
}
```

### 4.3 Turso Schema

```sql
CREATE TABLE IF NOT EXISTS codebase_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,          -- normalized workspace identifier
  workspace_root TEXT,                  -- original path (for display only)
  profile_json TEXT NOT NULL,           -- full CodebaseProfile JSON
  profile_version INTEGER NOT NULL DEFAULT 1,
  commit_sha TEXT,                      -- git HEAD at profile time
  file_hash TEXT,                       -- hash of file tree structure for staleness
  token_count INTEGER,                  -- estimated tokens when serialized
  llm_summarized INTEGER NOT NULL DEFAULT 0,  -- whether architecture section used LLM
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  
  UNIQUE(user_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_codebase_profiles_user 
  ON codebase_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_codebase_profiles_workspace 
  ON codebase_profiles(user_id, workspace_id);
```

**Why `workspace_id` and not `workspaceRoot`?**

`workspaceRoot` is an absolute path that differs between machines. `workspace_id` is a stable identifier derived from:
- The git remote URL (preferred): `github.com/user/repo` → `gh:user/repo`
- Fallback: hash of the workspace root basename + top-level structure signature

This ensures the same repo profiled on two machines shares one hosted profile.

### 4.4 Adding to `cognitive-db.ts`

The `codebase_profiles` table follows the same pattern as `coding_traces`, `cognitive_patterns`, etc. in `src/lib/cognitive-db.ts`:

```typescript
// Add to ensureInitialized() in cognitive-db.ts
await client.executeMultiple(`
  CREATE TABLE IF NOT EXISTS codebase_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    workspace_root TEXT,
    profile_json TEXT NOT NULL,
    profile_version INTEGER NOT NULL DEFAULT 1,
    commit_sha TEXT,
    file_hash TEXT,
    token_count INTEGER,
    llm_summarized INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Add unique index
await client.execute(
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_codebase_profiles_user_workspace 
   ON codebase_profiles(user_id, workspace_id)`
).catch(() => {});
```

---

## 5. Context Injection

### 5.1 Integration with `assemble()`

In `FatHippoContextEngine.assemble()`, the profile is injected as a new section in `systemPromptAddition`. It slots in **before** memories and traces but **after** runtime awareness:

```typescript
// In assemble() — both hosted and local paths:
async assemble(params) {
  const runtimeAwareness = this.buildRuntimeAwarenessInstruction();
  const workspaceRoot = this.hostedSessions.get(params.sessionId)?.workspaceRoot;
  
  // NEW: Get codebase profile
  const profileBlock = workspaceRoot 
    ? await this.getCodebaseProfileBlock(workspaceRoot) 
    : "";
  
  // ... existing memory/cognitive retrieval ...
  
  const fullContext = this.fitContextToBudget({
    sections: [
      runtimeAwareness,
      profileBlock,        // NEW — injected early for high priority
      workflowBlock,
      patternBlock,
      memoryBlock,
      indexedContext,
      hippoNodInstruction,
    ],
    contextBudget: ...,
  });
}
```

### 5.2 Injection Format

The `getCodebaseProfileBlock()` method serializes the profile into compact markdown:

```typescript
private async getCodebaseProfileBlock(workspaceRoot: string): Promise<string> {
  const profile = await this.getCodebaseProfile(workspaceRoot);
  if (!profile) return "";
  
  return formatCodebaseProfileForInjection(profile);
}
```

The format is the compact markdown shown in §1.3 — structured, scannable, token-efficient.

### 5.3 Token Budget Management

The `fitContextToBudget()` method (already in `engine.ts`) handles priority-based truncation. Profile gets **second priority** after runtime awareness:

| Priority | Section | Max Tokens | Rationale |
|----------|---------|-----------|-----------|
| 1 | Runtime awareness | ~80 | Always present, tiny |
| 2 | **Codebase Profile** | **~1,400** | **Static, high-value, rarely changes** |
| 3 | Workflow recommendation | ~300 | Specific to current problem |
| 4 | Learned patterns | ~400 | Specific to current problem |
| 5 | Memories | ~800 | Relevant context |
| 6 | Indexed memory | ~300 | Summaries |
| 7 | Hippo nod | ~100 | Optional |

**If budget is tight** (small context window), the profile compresses well:
- Drop `fileTreeSummary` first (saves ~200 tokens)
- Drop `hotspots` detail (saves ~150 tokens)
- Drop `git` stats (saves ~100 tokens)
- Minimum viable profile: stack + architecture summary (~500 tokens)

### 5.4 Hosted Mode: Profile in `buildContext()`

For hosted mode, `FatHippoHostedRuntimeClient.buildContext()` already sends `workspaceRoot` in runtime headers. The hosted API can include the profile in the `systemPromptAddition` response:

```typescript
// In runtime-adapter.ts buildContext():
// The hosted API retrieves the stored profile and includes it in the response
// No client-side change needed — the profile comes back as part of context
```

---

## 6. Incremental Updates

### 6.1 Staleness Detection

**Git-based (preferred):**
```typescript
private isProfileStale(profile: CodebaseProfile, workspaceRoot: string): boolean {
  if (!profile.generatedFromCommit) return true;
  
  // Check commits since profile was generated
  const commitsSince = execSync(
    `git -C "${workspaceRoot}" rev-list --count ${profile.generatedFromCommit}..HEAD`,
    { encoding: 'utf-8' }
  ).trim();
  
  return parseInt(commitsSince, 10) > STALE_COMMIT_THRESHOLD; // default: 50
}
```

**File hash fallback (no git):**
```typescript
// Hash the sorted list of file paths + sizes
const fileHash = hashFileTree(workspaceRoot);
return fileHash !== profile.fileHash;
```

### 6.2 When to Re-Profile

| Trigger | Action | Cost |
|---------|--------|------|
| `bootstrap()` detects >50 new commits | Background re-profile | Free data + optional LLM |
| `bootstrap()` detects file hash mismatch | Background re-profile | Free data only |
| User runs `fathippo profile --force` | Full rescan | Free data + LLM |
| Heartbeat detects workspace changed | Mark profile stale | Free |
| Every 7 days (if active sessions) | Background re-profile | Free data + optional LLM |

### 6.3 Partial vs Full Updates

**Partial update (fast, free):**
- Re-scan file tree, re-count languages, re-detect deps
- Update git stats
- Re-compute hotspots from `git log`
- Keep existing `architecture` section
- Takes 1-3 seconds

**Full rescan (includes LLM):**
- Everything above, plus re-generate `architecture` summary
- Triggered only on major structural changes (new framework, new workspace, >100 commits)
- Detection: compare `techStack.frameworks` and `structure.workspaces` — if changed, full rescan

```typescript
private needsFullRescan(old: CodebaseProfile, current: Partial<CodebaseProfile>): boolean {
  const frameworksChanged = JSON.stringify(old.techStack.frameworks.sort()) 
    !== JSON.stringify(current.techStack?.frameworks?.sort());
  const workspacesChanged = JSON.stringify(old.structure.workspaces?.sort())
    !== JSON.stringify(current.structure?.workspaces?.sort());
  const languageShift = old.techStack.languages[0]?.name 
    !== current.techStack?.languages?.[0]?.name;
  
  return frameworksChanged || workspacesChanged || languageShift;
}
```

---

## 7. Edge Cases

### 7.1 Monorepos

**Strategy:** One profile per workspace root, with sub-workspace awareness.

- Detect monorepo via `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`
- Set `structure.type = "monorepo"` and populate `structure.workspaces`
- Hotspots are computed across the entire repo
- `workspaceId` uses the monorepo root, not individual packages

**Why not profile-per-workspace?**
- Agents typically work across packages in a monorepo
- Cross-package dependencies are important context
- One profile is simpler to manage and stays within token budget

### 7.2 Very Large Repos (>10k files)

**Sampling strategy:**

```typescript
const MAX_FILES_TO_SCAN = 5000;
const MAX_DEPTH = 4;  // for tree summary

private async scanLargeRepo(root: string): Promise<ScanResult> {
  // 1. Always scan: config files, entry points, package manifests
  // 2. Git-based sampling: files changed in last 6 months
  // 3. If still > MAX_FILES: prioritize by directory (src/ > test/ > docs/)
  // 4. Skip: generated code, vendor/, node_modules/, dist/, build/
}
```

**Ignore patterns (hardcoded + configurable):**
```
node_modules/, .git/, dist/, build/, .next/, __pycache__, 
.venv/, target/, vendor/, coverage/, .turbo/, .cache/
```

Users can add to `.fathippo/ignore` (same format as `.gitignore`).

### 7.3 No Git History (Fresh Repo)

- Skip git-based hotspots and git stats
- `git` section populated with `{ totalCommits: 0, activeContributors: 0, ... }`
- Hotspots fall back to file size and import frequency only
- Staleness detection uses file hash instead of commit count

### 7.4 Non-JS Projects

The profiler is **language-agnostic** by design:

| Language | Config Detection | Dep Parsing | Import Scanning |
|----------|-----------------|-------------|-----------------|
| Python | `pyproject.toml`, `setup.py`, `requirements.txt` | pip deps | `import`, `from X import` |
| Rust | `Cargo.toml` | cargo deps | `use`, `mod` |
| Go | `go.mod` | go deps | `import` |
| Java | `pom.xml`, `build.gradle` | maven/gradle deps | `import` |
| Ruby | `Gemfile` | bundler deps | `require` |
| C/C++ | `CMakeLists.txt`, `Makefile` | N/A | `#include` |

**Framework detection per language:**
- Python: `django`, `flask`, `fastapi`, `pytorch`, `tensorflow`
- Rust: `actix-web`, `tokio`, `rocket`, `bevy`
- Go: `gin`, `echo`, `fiber`, `cobra`

### 7.5 Mixed-Language Projects

If multiple languages detected, the profiler reports all of them with percentage breakdowns. The LLM summarization prompt includes all detected languages for accurate architecture description.

---

## 8. New Files Needed

### 8.1 Context Engine Package

```
packages/context-engine/src/
├── profiler/
│   ├── index.ts                    # Re-export barrel
│   ├── types.ts                    # CodebaseProfile, ProfileConfig, ScanResult types
│   ├── scanner.ts                  # File tree walker, language detection, dep parsing
│   ├── git-analysis.ts             # Git log analysis, hotspot detection, commit stats
│   ├── import-analysis.ts          # Import/require scanning, dependency graph
│   ├── framework-detection.ts      # Framework/tool detection from config files
│   ├── summarizer.ts               # LLM summarization of architecture (one prompt)
│   ├── serializer.ts               # Profile → compact markdown for injection
│   ├── staleness.ts                # Staleness detection, partial update logic
│   └── workspace-id.ts             # Stable workspace ID derivation from git remote / path
```

**Purpose of each file:**

| File | Purpose |
|------|---------|
| `types.ts` | `CodebaseProfile`, `ScanResult`, `ProfileConfig`, `ScanOptions` interfaces |
| `scanner.ts` | Walks file tree respecting ignore patterns, counts LOC per language, detects structure type |
| `git-analysis.ts` | Runs `git log`, `git shortlog`, `git rev-list` to extract hotspots and stats |
| `import-analysis.ts` | Regex-based import scanner for TS/JS/Python/Go/Rust, builds frequency map |
| `framework-detection.ts` | Checks marker files and deps to detect frameworks, build tools, testing, DB, deploy |
| `summarizer.ts` | Takes raw `ScanResult`, sends one LLM prompt, returns `architecture` section |
| `serializer.ts` | `formatCodebaseProfileForInjection(profile: CodebaseProfile): string` |
| `staleness.ts` | `isProfileStale(profile, workspaceRoot)`, `needsFullRescan(old, new)` |
| `workspace-id.ts` | `deriveWorkspaceId(workspaceRoot): string` — stable ID from git remote or path hash |

### 8.2 Hosted Package

```
packages/hosted/src/
├── profiler-client.ts              # API client methods for profile CRUD
```

**Methods added to `FatHippoClient`:**

```typescript
// In client.ts or profiler-client.ts
async getCodebaseProfile(workspaceId: string): Promise<CodebaseProfile | null>;
async storeCodebaseProfile(params: { workspaceId: string; profile: CodebaseProfile }): Promise<void>;
async updateCodebaseProfile(params: { workspaceId: string; profile: CodebaseProfile }): Promise<void>;
```

**Methods added to `FatHippoHostedRuntimeClient`:**

```typescript
// Profile included in startSession and buildContext responses
// No new methods needed — profile comes back in systemPromptAddition
```

### 8.3 API Routes

```
src/app/api/v1/codebase/
├── profile/
│   ├── route.ts                    # GET (retrieve) + POST (store)
│   └── [profileId]/
│       └── route.ts                # PUT (update) + DELETE
```

### 8.4 Database

```
src/lib/
├── codebase-profiles-db.ts         # CRUD functions for codebase_profiles table
```

**Functions:**

```typescript
export async function getCodebaseProfile(userId: string, workspaceId: string): Promise<CodebaseProfile | null>;
export async function storeCodebaseProfile(params: StoreProfileInput): Promise<{ id: string }>;
export async function updateCodebaseProfile(params: UpdateProfileInput): Promise<void>;
export async function deleteCodebaseProfile(userId: string, workspaceId: string): Promise<void>;
export async function listCodebaseProfiles(userId: string): Promise<CodebaseProfileSummary[]>;
```

### 8.5 CLI

```
packages/cli/src/commands/
├── profile.ts                      # `fathippo profile` command
```

### 8.6 Migration

No separate migration file needed — the table creation is handled in `cognitive-db.ts` `ensureInitialized()` with `CREATE TABLE IF NOT EXISTS`, following the existing pattern used by all other cognitive tables.

---

## 9. Implementation Order

### Phase 1: MVP (Week 1-2)

**Goal:** Profile generation + local storage + injection into `assemble()`.

1. **`profiler/types.ts`** — Define `CodebaseProfile` and supporting types
2. **`profiler/scanner.ts`** — File tree walker with ignore patterns, LOC counting
3. **`profiler/framework-detection.ts`** — Detect frameworks, build tools, testing, DB, deploy from marker files and deps
4. **`profiler/git-analysis.ts`** — Git stats, hotspot detection
5. **`profiler/import-analysis.ts`** — Import frequency scanning
6. **`profiler/workspace-id.ts`** — Stable workspace ID derivation
7. **`profiler/serializer.ts`** — `formatCodebaseProfileForInjection()`
8. **`profiler/index.ts`** — Main `profileCodebase(workspaceRoot, options)` function that orchestrates scanner + git + imports + framework detection
9. **Integration in `engine.ts`:**
   - Add `profileCodebaseAsync()` and `getCodebaseProfile()` methods to `FatHippoContextEngine`
   - Hook into `bootstrap()` for auto-profiling
   - Hook into `assemble()` for injection (using `fitContextToBudget`)
10. **Local storage:** Write/read `.fathippo/codebase-profile.json`
11. **Basic tests:** Profile generation for JS/TS repos

**MVP excludes:** LLM summarization, hosted storage, CLI, staleness detection.

**At MVP completion:** When a user starts their first session in a workspace, FatHippo automatically profiles the codebase (free data only) and injects it into all subsequent sessions. The `architecture` section says "Run `fathippo profile --analyze` for architectural analysis."

### Phase 2: LLM Summarization + Hosted Storage (Week 3-4)

1. **`profiler/summarizer.ts`** — LLM call for architecture section
2. **`profiler/staleness.ts`** — Staleness detection and partial updates
3. **`codebase-profiles-db.ts`** — Turso table + CRUD
4. **API routes:** `GET/POST /api/v1/codebase/profile`
5. **`profiler-client.ts`** — Hosted client methods
6. **Integration:** Hosted mode stores/retrieves profiles via API
7. **CLI:** `fathippo profile` command
8. **`buildContext()` integration:** Include profile in hosted context response

### Phase 3: Incremental Updates + Cross-Project Learning (Week 5-6)

1. **Incremental updates:**
   - Git commit-based staleness detection in `bootstrap()`
   - Partial updates (re-scan structure, keep architecture)
   - Full rescan trigger on framework/workspace changes
2. **Cross-project learning:**
   - When multiple workspaces share the same frameworks/patterns, surface commonalities
   - "Your other Next.js project uses X pattern — consider applying here"
   - Store patterns learned from profiles in `cognitive_patterns` with a new source type
3. **Dashboard:**
   - Profile viewer in FatHippo web dashboard
   - Edit/regenerate from UI
   - Profile diff view (what changed since last scan)
4. **Edge case hardening:**
   - Large repo sampling
   - Non-JS language support
   - Monorepo workspace filtering

---

## 10. Integration Points (Detailed)

### 10.1 Engine Constructor (`FatHippoContextEngine`)

New config field in `FatHippoConfig` (in `types.ts`):

```typescript
interface FatHippoConfig {
  // ... existing fields ...
  
  /** Enable codebase profiling. Default: true */
  codebaseProfilingEnabled?: boolean;
  /** Skip LLM summarization (free-data-only profile). Default: false */
  codebaseProfilingLLMDisabled?: boolean;
  /** Max token budget for profile in context. Default: 1400 */
  codebaseProfileTokenBudget?: number;
  /** Commits before profile is considered stale. Default: 50 */
  codebaseProfileStaleCommitThreshold?: number;
}
```

### 10.2 Session Maps

Add to the engine's session state:

```typescript
// In engine.ts class fields:
private sessionCodebaseProfiles: Map<string, CodebaseProfile | null> = new Map();
```

### 10.3 `buildContext()` (Hosted Runtime Adapter)

The hosted API's `buildContext` endpoint already returns `systemPromptAddition`. The profile is included there, so `FatHippoHostedRuntimeClient.buildContext()` needs no interface changes — the profile comes back as part of the text response.

The server-side `/api/v1/simple/context` (or a new `/api/v1/runtime/context`) looks up the profile by `(userId, workspaceId)` from the `X-Fathippo-Workspace-Id` header and prepends it to the context response.

### 10.4 Relationship to Existing Cognitive Features

- **Traces:** Profile's `techStack.languages` and `techStack.frameworks` can seed the `context.technologies` field in `StructuredTracePayload`, improving trace matching accuracy.
- **Patterns:** Profile data can be passed to `getRelevantCognitiveContext()` via the existing `context.repoProfile` parameter (already in the API).
- **Adaptive Policy:** The `buildAdaptivePolicyFeatures()` function already accepts `repoProfile` — the codebase profile becomes the canonical source for this.
- **Workspace ID:** The `deriveWorkspaceId()` function replaces ad-hoc `workspaceRoot` hashing used in `buildHostedRuntimeMetadata()`.

### 10.5 `dispose()` Cleanup

```typescript
async dispose(): Promise<void> {
  // ... existing cleanup ...
  this.sessionCodebaseProfiles.clear();
}
```

---

## 11. Security & Privacy Considerations

1. **No source code stored:** The profile contains structural metadata only — file paths, dependency names, stats. No actual source code, secrets, or file contents are stored.
2. **Path sanitization:** `workspaceRoot` absolute paths are stripped before hosted storage. Only the relative structure is kept.
3. **Git remote privacy:** If deriving `workspaceId` from git remote URL, private repo URLs are hashed, not stored as-is.
4. **LLM prompt safety:** The summarization prompt receives only structural data (file tree, dep names), never source code.
5. **User control:** Users can disable profiling via `codebaseProfilingEnabled: false` in config.
6. **Deletion:** Profiles are included in `exportCognitiveUserData()` and `deleteCognitiveUserData()` flows.

---

## 12. Metrics & Success Criteria

| Metric | Target |
|--------|--------|
| Profile generation time (free data) | < 5 seconds for repos < 5k files |
| Profile token count | < 2,000 tokens serialized |
| LLM summarization cost | < $0.02 per profile |
| First-session improvement | Agent asks fewer "what framework is this?" questions |
| Profile staleness lag | < 24 hours for active repos |
| Coverage | JS/TS repos fully supported at MVP; Python/Go/Rust in Phase 3 |

---

## Appendix A: Example Profile (This Repo — FatHippo)

```json
{
  "version": 1,
  "generatedAt": "2026-03-15T08:20:00Z",
  "generatedFromCommit": "abc1234",
  "workspaceRoot": "/Users/clawdaddy/clawd/projects/fathippo",
  "techStack": {
    "languages": [
      { "name": "typescript", "percentage": 89 },
      { "name": "javascript", "percentage": 6 },
      { "name": "sql", "percentage": 3 },
      { "name": "css", "percentage": 2 }
    ],
    "frameworks": ["next.js", "react", "tailwind"],
    "runtime": "node 20",
    "packageManager": "npm",
    "buildTools": ["turbo", "next"],
    "testing": ["vitest"],
    "database": ["turso/libsql"],
    "deployment": ["vercel"]
  },
  "structure": {
    "type": "monorepo",
    "entryPoints": ["src/app/", "packages/context-engine/src/"],
    "workspaces": ["cli", "cognition", "cognitive-engine", "connect", "context-engine", "hosted", "local", "mcp-server", "openclaw-plugin"],
    "totalFiles": 847,
    "totalDirectories": 142,
    "fileTreeSummary": "src/\n  app/\n    api/v1/ (26 route groups)\n    (dashboard)/ (5 pages)\n  lib/ (40+ modules)\npackages/\n  context-engine/src/ (engine, cognitive, utils)\n  hosted/src/ (client, runtime-adapter)\n  local/src/ (local store, search)\n  cli/src/ (commands)\n  ..."
  },
  "hotspots": [
    { "path": "src/lib/cognitive-db.ts", "reason": "most-changed", "metric": 187 },
    { "path": "packages/context-engine/src/engine.ts", "reason": "most-changed", "metric": 94 },
    { "path": "src/lib/cognitive-learning.ts", "reason": "largest", "metric": 2400 },
    { "path": "packages/hosted/src/runtime-adapter.ts", "reason": "most-changed", "metric": 71 }
  ],
  "dependencies": {
    "topDirect": ["@libsql/client", "next", "react", "ai", "stripe", "tailwindcss", "openclaw/plugin-sdk", "zod", "drizzle-orm"],
    "peerProjects": ["@fathippo/hosted", "@fathippo/local", "@fathippo/context-engine"]
  },
  "git": {
    "totalCommits": 1247,
    "activeContributors": 3,
    "mostActiveDirectories": ["src/lib/", "packages/context-engine/", "src/app/api/v1/cognitive/", "packages/hosted/", "packages/cognitive-engine/"],
    "branchingModel": "trunk"
  },
  "architecture": {
    "summary": "Next.js App Router application with a monorepo structure. Core logic lives in packages/ (context-engine for OpenClaw integration, hosted for API client, local for embedded storage). API routes under src/app/api/v1/ expose a cognitive learning system that captures coding traces, extracts patterns, and synthesizes reusable skills.",
    "patterns": ["app-router", "server-components", "api-routes", "monorepo-packages", "plugin-sdk", "cognitive-learning-loop", "event-sourced-traces"],
    "conventions": ["barrel exports", "collocated types", "kebab-case files", "exhaustive switch checks", "JSON-in-TEXT columns for flexibility"]
  }
}
```

## Appendix B: Injected Markdown (from above profile)

```markdown
## Codebase DNA
**Stack:** TypeScript (89%), Next.js, React, Tailwind · npm · Turbo
**Runtime:** Node 20 · **DB:** Turso/libsql · **Deploy:** Vercel · **Test:** Vitest
**Structure:** Monorepo (9 workspaces) · 847 files · 142 dirs
**Workspaces:** cli, cognition, cognitive-engine, connect, context-engine, hosted, local, mcp-server, openclaw-plugin

**Architecture:** Next.js App Router with monorepo packages. Core logic in packages/ (context-engine, hosted, local). API routes at src/app/api/v1/. Cognitive learning loop: traces → patterns → skills.
**Patterns:** app-router, server-components, api-routes, monorepo-packages, plugin-sdk, cognitive-learning-loop
**Conventions:** barrel exports, collocated types, kebab-case files, JSON-in-TEXT columns

**Hotspot files:**
- src/lib/cognitive-db.ts (187 commits, most changed)
- packages/context-engine/src/engine.ts (94 commits)
- src/lib/cognitive-learning.ts (2.4k LOC, largest)
- packages/hosted/src/runtime-adapter.ts (71 commits)

**Top deps:** @libsql/client, next, react, ai, stripe, openclaw/plugin-sdk, zod, drizzle-orm
**Cross-pkg:** @fathippo/hosted, @fathippo/local, @fathippo/context-engine
**Git:** 1,247 commits · 3 contributors · trunk-based · active: src/lib/, packages/context-engine/
```

Estimated tokens: ~450 (well under 2,000 budget).
