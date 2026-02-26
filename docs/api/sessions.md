# Sessions API

## Create session

`POST /api/v1/sessions`

```json
{
  "namespace": "support-agent",
  "metadata": {"channel": "chat", "ticket": "TKT-91"}
}
```

## List sessions

`GET /api/v1/sessions?namespace=support-agent`

## Add memory to session

`POST /api/v1/sessions/:sessionId/memories`

```json
{
  "text": "Asked user to restart the SDK process.",
  "metadata": {"role": "assistant"}
}
```

## Get session memories

`GET /api/v1/sessions/:sessionId/memories`

Memories are returned in chronological order.

## Get session context

Use the namespace tied to the session with `POST /api/v1/context` for LLM-ready context assembly.
