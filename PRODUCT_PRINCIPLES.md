# FatHippo Product Principles

## Laws (non-negotiable)

**Privacy is sacred.**
User data is encrypted with per-user keys. Only the user and their agents can read it. Not us. Not our database provider. Not anyone.

**Never make agents worse.**
If FatHippo doesn't improve the agent's response, it shouldn't inject anything. Silence beats noise.

**Credentials stay in the vault.**
Secrets are never returned to agent APIs. Period.

## Guidelines (strong defaults, flexible when needed)

**Save tokens, get better results.**
The best memory is the one that makes a response better with fewer tokens than re-explaining would take. But if more context genuinely helps, use it.

**Relevance over recency.**
Old memories that matter beat recent memories that don't. Let relevance earn the context window.

**Latency is a trade-off, not a sin.**
Users will wait a beat longer for meaningfully better results. Don't sacrifice quality for speed—but don't waste time either.

**Automagical > configurable.**
The best experience requires zero setup. Knobs and toggles are admissions of failure to get the defaults right.

## The Test

Before shipping anything, ask:

*Does this make an agent smarter without making it slower, more expensive, or less private?*

If yes, ship it. If no, keep iterating.
