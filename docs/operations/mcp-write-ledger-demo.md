# MCP Write Ledger Demo (5 minutes)

Purpose: show deterministic memory filtering + auditable write decisions for MCP traffic.

## 1) Generate representative decisions (60s)

```bash
# accepted (durable decision)
curl -s -X POST "$BASE_URL/v1/simple/remember" \
  -H "Authorization: Bearer $FATHIPPO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"We decided to keep OAuth-only auth across all MCP clients.","runtime":"codex","platform":"mcp"}'

# rejected (transcript debris)
curl -s -X POST "$BASE_URL/v1/simple/remember" \
  -H "Authorization: Bearer $FATHIPPO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"conversation info (untrusted) sender (untrusted): codex message_id=123 mcp_runtime=codex"}'
```

## 2) Pull the decision ledger (60s)

```bash
curl -s "$BASE_URL/v1/audit/decisions?window=24h&mcp_only=true&limit=20" \
  -H "Authorization: Bearer $FATHIPPO_API_KEY" | jq
```

What to point out in output:
- `decisionTotals` (accepted/rejected split)
- `totals` by `reasonCode`
- each entry includes `policyCode`, `sourceType`, `memoryType`, `matchedRules`, `qualityScore`, and `mcpRelated`

## 3) MCP-tool view (90s)

From any MCP client with FatHippo server connected:
- Run tool: `get_write_ledger`
- Params: `{"window":"24h","mcpOnly":true,"limit":20}`

What to point out:
- Outcome Breakdown + Reason Breakdown
- per-row reason + policy + source + runtime + text preview

## 4) Deterministic filtering proof (90s)

Use this candidate in `remember` or auto-capture path:

```text
conversation info (untrusted)
sender (untrusted): codex
main agent should route this to telegram
message_id=123
session_key=abc
mcp_runtime=codex
We decided this should be the default policy forever.
```

Expected:
- write is **rejected**
- `policyCode = rejected_mcp_transcript_debris`
- `matchedRules` contains `mcp_transcript_debris_hard_deny`

## 5) Close (30s)

Summary line for demo:
- “We now block transcript debris deterministically, and every write decision is traceable with policy/rule-level audit metadata.”
