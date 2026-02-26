# MEMRY + OpenClaw Integration

OpenClaw agents wake up fresh each session. MEMRY gives them permanent memory that survives restarts, context compaction, and even switching between models.

## Why OpenClaw Agents Need MEMRY

| Problem | MEMRY Solution |
|---------|----------------|
| Agent forgets user preferences | Store preferences permanently |
| Context window fills up | Offload to searchable memory |
| Switching models loses history | Memory persists across any model |
| Can't recall past conversations | Semantic search finds relevant context |
| No audit trail | Arweave makes decisions permanent |

## Quick Setup

```bash
# In your OpenClaw config, add MEMRY API key
export MEMRY_API_KEY="mem_xxx"
```

## Example 1: Remembering User Preferences

```python
# When user states a preference
async def on_user_preference(user_id: str, preference: str):
    await memry.store(
        content=f"User preference: {preference}",
        namespace=f"user_{user_id}",
        metadata={"type": "preference", "timestamp": now()}
    )

# When responding, recall preferences
async def get_user_context(user_id: str, query: str):
    prefs = await memry.search(
        query=query,
        namespace=f"user_{user_id}",
        top_k=5
    )
    return "\n".join([p.content for p in prefs])
```

**OpenClaw AGENTS.md integration:**
```markdown
## Memory
Before responding to preference-related questions, search MEMRY:
- Call: memry.search(query, namespace="user_{userId}")
- Include relevant memories in your context
```

## Example 2: Conversation Continuity

```python
# Start of each OpenClaw session
session = await memry.create_session(
    namespace="conversations",
    metadata={"user": user_id, "channel": "telegram"}
)

# After each exchange
await memry.store(
    content=f"User: {user_message}\nAssistant: {bot_response}",
    session_id=session.id,
    metadata={"role": "exchange"}
)

# On new session, recall recent context
context = await memry.get_context(
    query="recent conversation",
    session_id=last_session_id,
    max_tokens=2000
)
```

## Example 3: Deal Flow Memory (Vex/Venturer-1)

```python
# When scouting a company
await memry.store(
    content=f"""
    Company: {company_name}
    Score: {score}/10
    Thesis fit: {thesis}
    Team assessment: {team_notes}
    Red flags: {red_flags}
    """,
    namespace="deal_flow",
    metadata={
        "company": company_name,
        "score": score,
        "stage": "scouted",
        "date": today()
    }
)

# When asked about a company later
memories = await memry.search(
    query=f"What do we know about {company_name}?",
    namespace="deal_flow"
)
```

## Example 4: Learning From Corrections

```python
# When user corrects the bot
await memry.store(
    content=f"CORRECTION: When I said '{wrong_thing}', user corrected me: '{correction}'",
    namespace="learnings",
    metadata={"type": "correction", "severity": "high"}
)

# Before responding, check for relevant corrections
corrections = await memry.search(
    query=current_topic,
    namespace="learnings",
    top_k=3
)
if corrections:
    context += "\n\nPast corrections to remember:\n" + format_corrections(corrections)
```

## Example 5: Cross-Session Task Tracking

```python
# When user assigns a task
await memry.store(
    content=f"TODO: {task_description}",
    namespace="tasks",
    metadata={
        "status": "pending",
        "assigned": now(),
        "priority": priority,
        "user": user_id
    }
)

# On heartbeat, check pending tasks
pending = await memry.search(
    query="pending tasks due soon",
    namespace="tasks"
)
```

## Example 6: Building a Knowledge Graph

```python
# When learning about relationships
await memry.store(
    content=f"{person_a} is connected to {person_b} via {relationship}",
    namespace="network_graph",
    metadata={
        "entities": [person_a, person_b],
        "relationship_type": relationship
    }
)

# Query the graph
connections = await memry.search(
    query=f"Who is {person} connected to?",
    namespace="network_graph"
)
```

## OpenClaw Skill Integration

Create a MEMRY skill for OpenClaw agents:

```markdown
# skills/memry/SKILL.md

## When to Use
- Storing user preferences, learnings, corrections
- Recalling past conversations or decisions
- Building persistent knowledge across sessions

## Usage
```python
from memry import MemryClient

client = MemryClient(api_key=os.environ["MEMRY_API_KEY"])

# Store
client.store("Important fact to remember", namespace="knowledge")

# Search
results = client.search("relevant query", top_k=5)

# Get context window
context = client.get_context("current task", max_tokens=4000)
```
```

## The Pitch for OpenClaw Users

> "Your OpenClaw agent reads MEMORY.md every session. But MEMORY.md has limits:
> - Gets too long → context overflow
> - Can't search semantically
> - Lost if file corrupts
> 
> MEMRY is MEMORY.md that scales forever, searches intelligently, and lives on Arweave permanently."

## API Endpoints for OpenClaw

| Action | Endpoint | Example |
|--------|----------|---------|
| Store memory | `POST /api/v1/memories` | Save user preference |
| Search | `POST /api/v1/search` | Find relevant context |
| Get context | `POST /api/v1/context` | Build LLM prompt |
| Create session | `POST /api/v1/sessions` | Start conversation |
| List by session | `GET /api/v1/sessions/{id}/memories` | Recall conversation |

## Security Note

MEMRY uses zero-knowledge encryption. Even if someone accesses the API, they can't read the actual memories without the user's vault password. This is critical for agents handling sensitive data (financials, health, personal info).
