import { CodeBlock, Note, Table, Endpoint, H1, H2, H3, P, InlineCode, Footer } from "../../components";

export const metadata = {
  title: "Simple API | Engrm Docs",
  description: "Opinionated endpoints for quick integration. Just remember and recall.",
};

export default function SimpleApiPage() {
  return (
    <>
      <H1>Simple API</H1>
      <P>
        The Simple API provides opinionated, batteries-included endpoints for quick integration.
        No need to manage embeddings, types, or tiers—just send text and get results.
      </P>

      <Note type="tip">
        Use the Simple API for prototyping or simple agents. Graduate to the full API 
        when you need fine-grained control over memory management.
      </Note>

      <H2 id="remember">Remember</H2>
      <Endpoint method="POST" path="/v1/simple/remember" />
      <P>
        Store a memory with auto-classification, auto-embedding, and auto-consolidation.
        If a very similar memory exists (similarity &gt; 0.90), it's merged automatically.
      </P>

      <H3>Request Body</H3>
      <Table
        headers={["Field", "Type", "Required", "Description"]}
        rows={[
          ["text", "string", "Yes", "Memory content"],
        ]}
      />

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl -X POST "https://fathippo.ai/api/v1/simple/remember" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "User prefers TypeScript over JavaScript"}'`}</CodeBlock>

      <H3>Response (Created)</H3>
      <CodeBlock language="json">{`{
  "id": "mem_abc123",
  "stored": true
}`}</CodeBlock>

      <H3>Response (Consolidated)</H3>
      <P>If merged with an existing similar memory:</P>
      <CodeBlock language="json">{`{
  "id": "mem_existing456",
  "stored": true,
  "consolidated": true,
  "mergedWith": "mem_existing456"
}`}</CodeBlock>

      <H3>Auto-Classification</H3>
      <P>
        The Simple API automatically detects memory type and importance based on content patterns:
      </P>
      <Table
        headers={["Pattern", "Type", "Tier"]}
        rows={[
          ['"my name is", "I am called"', "identity", "critical"],
          ['"must always", "never ever", "fundamental"', "constraint", "critical"],
          ['"always", "never", "prefer", "important"', "preference", "high"],
          ['Default', "fact", "normal"],
        ]}
      />

      <H2 id="recall">Recall</H2>
      <Endpoint method="POST" path="/v1/simple/recall" />
      <P>
        Search memories and get just the text content—perfect for injection into prompts.
        Automatically tracks access and updates memory strength.
      </P>

      <H3>Request Body</H3>
      <Table
        headers={["Field", "Type", "Required", "Description"]}
        rows={[
          ["query", "string", "Yes", "Natural language search query"],
          ["limit", "number", "No", "Max results (default: 5, max: 20)"],
        ]}
      />

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl -X POST "https://fathippo.ai/api/v1/simple/recall" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "user language preferences", "limit": 3}'`}</CodeBlock>

      <H3>Response</H3>
      <CodeBlock language="json">{`{
  "results": [
    "User prefers TypeScript over JavaScript",
    "User likes Python for data science tasks",
    "User wants concise code examples"
  ],
  "count": 3
}`}</CodeBlock>

      <Note>
        Results are plain strings, ready to inject into your AI's context.
        No need to parse complex objects.
      </Note>

      <H2 id="context">Get Context</H2>
      <Endpoint method="POST" path="/v1/simple/context" />
      <P>
        Get a pre-formatted context string ready to inject into your AI's system prompt.
        Combines critical and relevant memories into markdown format.
      </P>

      <H3>Request Body</H3>
      <Table
        headers={["Field", "Type", "Required", "Description"]}
        rows={[
          ["message", "string", "Yes", "User message for relevance matching"],
          ["limit", "number", "No", "Max memories to include (default: 10)"],
        ]}
      />

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl -X POST "https://fathippo.ai/api/v1/simple/context" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Help me write some code"}'`}</CodeBlock>

      <H3>Response</H3>
      <CodeBlock language="json">{`{
  "context": "## User Context\\n\\n### Core Identity\\n- User is John, a software engineer in Singapore\\n- User prefers morning work hours (9am-12pm SGT)\\n\\n### Relevant Memories\\n- User prefers TypeScript over JavaScript\\n- User wants concise code examples\\n- User likes functional programming patterns",
  "tokensUsed": 78,
  "memoriesUsed": 5
}`}</CodeBlock>

      <H2 id="usage-pattern">Usage Pattern</H2>
      <P>
        Here's a complete example using the Simple API with OpenAI:
      </P>

      <CodeBlock language="python">{`import requests
from openai import OpenAI

API_KEY = "mem_your_api_key"
BASE_URL = "https://fathippo.ai/api/v1/simple"

client = OpenAI()

def chat_with_memory(user_message: str) -> str:
    # Get relevant context
    context_resp = requests.post(
        f"{BASE_URL}/context",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={"message": user_message}
    ).json()
    
    # Build messages
    messages = [
        {
            "role": "system",
            "content": f"You are a helpful assistant.\\n\\n{context_resp['context']}"
        },
        {"role": "user", "content": user_message}
    ]
    
    # Get response
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages
    )
    
    assistant_message = response.choices[0].message.content
    
    # Store any learnings (could be extracted from conversation)
    if "remember" in user_message.lower():
        requests.post(
            f"{BASE_URL}/remember",
            headers={"Authorization": f"Bearer {API_KEY}"},
            json={"text": user_message}
        )
    
    return assistant_message

# Example
response = chat_with_memory("Remember that I prefer dark mode")
print(response)`}</CodeBlock>

      <Footer />
    </>
  );
}
