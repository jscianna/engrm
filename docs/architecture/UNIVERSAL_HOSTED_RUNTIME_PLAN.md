# Universal Hosted Runtime Plan

## Recommendation

Yes: if the goal is one shared memory system across OpenClaw, Claude, and Codex, a single hosted version is much cleaner than trying to make local-first the primary universal path.

Hosted-first gives you:

- one identity model
- one source of truth for memories, traces, and injections
- one session lifecycle across runtimes
- no filesystem-sharing tricks between tools
- no per-runtime local profile drift
- clearer product messaging

Local can still exist, but it should be treated as a development mode, fallback mode, or private single-runtime mode, not the main universal-memory architecture.

## Why Hosted-First Wins

### What gets simpler

1. **Cross-runtime continuity**
   OpenClaw, Claude, and Codex can all read and write the same account-backed memory graph.

2. **Context injection**
   Each runtime adapter can call the same hosted lifecycle instead of reimplementing retrieval and ranking logic locally.

3. **Cognition features**
   Shared traces, patterns, workflows, and future skill synthesis only really compound if they land in one shared backend.

4. **Support and analytics**
   You can debug one hosted path instead of figuring out whether the problem lives in OpenClaw local storage, Claude local storage, or Codex local storage.

5. **Packaging**
   The repo can stay monorepo-based while publishing multiple thin adapters over one hosted SDK.

### What stays hard even with hosted

- runtime-specific hook points still differ
- some runtimes allow automatic injection, some mostly allow tools
- session identity has to be mapped carefully so memories do not fragment across installs and workspaces

Those are adapter problems, not storage problems.

## Proposed Package Split

Keep this in the same repo.

### Shared hosted layer

- `packages/hosted`
  This becomes the universal runtime SDK.
  It should own:
  - hosted HTTP client
  - normalized session lifecycle
  - memory/search helpers
  - common response formatting for prompt injection
  - runtime metadata headers

### Thin runtime adapters

- `packages/context-engine`
  OpenClaw adapter only.
  It should become a thin wrapper around `@fathippo/hosted` plus OpenClaw-specific hooks.

- `packages/mcp-server`
  Tool surface for MCP clients such as Claude Desktop, Cursor, and other MCP-compatible tools.
  This is useful even if some runtimes cannot support full automatic injection.

- Future `packages/claude-adapter`
  Thin Claude-specific wrapper around `@fathippo/hosted`.

- Future `packages/codex-adapter`
  Thin Codex-specific wrapper around `@fathippo/hosted`.

### Local mode

- `packages/local`
  Keep it, but reposition it as:
  - private local mode
  - offline/dev mode
  - fallback mode when hosted is unavailable

It should not be the primary contract for universal memory.

## First Adapter Contract

The first shared contract should match the lifecycle you already expose on the server:

1. `startSession`
   Maps to `POST /api/v1/sessions/start`

2. `buildContext`
   Maps to `POST /api/v1/simple/context`

3. `recordTurn`
   Maps to `POST /api/v1/sessions/{id}/turn`

4. `remember`
   Maps to `POST /api/v1/simple/remember`

5. `search`
   Maps to `POST /api/v1/search`

6. `endSession`
   Maps to `POST /api/v1/sessions/{id}/end`

That gives every runtime one normalized memory lifecycle even if the runtime itself has different hooks.

## Runtime Lifecycle

### Automatic runtimes

For runtimes with hookable lifecycles:

1. Start session
2. Build initial context
3. Inject system/context block
4. Record turns as the conversation progresses
5. Refresh context when the hosted service says to refresh
6. End session and reinforce useful memories

### Tool-first runtimes

For runtimes that mostly expose tools:

1. Use `remember`
2. Use `search`
3. Optionally call `buildContext` before a major answer
4. Optionally call `startSession` and `recordTurn` if the runtime exposes enough structure

## Rollout Plan

### Phase 1

- move universal hosted lifecycle into `@fathippo/hosted`
- make OpenClaw consume that shared lifecycle
- keep behavior unchanged

### Phase 2

- upgrade `@fathippo/mcp-server` to use the shared hosted client
- expose `remember`, `search`, and `buildContext`

### Phase 3

- add Claude adapter
- add Codex adapter
- standardize runtime metadata headers for analytics and debugging

### Phase 4

- move cognition retrieval behind the same hosted lifecycle so learned patterns can be injected regardless of runtime

## Product Direction

If the product goal is “universal memory,” the cleanest story is:

- one hosted memory product
- one premium cognition layer on top of hosted
- local kept as optional fallback/dev mode

Not:

- three equally important storage modes
- separate product logic per runtime
- separate retrieval behavior per tool

## Practical Conclusion

You do **not** need a separate repo.

You **do** want:

- one hosted SDK
- thin runtime adapters
- one shared lifecycle contract
- local treated as optional, not primary

That is the cleanest path to universal memory across OpenClaw, Claude, and Codex.
