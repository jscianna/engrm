# Engrm + OpenClaw Integration

OpenClaw agents wake up fresh each session. Engrm gives them permanent memory that survives restarts, context compaction, and model switches.

## Why Agents Need Engrm

| Problem | Engrm Solution |
|---------|----------------|
| Agent forgets user preferences | Store preferences permanently |
| Context window fills up | Offload to searchable memory |
| Switching models loses history | Memory persists across any model |
| Can't recall past conversations | Semantic search finds relevant context |
| No audit trail | Arweave makes decisions verifiable |

## Quick Start

```bash
# Set your API key
export Engrm_API_KEY="mem_xxx"
```

```python
from engrm import MemryClient

client = MemryClient(api_key=os.environ["Engrm_API_KEY"])

# Store a memory
client.store("User prefers morning meeting times")

# Search memories
results = client.search("meeting preferences")

# Get context for LLM
context = client.get_context("scheduling a meeting", max_tokens=2000)
```

## Example 1: Remembering User Preferences

```python
# When user states a preference
async def save_preference(user_id: str, preference: str):
    await engrm.store(
        content=f"User preference: {preference}",
        namespace=f"user_{user_id}",
        metadata={"type": "preference"}
    )

# Before responding to preference-related questions
async def get_preferences(user_id: str, topic: str):
    return await engrm.search(
        query=topic,
        namespace=f"user_{user_id}",
        top_k=5
    )
```

**Example preferences to store:**
- "User prefers concise responses over detailed explanations"
- "User's timezone is EST"
- "User prefers code examples in Python"

## Example 2: Conversation Continuity

```python
# Start a session for this conversation
session = await engrm.create_session(
    namespace="conversations",
    metadata={"channel": "slack", "started": now()}
)

# After each exchange
await engrm.store(
    content=f"User asked about project deadlines. I provided Q2 timeline.",
    session_id=session.id
)

# On new session, recall context
context = await engrm.get_context(
    query="recent discussion topics",
    max_tokens=2000
)
```

## Example 3: Learning From Corrections

```python
# When user corrects the agent
await engrm.store(
    content=f"CORRECTION: {original_statement} was wrong. Correct info: {correction}",
    namespace="learnings",
    metadata={"type": "correction", "topic": topic}
)

# Before responding, check for relevant corrections
corrections = await engrm.search(
    query=current_topic,
    namespace="learnings",
    top_k=3
)
```

## Example 4: Task and Project Tracking

```python
# When user assigns a task
await engrm.store(
    content=f"Task: {task_description}. Due: {due_date}. Priority: {priority}",
    namespace="tasks",
    metadata={"status": "pending", "assigned": now()}
)

# Check pending tasks
pending = await engrm.search(
    query="pending tasks",
    namespace="tasks"
)
```

## Example 5: Knowledge Base Building

```python
# When learning new information
await engrm.store(
    content=f"Fact: {information}. Source: {source}. Context: {context}",
    namespace="knowledge",
    metadata={"category": category, "confidence": "high"}
)

# Query knowledge base
relevant = await engrm.search(
    query="information about topic X",
    namespace="knowledge",
    top_k=10
)
```

## Example 6: Multi-Agent Namespaces

```python
# Each agent gets its own namespace
research_agent_ns = "agent_research"
writing_agent_ns = "agent_writing"
coding_agent_ns = "agent_coding"

# Research agent stores findings
await engrm.store(
    content="Found 3 relevant papers on topic",
    namespace=research_agent_ns
)

# Writing agent can access research namespace if needed
research = await engrm.search(
    query="relevant papers",
    namespace=research_agent_ns
)
```

## Context Window Management

The `/context` endpoint is designed for LLM prompts:

```python
# Get optimized context for your current task
context = await engrm.get_context(
    query="user's project requirements",
    max_tokens=4000,  # Fits in most context windows
    namespace="projects"
)

# Use in your LLM prompt
prompt = f"""
Previous context:
{context}

Current request: {user_message}
"""
```

The context endpoint:
- Combines recent + semantically relevant memories
- Respects token budget
- Returns LLM-ready text

## Security Model

Engrm uses zero-knowledge encryption:
- Your vault password never leaves your device
- Server stores only encrypted blobs
- Even API access can't read plaintext without the vault key

This is critical for agents handling:
- Personal user data
- Financial information
- Health records
- Confidential business data

## API Reference

| Action | Endpoint | Method |
|--------|----------|--------|
| Store memory | `/api/v1/memories` | POST |
| List memories | `/api/v1/memories` | GET |
| Search | `/api/v1/search` | POST |
| Get context | `/api/v1/context` | POST |
| Create session | `/api/v1/sessions` | POST |
| Create namespace | `/api/v1/namespaces` | POST |

## The Pitch

> **Without Engrm:** Agent forgets everything between sessions. Context window overflows. No way to recall past conversations.
>
> **With Engrm:** Infinite searchable memory. Semantic recall. Permanent storage. Zero-knowledge encryption. One API call.

```python
# That's it. Your agent now has permanent memory.
client.store("Important information to remember forever")
```
