# Integration Examples

## LangChain example

```python
from langchain.memory import ConversationBufferMemory
import requests

memory = ConversationBufferMemory(return_messages=True)

def store_turn(text: str):
    requests.post(
        f"{BASE_URL}/api/v1/memories",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={"text": text, "namespace": "langchain-agent"},
    )
```

## OpenAI function-calling example

```js
const tools = [{
  type: "function",
  function: {
    name: "search_memry",
    description: "Search long-term memory",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
}];
```

Tool handler:

```js
async function searchMemry(query) {
  const res = await fetch(`${baseUrl}/api/v1/search`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, topK: 5, namespace: "assistant" }),
  });
  return await res.json();
}
```

## CrewAI example

Use a custom tool that calls:

- `POST /api/v1/memories` after each task output
- `POST /api/v1/context` before each task input

## Python SDK usage

See `docs/sdk/python/memry.py`.
