---
name: fathippo
description: Cross-agent memory — recall and store insights that persist across sessions and platforms
version: 0.2.1
metadata:
  hermes:
    tags: [memory, context, recall]
    category: memory
    requires_tools: [fathippo_recall]
---

# FatHippo — Cross-Agent Memory

## When to Use
- **Session start:** Call `fathippo_recall` or `fathippo_context` to warm context with relevant memories
- **Before answering questions** about prior work, decisions, preferences, people, or project history
- **After important decisions:** Call `fathippo_remember` to persist insights for future sessions
- **After corrections:** When the user corrects you, store the correction so you don't repeat the mistake

## Procedure

### Recall (search memories)
```
fathippo_recall(query="what architecture did we decide on for auth?")
```
Returns ranked memories with relevance scores. Use natural language queries.

### Context (auto-match)
```
fathippo_context(message="<the user's current message>")
```
Lighter weight — returns pre-ranked context for the current conversation. Good for session start.

### Remember (store insights)
```
fathippo_remember(text="User prefers early returns and snake_case. Hates verbose error messages.")
```
Store **synthesized insights**, not raw transcripts. Distill what matters.

## What to Remember
- User preferences and corrections
- Architecture decisions and rationale
- Project context (stack, repo structure, conventions)
- Lessons learned from debugging sessions
- People, relationships, and communication preferences

## What NOT to Remember
- Raw conversation transcripts (too noisy)
- Temporary debugging output
- Secrets, API keys, or credentials
- Information the user explicitly asks you to forget

## Pitfalls
- Don't call `fathippo_recall` on every single message — use it when context would genuinely help
- Don't store trivial preferences ("user said hi") — only insights that improve future sessions
- Memories work across ALL connected platforms — anything stored here is available in Cursor, Claude Code, OpenClaw, etc.

## Verification
After storing: "Noted — I'll remember that across all your sessions."
After recalling: Use the retrieved context naturally, don't dump raw memory output to the user.
