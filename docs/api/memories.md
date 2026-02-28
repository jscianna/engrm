# Memories API

## Store memory

`POST /api/v1/memories`

```bash
curl -X POST "$Engrm_URL/api/v1/memories" \
  -H "Authorization: Bearer $Engrm_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Customer requested SOC2 docs.",
    "namespace": "sales-assistant",
    "metadata": {"customerId": "cus_123"}
  }'
```

Python:

```python
import requests

resp = requests.post(
    f"{base_url}/api/v1/memories",
    headers={"Authorization": f"Bearer {api_key}"},
    json={
        "text": "Customer requested SOC2 docs.",
        "namespace": "sales-assistant",
        "metadata": {"customerId": "cus_123"},
    },
)
print(resp.json())
```

JavaScript:

```js
const resp = await fetch(`${baseUrl}/api/v1/memories`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    text: "Customer requested SOC2 docs.",
    namespace: "sales-assistant",
    metadata: { customerId: "cus_123" },
  }),
});
console.log(await resp.json());
```

## List memories

`GET /api/v1/memories?namespace=sales-assistant&limit=25&since=2026-01-01T00:00:00.000Z`

## Search memories

`POST /api/v1/search`

```json
{ "query": "SOC2 request", "topK": 5, "namespace": "sales-assistant" }
```

## Delete memory

`DELETE /api/v1/memories/:id`
