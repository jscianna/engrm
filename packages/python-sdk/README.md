# FatHippo Python SDK

Model-agnostic persistent memory for AI agents. Works with any LLM - OpenAI, Anthropic, local models, etc.

## Installation

```bash
pip install fathippo
```

## Quick Start

```python
from fathippo import FatHippo

# Initialize client
hippo = FatHippo(api_key="mem_xxx")

# Store a memory (auto-classified)
hippo.remember("User prefers dark mode for all applications")

# Search memories
results = hippo.recall("user preferences")
for text in results:
    print(text)

# Get context for prompt injection
context = hippo.context(message="Help me with settings")
print(context)
```

## Session-Based Usage

Sessions provide automatic context management and analytics:

```python
from fathippo import FatHippo

hippo = FatHippo(api_key="mem_xxx")

# Start a session with the first user message
session = hippo.session(first_message="Help me configure my editor")

# session.context is ready to inject into your LLM prompt
system_prompt = f"""You are a helpful assistant.

{session.context}
"""

# After each turn, record the messages
session.turn(messages=[
    {"role": "user", "content": "I want to use vim keybindings"},
    {"role": "assistant", "content": "I can help with that..."}
])

# Store memories during the session
session.remember("User wants vim keybindings in their editor")

# Log when you can't find something
session.miss("editor theme preference")

# End the session with outcome
summary = session.end(outcome="success")
print(summary)
# {
#   "summary": "Discussed editor configuration...",
#   "suggestedMemories": [...],
#   "memoriesReinforced": 3,
#   "analytics": {"turns": 4, "memoriesUsed": 2}
# }
```

## API Reference

### `FatHippo(api_key, api_url, namespace, timeout)`

Main client class.

- `api_key`: Your FatHippo API key (or set `FATHIPPO_API_KEY` env var)
- `api_url`: API base URL (default: `https://www.fathippo.ai/api/v1`)
- `namespace`: Optional namespace to scope all memories
- `timeout`: Request timeout in seconds (default: 30)

### Methods

#### `hippo.remember(text, namespace=None) -> dict`

Store a memory using the simple API with auto-classification.

```python
result = hippo.remember("User prefers TypeScript over JavaScript")
# {"id": "...", "stored": True}
```

#### `hippo.recall(query, limit=5, namespace=None) -> list[str]`

Search memories and get just the text content.

```python
results = hippo.recall("programming preferences", limit=3)
# ["User prefers TypeScript over JavaScript", ...]
```

#### `hippo.context(message="", namespace=None) -> str`

Get formatted context string ready to inject into prompts.

```python
context = hippo.context(message="Help me write code")
# "Here's what you know about this user:\n\n## Core Information\n- User prefers TypeScript..."
```

#### `hippo.miss(query, context=None, session_id=None) -> dict`

Log a memory miss - when you searched but didn't find what you needed.

```python
hippo.miss(
    query="user's timezone",
    context="User asked what time to schedule meeting"
)
# {"logged": True, "suggestion": "Consider storing timezone preferences when learned"}
```

#### `hippo.extract(conversation, namespace=None) -> dict`

Extract suggested memories from a conversation.

```python
suggestions = hippo.extract([
    {"role": "user", "content": "I prefer dark mode for all my apps"},
    {"role": "assistant", "content": "Got it, I'll remember that preference"}
])
# {
#   "suggestions": [
#     {"title": "User Preference", "content": "...", "memoryType": "preference", "confidence": 0.92}
#   ],
#   "tokensAnalyzed": 45
# }
```

#### `hippo.search(query, top_k=10, namespace=None) -> list[dict]`

Search memories with full metadata (scores, types, etc).

#### `hippo.store(content, title=None, memory_type="episodic", importance_tier="normal", namespace=None) -> dict`

Store a memory with explicit parameters.

#### `hippo.feedback(memory_id, rating) -> dict`

Provide feedback on a memory ("positive" or "negative").

### `hippo.session(first_message, metadata=None, namespace=None) -> Session`

Start a new session for tracking conversation context.

### Session Methods

#### `session.context` (property)

Get the formatted context string ready to inject.

#### `session.turn(messages, memories_used=None) -> dict`

Record a turn. Returns `refreshNeeded` and optional `newContext`.

#### `session.end(outcome="success", feedback=None) -> dict`

End the session and get summary with analytics.

#### `session.remember(text) -> dict`

Store a memory within the session's namespace.

#### `session.recall(query, limit=5) -> list[str]`

Search memories within the session's namespace.

#### `session.miss(query, context=None) -> dict`

Log a miss associated with this session.

## Integration Examples

### With OpenAI

```python
from openai import OpenAI
from fathippo import FatHippo

openai = OpenAI()
hippo = FatHippo(api_key="mem_xxx")

def chat(user_message: str) -> str:
    # Get memory context
    context = hippo.context(message=user_message)
    
    # Build messages with context
    messages = [
        {"role": "system", "content": f"You are a helpful assistant.\n\n{context}"},
        {"role": "user", "content": user_message}
    ]
    
    # Call OpenAI
    response = openai.chat.completions.create(
        model="gpt-4",
        messages=messages
    )
    
    return response.choices[0].message.content
```

### With Anthropic

```python
import anthropic
from fathippo import FatHippo

client = anthropic.Anthropic()
hippo = FatHippo(api_key="mem_xxx")

def chat(user_message: str) -> str:
    context = hippo.context(message=user_message)
    
    response = client.messages.create(
        model="claude-3-sonnet-20240229",
        max_tokens=1024,
        system=f"You are a helpful assistant.\n\n{context}",
        messages=[{"role": "user", "content": user_message}]
    )
    
    return response.content[0].text
```

### With LangChain

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from fathippo import FatHippo

llm = ChatOpenAI(model="gpt-4")
hippo = FatHippo(api_key="mem_xxx")

def chat(user_message: str) -> str:
    context = hippo.context(message=user_message)
    
    messages = [
        SystemMessage(content=f"You are a helpful assistant.\n\n{context}"),
        HumanMessage(content=user_message)
    ]
    
    response = llm.invoke(messages)
    return response.content
```

## Namespaces

Scope memories to projects or contexts:

```python
# Global client with namespace
hippo = FatHippo(api_key="mem_xxx", namespace="project:myapp")

# Override per-call
hippo.remember("Database uses PostgreSQL", namespace="project:myapp:backend")
results = hippo.recall("database", namespace="project:myapp:backend")
```

## Environment Variables

- `FATHIPPO_API_KEY`: Default API key

## Legacy OpenAI Wrapper

For backward compatibility, the `FatHippoWrapper` is still available:

```python
from fathippo import FatHippoWrapper
# See wrapper.py for usage
```

## License

MIT
