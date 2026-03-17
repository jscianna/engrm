import { CodeBlock, Note, Table, Endpoint, H1, H2, H3, P, InlineCode, Footer } from "../components";

export const metadata = {
  title: "API Overview | FatHippo Docs",
  description: "Complete API reference for FatHippo memory infrastructure.",
};

export default function ApiOverviewPage() {
  return (
    <>
      <H1>API Reference</H1>
      <P>
        All API requests use <InlineCode>https://fathippo.ai/api/v1</InlineCode> as the base URL
        and require authentication via Bearer token.
      </P>

      <H2 id="authentication">Authentication</H2>
      <P>
        Include your API key in the Authorization header:
      </P>
      <CodeBlock language="bash">{`Authorization: Bearer mem_your_api_key`}</CodeBlock>

      <Table
        headers={["Header", "Required", "Description"]}
        rows={[
          ["Authorization", "Yes", "Bearer token with your API key"],
          ["Content-Type", "Yes (POST)", "application/json for POST requests"],
        ]}
      />

      <H2 id="endpoints">Endpoint Overview</H2>

      <H3>Core Memory Operations</H3>
      <div className="space-y-2">
        <Endpoint method="POST" path="/v1/memories" description="Store a memory" />
        <Endpoint method="GET" path="/v1/memories" description="List memories" />
        <Endpoint method="GET" path="/v1/memories/{id}" description="Get single memory" />
        <Endpoint method="DELETE" path="/v1/memories/{id}" description="Delete memory" />
        <Endpoint method="POST" path="/v1/search" description="Semantic search" />
      </div>

      <H3>Context & Sessions</H3>
      <div className="space-y-2">
        <Endpoint method="POST" path="/v1/context" description="Get session context" />
        <Endpoint method="POST" path="/v1/context/refresh" description="Refresh mid-conversation" />
        <Endpoint method="POST" path="/v1/sessions/start" description="Start session" />
        <Endpoint method="POST" path="/v1/sessions/{id}/turn" description="Record turn" />
        <Endpoint method="POST" path="/v1/sessions/{id}/end" description="End session" />
      </div>

      <H3>Intelligence</H3>
      <div className="space-y-2">
        <Endpoint method="POST" path="/v1/memories/{id}/reinforce" description="Feedback" />
        <Endpoint method="POST" path="/v1/memories/{id}/lock" description="Lock tier" />
        <Endpoint method="POST" path="/v1/memories/miss" description="Log miss" />
        <Endpoint method="GET" path="/v1/memories/misses" description="Get misses" />
        <Endpoint method="POST" path="/v1/extract" description="Extract from conversation" />
        <Endpoint method="POST" path="/v1/explain" description="Debug retrieval" />
      </div>

      <H3>Simple API</H3>
      <div className="space-y-2">
        <Endpoint method="POST" path="/v1/simple/remember" description="Store (auto-everything)" />
        <Endpoint method="POST" path="/v1/simple/recall" description="Search (text only)" />
        <Endpoint method="POST" path="/v1/simple/context" description="Get injectable string" />
      </div>

      <H3>Cognitive (Coding)</H3>
      <div className="space-y-2">
        <Endpoint method="POST" path="/v1/cognitive/traces" description="Record coding trace" />
        <Endpoint method="POST" path="/v1/cognitive/traces/relevant" description="Get cognitive context" />
        <Endpoint method="GET" path="/v1/cognitive/skills/{id}" description="Get skill detail" />
        <Endpoint method="POST" path="/v1/cognitive/skills" description="Create skill" />
        <Endpoint method="POST" path="/v1/cognitive/patterns/feedback" description="Submit pattern feedback" />
      </div>

      <H3>MCP Server</H3>
      <P>
        The FatHippo MCP server wraps all session, memory, and cognitive endpoints into 12
        tools for use with Codex, Claude Desktop, Cursor, and OpenClaw.
        See the <a href="/docs/api/mcp-tools" className="text-cyan-400 hover:underline">MCP Tools Reference</a> for
        full documentation.
      </P>

      <H3>Analytics</H3>
      <div className="space-y-2">
        <Endpoint method="POST" path="/v1/analytics" description="Full analytics" />
        <Endpoint method="GET" path="/v1/analytics/summary" description="Quick stats" />
      </div>

      <H2 id="errors">Error Handling</H2>
      <P>
        All errors return a consistent JSON format:
      </P>
      <CodeBlock language="json">{`{
  "error": "VALIDATION_ERROR",
  "message": "Field 'query' is required",
  "details": { "field": "query", "reason": "required" }
}`}</CodeBlock>

      <Table
        headers={["Error Code", "HTTP Status", "Description"]}
        rows={[
          ["UNAUTHORIZED", "401", "Missing or invalid API key"],
          ["FORBIDDEN", "403", "API key doesn't have required scope"],
          ["NOT_FOUND", "404", "Resource not found"],
          ["VALIDATION_ERROR", "400", "Invalid request body or parameters"],
          ["MEMORY_NOT_FOUND", "404", "Memory ID doesn't exist"],
          ["SESSION_NOT_FOUND", "404", "Session ID doesn't exist"],
          ["RATE_LIMITED", "429", "Too many requests"],
          ["INTERNAL_ERROR", "500", "Server error"],
        ]}
      />

      <H2 id="pagination">Pagination</H2>
      <P>
        List endpoints support pagination via <InlineCode>limit</InlineCode> and <InlineCode>since</InlineCode> parameters:
      </P>
      <CodeBlock language="bash">{`GET /v1/memories?limit=50&since=2026-03-01T00:00:00Z`}</CodeBlock>

      <H2 id="rate-limits">Rate Limits</H2>
      <Table
        headers={["Plan", "Requests/min", "Memories", "Searches/mo"]}
        rows={[
          ["Free", "60", "1,000", "10,000"],
          ["Pro", "300", "Unlimited", "Unlimited"],
          ["Enterprise", "Custom", "Custom", "Custom"],
        ]}
      />

      <Note type="info">
        Rate limit headers are included in every response:
        <InlineCode>X-RateLimit-Remaining</InlineCode> and <InlineCode>X-RateLimit-Reset</InlineCode>.
      </Note>

      <Footer />
    </>
  );
}
