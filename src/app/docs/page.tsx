import { CodeBlock, Note, H1, H2, H3, P, InlineCode, Footer } from "./components";

export const metadata = {
  title: "Quick Start | Engrm Docs",
  description: "Get started with Engrm in 5 minutes. Give your AI agents persistent memory.",
};

export default function QuickStartPage() {
  return (
    <>
      <H1>Quick Start</H1>
      <P>
        Give your AI agent persistent, intelligent memory in under 5 minutes.
        This guide walks you through the essential steps to get started.
      </P>

      <H2 id="step-1">1. Get Your API Key</H2>
      <P>
        Sign up at <a href="https://engrm.xyz" className="text-cyan-400 hover:underline">engrm.xyz</a> and 
        go to <strong>Dashboard → Settings → API Keys</strong>.
        Create a new key for your agent.
      </P>
      <P>
        Your API key looks like: <InlineCode>mem_3e245c3069f3e096...</InlineCode>
      </P>

      <H2 id="step-2">2. Store Your First Memory</H2>
      <P>
        The simplest way to store a memory is the <InlineCode>/v1/simple/remember</InlineCode> endpoint.
        It handles classification, embedding, and consolidation automatically.
      </P>
      <CodeBlock language="bash">{`curl -X POST "https://engrm.xyz/api/v1/simple/remember" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "User prefers dark mode and concise responses"}'`}</CodeBlock>
      
      <P>Response:</P>
      <CodeBlock language="json">{`{
  "id": "mem_abc123",
  "stored": true
}`}</CodeBlock>

      <Note type="tip">
        The simple API auto-detects memory type (preference, fact, identity, etc.) and
        importance tier (critical, high, normal). No need to specify these manually.
      </Note>

      <H2 id="step-3">3. Search Your Memories</H2>
      <P>
        Use <InlineCode>/v1/simple/recall</InlineCode> to search and retrieve memories.
        It returns just the text content—perfect for injection into prompts.
      </P>
      <CodeBlock language="bash">{`curl -X POST "https://engrm.xyz/api/v1/simple/recall" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "user preferences", "limit": 5}'`}</CodeBlock>
      
      <P>Response:</P>
      <CodeBlock language="json">{`{
  "results": [
    "User prefers dark mode and concise responses",
    "User likes TypeScript over JavaScript",
    "User works best in the mornings"
  ],
  "count": 3
}`}</CodeBlock>

      <H2 id="step-4">4. Get Context for a Session</H2>
      <P>
        For a complete session workflow, use <InlineCode>/v1/simple/context</InlineCode> to get
        an injectable context string for your AI's system prompt.
      </P>
      <CodeBlock language="bash">{`curl -X POST "https://engrm.xyz/api/v1/simple/context" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Help me design an API"}'`}</CodeBlock>
      
      <P>Response:</P>
      <CodeBlock language="json">{`{
  "context": "## User Context\\n- User prefers REST over GraphQL\\n- Timezone: GMT+8 (Singapore)\\n- Prefers concise responses",
  "tokensUsed": 42,
  "memoriesUsed": 3
}`}</CodeBlock>

      <Note>
        The context is formatted as markdown that you can inject directly into your AI's system prompt.
        This gives your agent instant awareness of the user's preferences and history.
      </Note>

      <H2 id="step-5">5. Full Session Flow (Optional)</H2>
      <P>
        For production agents, use the full session API for better tracking and analytics.
      </P>

      <H3>Start a Session</H3>
      <CodeBlock language="bash">{`curl -X POST "https://engrm.xyz/api/v1/sessions/start" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"firstMessage": "Help me design an API"}'`}</CodeBlock>

      <H3>Record Turns (Optional)</H3>
      <CodeBlock language="bash">{`curl -X POST "https://engrm.xyz/api/v1/sessions/{sessionId}/turn" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "turnNumber": 1,
    "messages": [
      {"role": "user", "content": "Help me design an API"},
      {"role": "assistant", "content": "I can help with that..."}
    ],
    "memoriesUsed": ["mem_abc123"]
  }'`}</CodeBlock>

      <H3>End Session</H3>
      <CodeBlock language="bash">{`curl -X POST "https://engrm.xyz/api/v1/sessions/{sessionId}/end" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"outcome": "success"}'`}</CodeBlock>

      <H2 id="python">Python Example</H2>
      <P>Here's a complete Python integration:</P>
      <CodeBlock language="python">{`import requests

API_KEY = "mem_your_api_key"
BASE_URL = "https://engrm.xyz/api/v1"
headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# Start a session and get context
def start_session(first_message: str) -> dict:
    response = requests.post(
        f"{BASE_URL}/sessions/start",
        headers=headers,
        json={"firstMessage": first_message}
    )
    return response.json()

# Store a memory
def remember(text: str) -> dict:
    response = requests.post(
        f"{BASE_URL}/simple/remember",
        headers=headers,
        json={"text": text}
    )
    return response.json()

# Search memories
def recall(query: str, limit: int = 5) -> list[str]:
    response = requests.post(
        f"{BASE_URL}/simple/recall",
        headers=headers,
        json={"query": query, "limit": limit}
    )
    return response.json()["results"]

# Example usage
session = start_session("Help me with my project")
print(f"Session ID: {session['sessionId']}")
print(f"Context: {session['context']}")

# Store what you learned
remember("User is building a REST API with FastAPI")

# Later, recall relevant context
memories = recall("What framework is the user using?")
print(memories)  # ["User is building a REST API with FastAPI"]`}</CodeBlock>

      <H2 id="next-steps">Next Steps</H2>
      <ul className="list-disc list-inside text-zinc-400 space-y-2 mb-8">
        <li>
          <a href="/docs/concepts" className="text-cyan-400 hover:underline">Core Concepts</a> — 
          Learn about memory tiers, decay, and reinforcement
        </li>
        <li>
          <a href="/docs/api" className="text-cyan-400 hover:underline">API Reference</a> — 
          Full documentation of all endpoints
        </li>
        <li>
          <a href="/docs/guides/openai" className="text-cyan-400 hover:underline">OpenAI Integration</a> — 
          Add memory to GPT-based agents
        </li>
        <li>
          <a href="/docs/guides/anthropic" className="text-cyan-400 hover:underline">Anthropic Integration</a> — 
          Add memory to Claude-based agents
        </li>
      </ul>

      <Footer />
    </>
  );
}
