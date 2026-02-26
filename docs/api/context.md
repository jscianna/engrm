# Context API

`POST /api/v1/context`

```json
{
  "query": "What have we already tried for this outage?",
  "maxTokens": 1200,
  "namespace": "incident-bot"
}
```

## How context window works

The endpoint combines:

- Semantically relevant memories (vector similarity)
- Recent memories (recency fallback)

Then it prunes items to fit the token budget.

## Token budgeting

`maxTokens` controls context size. MEMRY uses a conservative token estimate to stay under budget.

## Relevance vs recency

Relevant memories are prioritized first; recent memories fill remaining space.
