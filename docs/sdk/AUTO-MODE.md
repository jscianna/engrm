# Engrm Auto Mode SDK

## Vision

One line of code. Your agent has memory.

```python
from engrm import Engrm

engrm = Engrm.auto(api_key="mem_xxx")
```

That's it. No manual API calls. Memory just works.

---

## How Auto Mode Works

### 1. Context Injection (Automatic)

When your agent starts a conversation, Engrm automatically:
- Analyzes the first message
- Retrieves relevant memories
- Injects them into the system prompt

```python
# You write this:
response = openai.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message}
    ]
)

# Engrm auto-mode transforms it to:
response = openai.chat.completions.create(
    model="gpt-4", 
    messages=[
        {"role": "system", "content": system_prompt + "\n\n" + engrm.get_context(user_message)},
        {"role": "user", "content": user_message}
    ]
)
```

### 2. Insight Extraction (Automatic)

After each response, Engrm analyzes for:
- Decisions made
- Preferences stated
- Corrections given
- Important facts learned

If something matters, it's stored. No manual calls.

```python
# Engrm detects:
# User: "I prefer Python over JavaScript"
# → Stores: "User prefers Python over JavaScript"

# User: "Actually, the deadline is March 15, not March 10"
# → Stores: "Correction: deadline is March 15"
```

### 3. Smart Triggers (Automatic)

Engrm re-queries when it detects:
- References to past context ("like we discussed")
- Project/topic shifts
- Questions about decisions

---

## Integration Patterns

### OpenAI SDK

```python
from engrm import Engrm
from openai import OpenAI

engrm = Engrm.auto(api_key="mem_xxx")
client = OpenAI()

# Wrap the client
client = engrm.wrap(client)

# Use normally - memory is automatic
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "What's our project status?"}]
)
```

### Anthropic SDK

```python
from engrm import Engrm
from anthropic import Anthropic

engrm = Engrm.auto(api_key="mem_xxx")
client = Anthropic()

# Wrap the client
client = engrm.wrap(client)

# Use normally
response = client.messages.create(
    model="claude-3-opus-20240229",
    messages=[{"role": "user", "content": "Remember my preference for morning meetings"}]
)
```

### LangChain

```python
from engrm import EngramMemory
from langchain.memory import ConversationBufferMemory

# Drop-in replacement
memory = EngramMemory(api_key="mem_xxx")

chain = ConversationChain(
    llm=llm,
    memory=memory  # Engrm handles everything
)
```

### Generic (Any Framework)

```python
from engrm import Engrm

engrm = Engrm.auto(api_key="mem_xxx")

# Before LLM call
context = engrm.before(user_message)
# Add context to your prompt

# After LLM response  
engrm.after(user_message, assistant_response)
# Engrm extracts and stores insights automatically
```

---

## Configuration

```python
engrm = Engrm.auto(
    api_key="mem_xxx",
    
    # What to auto-inject
    inject_critical=True,      # Always include critical memories
    inject_relevant=True,      # Include semantically matched memories
    max_context_tokens=2000,   # Token budget for injection
    
    # What to auto-extract
    extract_decisions=True,    # Store decisions automatically
    extract_preferences=True,  # Store preferences automatically
    extract_corrections=True,  # Learn from corrections
    
    # Triggers for re-query
    requery_on_reference=True, # "Like we discussed..."
    requery_interval=10,       # Every N turns
)
```

---

## What Gets Stored (Cognitive, Not Data Dump)

**Stored automatically:**
- ✅ "User prefers concise responses"
- ✅ "Decided to use PostgreSQL for the database"
- ✅ "Correction: API rate limit is 100/min, not 1000/min"
- ✅ "User's timezone is Singapore (GMT+8)"

**Not stored:**
- ❌ "What's 2+2?" / "4"
- ❌ Play-by-play conversation logs
- ❌ Temporary debugging discussions
- ❌ Generic chitchat

The extraction model is trained to identify what matters.

---

## Comparison

| Approach | Code Required | Behavior |
|----------|---------------|----------|
| **Manual API** | Every call explicit | Full control, tedious |
| **Skill-based** | Install skill, agent follows | Depends on agent compliance |
| **Auto Mode** | One line setup | True automatic memory |

---

## Roadmap

- [x] Design spec (this doc)
- [ ] Python SDK with auto mode
- [ ] TypeScript/JS SDK
- [ ] OpenClaw plugin
- [ ] LangChain integration
- [ ] LlamaIndex integration
