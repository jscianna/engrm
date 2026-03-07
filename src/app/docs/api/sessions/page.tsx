import { CodeBlock, Note, Table, Endpoint, H1, H2, H3, P, InlineCode, Footer } from "../../components";

export const metadata = {
  title: "Sessions API | Engrm Docs",
  description: "Track conversations with session-based memory management.",
};

export default function SessionsApiPage() {
  return (
    <>
      <H1>Sessions API</H1>
      <P>
        Sessions track conversations from start to end. They provide initial context,
        track memory usage per turn, and enable analytics on conversation patterns.
      </P>

      <H2 id="start">Start Session</H2>
      <Endpoint method="POST" path="/v1/sessions/start" />
      <P>
        Start a new session and receive initial context. Critical memories are 
        always injected, plus relevant high-tier memories based on the first message.
      </P>

      <H3>Request Body</H3>
      <Table
        headers={["Field", "Type", "Required", "Description"]}
        rows={[
          ["firstMessage", "string", "No", "First user message (for context relevance)"],
          ["namespace", "string", "No", "Namespace for session"],
          ["metadata", "object", "No", "Arbitrary session metadata"],
        ]}
      />

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl -X POST "https://fathippo.ai/api/v1/sessions/start" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "firstMessage": "Help me design a REST API",
    "namespace": "project-alpha"
  }'`}</CodeBlock>

      <H3>Response (201 Created)</H3>
      <CodeBlock language="json">{`{
  "sessionId": "sess_xyz789",
  "context": {
    "critical": [
      {
        "id": "mem_c1",
        "title": "User is John, software engineer",
        "text": "User is John, a software engineer based in Singapore",
        "type": "identity"
      }
    ],
    "high": [
      {
        "id": "mem_h1",
        "title": "User prefers REST over GraphQL",
        "text": "User chose REST over GraphQL because team is more familiar with it",
        "type": "decision"
      }
    ]
  },
  "stats": {
    "tokensInjected": 156,
    "criticalCount": 1,
    "highCount": 1
  }
}`}</CodeBlock>

      <Note type="tip">
        The <InlineCode>context</InlineCode> object contains memories formatted for injection 
        into your AI's system prompt. Critical memories are your user's identity layer—
        always include them.
      </Note>

      <H2 id="turn">Record Turn</H2>
      <Endpoint method="POST" path="/v1/sessions/{id}/turn" />
      <P>
        Record a conversation turn. Returns a refresh signal every 5 turns with 
        updated context for topic drift.
      </P>

      <H3>Request Body</H3>
      <Table
        headers={["Field", "Type", "Required", "Description"]}
        rows={[
          ["messages", "array", "Yes", "Array of {role, content} message objects"],
          ["turnNumber", "number", "No", "Turn number (auto-incremented if omitted)"],
          ["memoriesUsed", "string[]", "No", "IDs of memories used in this turn"],
        ]}
      />

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl -X POST "https://fathippo.ai/api/v1/sessions/sess_xyz789/turn" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "turnNumber": 1,
    "messages": [
      {"role": "user", "content": "Help me design a REST API"},
      {"role": "assistant", "content": "Based on your preference for REST..."}
    ],
    "memoriesUsed": ["mem_h1"]
  }'`}</CodeBlock>

      <H3>Response</H3>
      <CodeBlock language="json">{`{
  "turnNumber": 1,
  "refreshNeeded": false,
  "memoriesUsed": ["mem_h1"]
}`}</CodeBlock>

      <H3>Context Refresh</H3>
      <P>
        Every 5 turns, <InlineCode>refreshNeeded</InlineCode> is <InlineCode>true</InlineCode> and 
        a <InlineCode>newContext</InlineCode> object is returned with updated relevant memories:
      </P>
      <CodeBlock language="json">{`{
  "turnNumber": 5,
  "refreshNeeded": true,
  "newContext": {
    "critical": [...],
    "high": [
      {
        "id": "mem_new",
        "title": "Project uses FastAPI",
        "text": "User mentioned they're building with FastAPI",
        "type": "fact"
      }
    ]
  },
  "memoriesUsed": ["mem_h1", "mem_h2"]
}`}</CodeBlock>

      <H2 id="end">End Session</H2>
      <Endpoint method="POST" path="/v1/sessions/{id}/end" />
      <P>
        End a session and record the outcome. This updates analytics and can 
        trigger memory extraction from the conversation.
      </P>

      <H3>Request Body</H3>
      <Table
        headers={["Field", "Type", "Required", "Description"]}
        rows={[
          ["outcome", "string", "No", "success | partial | failure | abandoned"],
          ["summary", "string", "No", "Brief summary of the conversation"],
          ["extractMemories", "boolean", "No", "Auto-extract memories from conversation"],
        ]}
      />

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl -X POST "https://fathippo.ai/api/v1/sessions/sess_xyz789/end" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "outcome": "success",
    "summary": "Helped user design REST API endpoints"
  }'`}</CodeBlock>

      <H3>Response</H3>
      <CodeBlock language="json">{`{
  "sessionId": "sess_xyz789",
  "ended": true,
  "duration": 342,
  "turnCount": 8,
  "memoriesUsed": 5,
  "outcome": "success"
}`}</CodeBlock>

      <H2 id="list">List Sessions</H2>
      <Endpoint method="GET" path="/v1/sessions" />
      <P>List recent sessions with basic stats.</P>

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl "https://fathippo.ai/api/v1/sessions?limit=10" \\
  -H "Authorization: Bearer mem_your_api_key"`}</CodeBlock>

      <H3>Response</H3>
      <CodeBlock language="json">{`{
  "sessions": [
    {
      "id": "sess_xyz789",
      "startedAt": "2026-03-04T10:00:00Z",
      "endedAt": "2026-03-04T10:05:42Z",
      "turnCount": 8,
      "memoriesUsed": 5,
      "outcome": "success"
    }
  ]
}`}</CodeBlock>

      <Note>
        Sessions without an explicit end are auto-closed after 2 hours of inactivity.
        These are marked with <InlineCode>outcome: "abandoned"</InlineCode>.
      </Note>

      <Footer />
    </>
  );
}
