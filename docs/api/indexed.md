# Indexed Memory API

Store large content with stable keys. Agent context gets compact summaries; full content retrieved on demand.

**Use cases:** Schemas, configs, reference docs, code snippets — anything too large for context but needed precisely.

## Endpoints

### Store Indexed Memory

```http
POST /api/v1/indexed
Authorization: Bearer <api_key>
Content-Type: application/json

{
  "index": "db-users",
  "summary": "Users table with email, role, timestamps",
  "content": "CREATE TABLE users (id UUID PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, ...)"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `index` | Yes | Stable key (1-64 chars, alphanumeric/hyphens/underscores) |
| `summary` | Yes | Short description for agent context |
| `content` | Yes | Full content to store |
| `contentType` | No | Content type hint (default: "text") |
| `metadata` | No | Arbitrary JSON metadata |

**Response:**
```json
{
  "stored": true,
  "index": "db-users",
  "summary": "Users table with email, role, timestamps"
}
```

Upserting: POSTing to an existing index updates it.

---

### List Indexed Summaries

```http
GET /api/v1/indexed
Authorization: Bearer <api_key>
```

**Response:**
```json
{
  "indices": [
    {
      "index": "db-users",
      "summary": "Users table with email, role, timestamps",
      "contentType": "text",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z",
      "accessCount": 5
    }
  ],
  "contextFormat": "[db-users]: Users table with email, role, timestamps\n[api-config]: Rate limits and auth",
  "count": 2
}
```

Use `contextFormat` directly in agent prompts — minimal tokens.

---

### Dereference (Get Full Content)

```http
GET /api/v1/indexed/:index
Authorization: Bearer <api_key>
```

**Response:**
```json
{
  "index": "db-users",
  "summary": "Users table with email, role, timestamps",
  "content": "CREATE TABLE users (id UUID PRIMARY KEY, ...)",
  "contentType": "text",
  "metadata": null,
  "accessCount": 6
}
```

Access count increments on each dereference.

---

### Update Indexed Memory

```http
PATCH /api/v1/indexed/:index
Authorization: Bearer <api_key>
Content-Type: application/json

{
  "summary": "Updated summary",
  "content": "Updated content",
  "metadata": {"version": 2}
}
```

All fields optional. Only provided fields are updated.

---

### Delete Indexed Memory

```http
DELETE /api/v1/indexed/:index
Authorization: Bearer <api_key>
```

**Response:**
```json
{
  "deleted": true,
  "index": "db-users"
}
```

---

## Token Savings

| Scenario | Without Indexed | With Indexed | Savings |
|----------|-----------------|--------------|---------|
| 10 schemas (~500 tokens each) | 5,000 tokens | 500 tokens | 90% |
| 50 configs (~300 tokens each) | 15,000 tokens | 2,500 tokens | 83% |

Agent loads summaries in context. Dereferences only when needed.

---

## Best Practices

1. **Use descriptive summaries** — Agent decides what to dereference based on summaries alone
2. **Stable index keys** — Use semantic names (`db-users`, `api-auth-config`) not UUIDs
3. **Don't over-index** — Only for content >100 tokens that needs precise retrieval
4. **Combine with semantic search** — Summaries are also indexed for `/simple/context` queries
