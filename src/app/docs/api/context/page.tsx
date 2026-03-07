import { CodeBlock, Note, Table, Endpoint, H1, H2, H3, P, InlineCode, Footer } from "../../components";

export const metadata = {
  title: "Context API | FatHippo Docs",
  description: "Get tiered context for AI prompt injection.",
};

export default function ContextApiPage() {
  return (
    <>
      <H1>Context API</H1>
      <P>
        The Context API provides tiered memories formatted for injection into your AI's 
        system prompt. Use it at session start and for mid-conversation refreshes.
      </P>

      <H2 id="get-context">Get Context</H2>
      <Endpoint method="POST" path="/v1/context" />
      <P>
        Returns memories organized by tier: critical (always injected), working 
        (synthesized summaries), and high (query-relevant).
      </P>

      <H3>Request Body</H3>
      <Table
        headers={["Field", "Type", "Required", "Description"]}
        rows={[
          ["message", "string", "No", "User message for relevance matching"],
          ["includeHigh", "boolean", "No", "Include high-tier memories (default: true)"],
          ["highLimit", "number", "No", "Max high-tier memories (default: 5, max: 10)"],
          ["synthesize", "boolean", "No", "Synthesize high memories into working tier"],
        ]}
      />

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl -X POST "https://fathippo.ai/api/v1/context" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Help me schedule a meeting", "highLimit": 3}'`}</CodeBlock>

      <H3>Response</H3>
      <CodeBlock language="json">{`{
  "critical": [
    {
      "id": "mem_c1",
      "title": "User timezone",
      "text": "User is based in Singapore (GMT+8)",
      "type": "fact",
      "tier": "critical",
      "createdAt": "2026-01-15T10:00:00Z"
    }
  ],
  "working": [],
  "high": [
    {
      "id": "mem_h1",
      "title": "Meeting preference",
      "text": "User prefers morning meetings, especially 9-11am",
      "type": "preference",
      "tier": "high",
      "createdAt": "2026-02-20T10:00:00Z"
    },
    {
      "id": "mem_h2",
      "title": "Team distribution",
      "text": "User's team is distributed across US and Asia timezones",
      "type": "fact",
      "tier": "high",
      "createdAt": "2026-02-25T14:00:00Z"
    }
  ],
  "stats": {
    "criticalCount": 1,
    "workingCount": 0,
    "highCount": 2,
    "synthesized": false,
    "totalTokensEstimate": 89
  }
}`}</CodeBlock>

      <H2 id="synthesis">Working Tier Synthesis</H2>
      <P>
        When <InlineCode>synthesize: true</InlineCode> and you have 5+ high-tier memories,
        FatHippo groups related memories by entity overlap and creates synthetic summaries.
        This reduces token usage while preserving context.
      </P>

      <H3>Example with Synthesis</H3>
      <CodeBlock language="bash">{`curl -X POST "https://fathippo.ai/api/v1/context" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Update me on the project", "synthesize": true}'`}</CodeBlock>

      <CodeBlock language="json">{`{
  "critical": [...],
  "working": [
    {
      "id": "synth_0_1709553600000",
      "title": "Summary: PostgreSQL, Database design, Schema",
      "text": "User chose PostgreSQL for the project | Schema uses normalized design | Migration planned for next week",
      "type": "synthesized",
      "tier": "working",
      "synthesizedFrom": ["mem_h1", "mem_h2", "mem_h3"],
      "createdAt": "2026-03-04T10:00:00Z"
    }
  ],
  "high": [],
  "stats": {
    "criticalCount": 1,
    "workingCount": 1,
    "highCount": 0,
    "synthesized": true,
    "totalTokensEstimate": 67
  }
}`}</CodeBlock>

      <Note type="tip">
        Synthesis reduces token count by ~40% while preserving key information. 
        Use it when context windows are tight or for long-running conversations.
      </Note>

      <H2 id="refresh">Refresh Context</H2>
      <Endpoint method="POST" path="/v1/context/refresh" />
      <P>
        Mid-conversation context refresh. Call this when the topic shifts significantly 
        or every 5-10 turns to catch new relevant memories.
      </P>

      <H3>Request Body</H3>
      <Table
        headers={["Field", "Type", "Required", "Description"]}
        rows={[
          ["sessionId", "string", "Yes", "Active session ID"],
          ["recentMessages", "array", "No", "Recent messages for relevance matching"],
          ["excludeIds", "string[]", "No", "Memory IDs to exclude (already used)"],
        ]}
      />

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl -X POST "https://fathippo.ai/api/v1/context/refresh" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "sessionId": "sess_xyz789",
    "recentMessages": [
      {"role": "user", "content": "Now lets discuss deployment"}
    ],
    "excludeIds": ["mem_h1", "mem_h2"]
  }'`}</CodeBlock>

      <H3>Response</H3>
      <CodeBlock language="json">{`{
  "newMemories": [
    {
      "id": "mem_deploy1",
      "title": "Deployment preference",
      "text": "User prefers Docker + Kubernetes for deployment",
      "type": "preference",
      "tier": "high"
    }
  ],
  "tokensAdded": 45
}`}</CodeBlock>

      <H2 id="prompt-injection">Prompt Injection Pattern</H2>
      <P>
        Here's how to inject context into your AI's system prompt:
      </P>

      <CodeBlock language="python">{`import requests

def get_system_prompt(user_message: str) -> str:
    # Get context from FatHippo
    context = requests.post(
        "https://fathippo.ai/api/v1/context",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={"message": user_message}
    ).json()
    
    # Build system prompt
    prompt = "You are a helpful assistant.\\n\\n"
    
    # Always include critical memories
    if context["critical"]:
        prompt += "## User Context (Critical)\\n"
        for mem in context["critical"]:
            prompt += f"- {mem['text']}\\n"
        prompt += "\\n"
    
    # Include relevant high-tier memories
    if context["high"]:
        prompt += "## Relevant Context\\n"
        for mem in context["high"]:
            prompt += f"- {mem['text']}\\n"
        prompt += "\\n"
    
    return prompt`}</CodeBlock>

      <Footer />
    </>
  );
}
