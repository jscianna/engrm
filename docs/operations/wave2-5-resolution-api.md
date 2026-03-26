# Wave 2.5 — Resolution API

Operational API to adjudicate memory contradictions without direct DB access.

## Endpoint

`PATCH /api/v1/memories/:id/resolution`

## Request body

```json
{
  "confidenceScore": 0.82,
  "supersededBy": "<newer_memory_id>",
  "conflictsWith": ["<memory_id_1>", "<memory_id_2>"],
  "lastVerifiedAt": "2026-03-25T14:00:00.000Z"
}
```

All fields are optional, but at least one is required.

## Behavior

- Validates that `supersededBy` exists and is not self-reference.
- Persists confidence/supersession/conflict metadata to memory row.
- Retrieval excludes superseded memories by default (`superseded_by IS NULL`).

## Related updates

- `PATCH /api/v1/memories/:id` now accepts the same resolution fields (backward-compatible extension).
