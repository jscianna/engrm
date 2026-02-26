# Authentication

## Create an API key

`POST /api/v1/auth`

Request body:

```json
{ "agentName": "support-bot" }
```

Response:

```json
{ "apiKey": "mem_xxx", "agentId": "agent_xxx" }
```

## Use API key

Send as bearer token:

```http
Authorization: Bearer mem_xxx
```

## Security best practices

- Treat API keys like passwords; store in a secrets manager.
- Never commit keys to source control.
- Rotate keys regularly.
- Scope keys to specific agents and use distinct keys per environment.

## Rate limits

Rate-limiting hooks are in place and can be wired to your provider (Redis, Upstash, API gateway, etc.).
