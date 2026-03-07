import { CodeBlock, Note, Table, Endpoint, H1, H2, H3, P, InlineCode, Footer } from "../../components";

export const metadata = {
  title: "Search API | FatHippo Docs",
  description: "Semantic search across your memories with relevance scoring.",
};

export default function SearchApiPage() {
  return (
    <>
      <H1>Search API</H1>
      <P>
        Perform semantic search across your memories. Results are ranked by a 
        combination of vector similarity, entity overlap, feedback score, and access frequency.
      </P>

      <H2 id="search">Semantic Search</H2>
      <Endpoint method="POST" path="/v1/search" />
      <P>
        Search memories using natural language. The query is embedded and compared 
        against stored memory embeddings.
      </P>

      <H3>Request Body</H3>
      <Table
        headers={["Field", "Type", "Required", "Description"]}
        rows={[
          ["query", "string", "Yes", "Natural language search query"],
          ["topK", "number", "No", "Number of results (default: 10, max: 50)"],
          ["namespace", "string", "No", "Filter by namespace"],
          ["since", "ISO date", "No", "Filter by creation date"],
        ]}
      />

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl -X POST "https://fathippo.ai/api/v1/search" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "What database does the user prefer?", "topK": 5}'`}</CodeBlock>

      <H3>Response</H3>
      <CodeBlock language="json">{`[
  {
    "id": "mem_abc123",
    "score": 0.923,
    "vectorScore": 0.89,
    "provenance": {
      "source": "api",
      "createdAt": "2026-03-01T10:00:00Z"
    },
    "memory": {
      "id": "mem_abc123",
      "title": "User prefers PostgreSQL",
      "text": "User decided to use PostgreSQL for the new project because of team familiarity",
      "memoryType": "decision",
      "importanceTier": "high",
      "entities": ["PostgreSQL"],
      "accessCount": 8,
      "feedbackScore": 2,
      "createdAt": "2026-03-01T10:00:00Z"
    }
  }
]`}</CodeBlock>

      <H2 id="scoring">Relevance Scoring</H2>
      <P>
        The final score is calculated from multiple factors:
      </P>

      <CodeBlock language="text">{`score = vectorScore 
      + (entityOverlap × 0.06) 
      + (feedbackScore × 0.08)
      + (min(accessCount, 25) × 0.01)`}</CodeBlock>

      <Table
        headers={["Factor", "Weight", "Description"]}
        rows={[
          ["Vector Similarity", "1.0", "Cosine similarity between query and memory embeddings"],
          ["Entity Overlap", "0.06", "Number of shared named entities"],
          ["Feedback Score", "0.08", "Net positive/negative reinforcement"],
          ["Access Count", "0.01", "Times retrieved (capped at 25)"],
        ]}
      />

      <Note type="tip">
        Memories that are frequently accessed and have positive feedback will 
        rank higher, even with slightly lower vector similarity. This creates 
        a feedback loop where useful memories become easier to find.
      </Note>

      <H2 id="side-effects">Side Effects</H2>
      <P>
        Each search automatically:
      </P>
      <ul className="list-disc list-inside text-zinc-400 space-y-2 mb-4">
        <li>Increments <InlineCode>accessCount</InlineCode> for returned memories</li>
        <li>Records search hit patterns for analytics</li>
        <li>Triggers auto-promotion checks (normal → high tier)</li>
      </ul>
      <P>
        This means memories get stronger the more they're retrieved—similar to 
        how human recall strengthens neural pathways.
      </P>

      <H2 id="provenance">Provenance</H2>
      <P>
        Each result includes provenance information showing where the memory came from:
      </P>
      <Table
        headers={["Source", "Description"]}
        rows={[
          ["api", "Created via API"],
          ["pdf", "Extracted from uploaded PDF"],
          ["url", "Extracted from ingested URL"],
          ["mcp", "Created via MCP server"],
        ]}
      />

      <Footer />
    </>
  );
}
