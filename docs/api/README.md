# Engrm Agent API v1

Engrm's Agent API provides memory storage, retrieval, semantic search, context assembly, namespaces, and sessions for agent workflows.

Base path: `/api/v1`

## Quick flow

1. Create an API key with a signed-in user session (`POST /api/v1/auth`).
2. Send `Authorization: Bearer mem_xxx` on agent requests.
3. Store memories (`POST /api/v1/memories`).
4. Retrieve/search/context (`GET /api/v1/memories`, `POST /api/v1/search`, `POST /api/v1/context`).
5. Optionally isolate by namespace and organize by session.

## Endpoints

- `POST /api/v1/auth`
- `GET,POST /api/v1/memories`
- `GET,DELETE /api/v1/memories/:id`
- `POST /api/v1/search`
- `POST /api/v1/context`
- `GET,POST /api/v1/namespaces`
- `GET,POST /api/v1/sessions`
- `GET,POST /api/v1/sessions/:sessionId/memories`

## Error format

All v1 endpoints return a consistent error object:

```json
{ "error": "Human readable message", "code": "MACHINE_CODE" }
```
