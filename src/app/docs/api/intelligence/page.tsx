import { CodeBlock, Note, Table, Endpoint, H1, H2, H3, P, InlineCode, Footer } from "../../components";

export const metadata = {
  title: "Intelligence API | FatHippo Docs",
  description: "Feedback, extraction, and debugging endpoints for smarter memory management.",
};

export default function IntelligenceApiPage() {
  return (
    <>
      <H1>Intelligence API</H1>
      <P>
        Endpoints for reinforcing memories, extracting insights from conversations,
        and debugging retrieval behavior.
      </P>

      <H2 id="reinforce">Reinforce Memory</H2>
      <Endpoint method="POST" path="/v1/memories/{id}/reinforce" />
      <P>
        Provide explicit feedback on a memory. Positive reinforcement strengthens 
        it (+1), negative weakens it (-1). This is weighted 5× more than passive access.
      </P>

      <H3>Request Body</H3>
      <Table
        headers={["Field", "Type", "Required", "Description"]}
        rows={[
          ["value", "number", "Yes", "1 (positive) or -1 (negative)"],
          ["reason", "string", "No", "Optional reason for feedback"],
        ]}
      />

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl -X POST "https://fathippo.ai/api/v1/memories/mem_abc123/reinforce" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"value": 1, "reason": "This preference was accurate"}'`}</CodeBlock>

      <H3>Response</H3>
      <CodeBlock language="json">{`{
  "memoryId": "mem_abc123",
  "feedbackScore": 3,
  "accessCount": 15,
  "newTier": "high",
  "promoted": true,
  "demoted": false,
  "message": "Memory reinforced. Promoted to high tier."
}`}</CodeBlock>

      <Note type="tip">
        Use reinforcement when a memory was particularly helpful (or unhelpful).
        Memories with high feedback scores rank higher in search results.
      </Note>

      <H2 id="lock">Lock Tier</H2>
      <Endpoint method="POST" path="/v1/memories/{id}/lock" />
      <P>
        Manually promote a memory to a specific tier and lock it there.
        Locked memories won't be auto-demoted by decay.
      </P>

      <H3>Request Body</H3>
      <Table
        headers={["Field", "Type", "Required", "Description"]}
        rows={[
          ["tier", "string", "Yes", "critical | high | normal"],
        ]}
      />

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl -X POST "https://fathippo.ai/api/v1/memories/mem_abc123/lock" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"tier": "critical"}'`}</CodeBlock>

      <H3>Response</H3>
      <CodeBlock language="json">{`{
  "memoryId": "mem_abc123",
  "tier": "critical",
  "locked": true,
  "message": "Memory locked at critical tier"
}`}</CodeBlock>

      <H2 id="miss">Log Miss</H2>
      <Endpoint method="POST" path="/v1/memories/miss" />
      <P>
        Log when a user asks about something your agent didn't know.
        Misses help identify gaps in memory coverage.
      </P>

      <H3>Request Body</H3>
      <Table
        headers={["Field", "Type", "Required", "Description"]}
        rows={[
          ["query", "string", "Yes", "The query that had no good results"],
          ["sessionId", "string", "No", "Session where miss occurred"],
          ["context", "string", "No", "Additional context about the miss"],
        ]}
      />

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl -X POST "https://fathippo.ai/api/v1/memories/miss" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "What is the users favorite restaurant?",
    "sessionId": "sess_xyz789",
    "context": "User asked about dinner plans"
  }'`}</CodeBlock>

      <H3>Response</H3>
      <CodeBlock language="json">{`{
  "logged": true,
  "missId": "miss_abc123"
}`}</CodeBlock>

      <H2 id="misses">Get Misses</H2>
      <Endpoint method="GET" path="/v1/memories/misses" />
      <P>
        Retrieve logged misses to understand what memories you should be storing.
      </P>

      <H3>Query Parameters</H3>
      <Table
        headers={["Parameter", "Type", "Default", "Description"]}
        rows={[
          ["limit", "number", "20", "Max results"],
          ["since", "ISO date", "–", "Filter by date"],
        ]}
      />

      <H3>Response</H3>
      <CodeBlock language="json">{`{
  "misses": [
    {
      "id": "miss_abc123",
      "query": "What is the users favorite restaurant?",
      "context": "User asked about dinner plans",
      "createdAt": "2026-03-04T10:00:00Z"
    }
  ],
  "count": 1
}`}</CodeBlock>

      <H2 id="extract">Extract Memories</H2>
      <Endpoint method="POST" path="/v1/extract" />
      <P>
        Analyze a conversation and extract suggested memories using heuristic 
        pattern matching. Returns confidence scores for each suggestion.
      </P>

      <H3>Request Body</H3>
      <Table
        headers={["Field", "Type", "Required", "Description"]}
        rows={[
          ["conversation", "array", "Yes", "Array of {role, content} messages"],
          ["namespace", "string", "No", "Target namespace for extracted memories"],
        ]}
      />

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl -X POST "https://fathippo.ai/api/v1/extract" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "conversation": [
      {"role": "user", "content": "My name is John and I live in Singapore"},
      {"role": "assistant", "content": "Nice to meet you, John!"},
      {"role": "user", "content": "I prefer morning meetings, usually around 9am"},
      {"role": "assistant", "content": "Got it, I will remember that preference."}
    ]
  }'`}</CodeBlock>

      <H3>Response</H3>
      <CodeBlock language="json">{`{
  "suggestions": [
    {
      "title": "User Identity: My name is John and I live in Singapore",
      "content": "My name is John and I live in Singapore",
      "memoryType": "identity",
      "suggestedTier": "critical",
      "confidence": 0.95
    },
    {
      "title": "User Preference: I prefer morning meetings, usually around 9am",
      "content": "I prefer morning meetings, usually around 9am",
      "memoryType": "preference",
      "suggestedTier": "high",
      "confidence": 0.92
    }
  ],
  "tokensAnalyzed": 156
}`}</CodeBlock>

      <Note>
        Extraction uses pattern matching, not LLM calls. This keeps costs at zero 
        while maintaining high accuracy for common memory types.
      </Note>

      <H2 id="explain">Explain Retrieval</H2>
      <Endpoint method="POST" path="/v1/explain" />
      <P>
        Debug why memories were or weren't retrieved for a query. Shows the full 
        scoring breakdown for each result.
      </P>

      <H3>Request Body</H3>
      <Table
        headers={["Field", "Type", "Required", "Description"]}
        rows={[
          ["query", "string", "Yes", "Search query to explain"],
          ["memoryId", "string", "No", "Explain a specific memory"],
          ["threshold", "number", "No", "Custom threshold (default: 0.7)"],
          ["topK", "number", "No", "Max results to explain (default: 20)"],
        ]}
      />

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl -X POST "https://fathippo.ai/api/v1/explain" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "What timezone is the user in?"}'`}</CodeBlock>

      <H3>Response</H3>
      <CodeBlock language="json">{`{
  "query": "What timezone is the user in?",
  "threshold": 0.7,
  "results": [
    {
      "memoryId": "mem_abc123",
      "title": "User is based in Singapore",
      "score": 0.923,
      "vectorScore": 0.89,
      "entityBonus": 0.0,
      "feedbackBonus": 0.16,
      "accessBonus": 0.08,
      "included": true,
      "reason": "Score 0.923 >= threshold 0.7"
    },
    {
      "memoryId": "mem_xyz789",
      "title": "User prefers morning meetings",
      "score": 0.65,
      "vectorScore": 0.62,
      "entityBonus": 0.0,
      "feedbackBonus": 0.0,
      "accessBonus": 0.03,
      "included": false,
      "reason": "Score 0.650 < threshold 0.7"
    }
  ],
  "tokenEstimate": 45,
  "breakdown": {
    "vectorWeight": 1.0,
    "entityWeight": 0.06,
    "feedbackWeight": 0.08,
    "accessWeight": 0.01,
    "accessCap": 25
  }
}`}</CodeBlock>

      <Note type="tip">
        Use explain to understand why a memory isn't appearing in results. 
        If the vector score is low, the memory content may need to be rephrased.
        If bonuses are low, it may need more reinforcement.
      </Note>

      <Footer />
    </>
  );
}
