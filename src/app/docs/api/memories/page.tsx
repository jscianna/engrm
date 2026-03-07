import { CodeBlock, Note, Table, Endpoint, H1, H2, H3, P, InlineCode, Footer } from "../../components";

export const metadata = {
  title: "Memories API | FatHippo Docs",
  description: "Store, retrieve, and manage memories with the FatHippo API.",
};

export default function MemoriesApiPage() {
  return (
    <>
      <H1>Memories API</H1>
      <P>
        Store, retrieve, list, and delete memories. The memories API supports both 
        plaintext and pre-encrypted content.
      </P>

      <H2 id="create">Create Memory</H2>
      <Endpoint method="POST" path="/v1/memories" />
      <P>
        Store a new memory with automatic type classification, entity extraction, 
        and embedding generation.
      </P>

      <H3>Request Body</H3>
      <Table
        headers={["Field", "Type", "Required", "Description"]}
        rows={[
          ["content", "string", "Yes*", "Memory content (plaintext)"],
          ["text", "string", "Yes*", "Alias for content"],
          ["title", "string", "No", "Title (auto-generated if omitted)"],
          ["memoryType", "string", "No", "Override type classification"],
          ["importanceTier", "string", "No", "critical | high | normal"],
          ["namespace", "string", "No", "Namespace for organization"],
          ["sessionId", "string", "No", "Link to active session"],
          ["metadata", "object", "No", "Arbitrary JSON metadata"],
        ]}
      />
      <P className="text-sm text-zinc-500">* Either content or ciphertext+iv required</P>

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl -X POST "https://fathippo.ai/api/v1/memories" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "content": "User decided to use PostgreSQL for the new project",
    "importanceTier": "high",
    "namespace": "project-alpha"
  }'`}</CodeBlock>

      <H3>Response (201 Created)</H3>
      <CodeBlock language="json">{`{
  "memory": {
    "id": "mem_abc123xyz",
    "title": "User decided to use PostgreSQL for the new project",
    "text": "User decided to use PostgreSQL for the new project",
    "memoryType": "decision",
    "importanceTier": "high",
    "entities": ["PostgreSQL"],
    "sourceType": "api",
    "createdAt": "2026-03-04T10:30:00Z"
  }
}`}</CodeBlock>

      <H3>Consolidation Suggestion</H3>
      <P>
        If a similar memory exists (cosine similarity &gt; 0.85), the API returns a 
        consolidation suggestion instead of creating a duplicate:
      </P>
      <CodeBlock language="json">{`{
  "status": "consolidation_suggested",
  "newMemory": {
    "title": "User prefers PostgreSQL",
    "text": "User prefers PostgreSQL",
    "memoryType": "preference",
    "importanceTier": "normal",
    "entities": ["PostgreSQL"]
  },
  "similarMemories": [
    {
      "id": "mem_existing123",
      "title": "User decided to use PostgreSQL",
      "text": "User decided to use PostgreSQL for the new project",
      "similarity": 0.91,
      "memoryType": "decision",
      "createdAt": "2026-03-01T10:00:00Z"
    }
  ],
  "suggestion": "Consider merging with the existing memory",
  "hint": "Add ?force=true to create anyway"
}`}</CodeBlock>

      <Note type="tip">
        To bypass consolidation, add <InlineCode>?force=true</InlineCode> to the URL.
      </Note>

      <H2 id="list">List Memories</H2>
      <Endpoint method="GET" path="/v1/memories" />
      <P>List memories with optional filtering.</P>

      <H3>Query Parameters</H3>
      <Table
        headers={["Parameter", "Type", "Default", "Description"]}
        rows={[
          ["namespace", "string", "–", "Filter by namespace"],
          ["limit", "number", "50", "Max results (max: 200)"],
          ["since", "ISO date", "–", "Filter by creation date"],
        ]}
      />

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl "https://fathippo.ai/api/v1/memories?limit=10&namespace=project-alpha" \\
  -H "Authorization: Bearer mem_your_api_key"`}</CodeBlock>

      <H3>Response</H3>
      <CodeBlock language="json">{`{
  "memories": [
    {
      "id": "mem_abc123",
      "title": "User prefers dark mode",
      "text": "User prefers dark mode and concise responses",
      "memoryType": "preference",
      "importanceTier": "normal",
      "accessCount": 5,
      "feedbackScore": 0,
      "createdAt": "2026-03-01T10:00:00Z",
      "updatedAt": "2026-03-04T15:30:00Z"
    }
  ]
}`}</CodeBlock>

      <H2 id="get">Get Single Memory</H2>
      <Endpoint method="GET" path="/v1/memories/{id}" />
      <P>Retrieve a single memory by ID.</P>

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl "https://fathippo.ai/api/v1/memories/mem_abc123" \\
  -H "Authorization: Bearer mem_your_api_key"`}</CodeBlock>

      <H3>Response</H3>
      <CodeBlock language="json">{`{
  "memory": {
    "id": "mem_abc123",
    "title": "User prefers dark mode",
    "text": "User prefers dark mode and concise responses",
    "memoryType": "preference",
    "importanceTier": "normal",
    "entities": ["dark mode"],
    "accessCount": 5,
    "feedbackScore": 0,
    "sourceType": "api",
    "createdAt": "2026-03-01T10:00:00Z",
    "updatedAt": "2026-03-04T15:30:00Z"
  }
}`}</CodeBlock>

      <H2 id="delete">Delete Memory</H2>
      <Endpoint method="DELETE" path="/v1/memories/{id}" />
      <P>Permanently delete a memory.</P>

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl -X DELETE "https://fathippo.ai/api/v1/memories/mem_abc123" \\
  -H "Authorization: Bearer mem_your_api_key"`}</CodeBlock>

      <H3>Response (200 OK)</H3>
      <CodeBlock language="json">{`{
  "deleted": true,
  "id": "mem_abc123"
}`}</CodeBlock>

      <Note type="warning">
        Deletion is permanent and cannot be undone. The memory is removed from 
        both the database and vector store.
      </Note>

      <H2 id="memory-types">Memory Types</H2>
      <P>
        FatHippo auto-classifies memories into types. You can override this with 
        the <InlineCode>memoryType</InlineCode> field:
      </P>
      <Table
        headers={["Type", "Auto-Detection Patterns"]}
        rows={[
          ["identity", '"I am", "my name is", "I\'m called"'],
          ["preference", '"I prefer", "I like", "I always"'],
          ["constraint", '"must always", "never do", "required to"'],
          ["decision", '"decided", "going with", "we chose"'],
          ["fact", '"is located in", "works at", "my email is"'],
          ["how_to", '"the way to", "my process for"'],
          ["relationship", '"my wife", "my colleague", "my boss"'],
          ["event", '"yesterday", "last week", "we had a meeting"'],
          ["belief", '"I believe", "I think that", "my view is"'],
        ]}
      />

      <Footer />
    </>
  );
}
