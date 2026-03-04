import { CodeBlock, Note, Table, Endpoint, H1, H2, H3, P, InlineCode, Footer } from "../../components";

export const metadata = {
  title: "Analytics API | Engrm Docs",
  description: "Track memory usage, session metrics, and token savings.",
};

export default function AnalyticsApiPage() {
  return (
    <>
      <H1>Analytics API</H1>
      <P>
        Track your memory usage, session performance, and token savings.
        Use analytics to understand the value Engrm provides.
      </P>

      <H2 id="summary">Quick Summary</H2>
      <Endpoint method="GET" path="/v1/analytics/summary" />
      <P>
        Get a quick overview of key metrics.
      </P>

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl "https://engrm.xyz/api/v1/analytics/summary" \\
  -H "Authorization: Bearer mem_your_api_key"`}</CodeBlock>

      <H3>Response</H3>
      <CodeBlock language="json">{`{
  "totalMemories": 247,
  "memoriesByTier": {
    "critical": 12,
    "high": 45,
    "normal": 190
  },
  "totalSessions": 156,
  "sessionsLast7Days": 23,
  "averageSessionLength": 342,
  "successRate": 0.87,
  "totalSearches": 1247,
  "searchesLast7Days": 189,
  "tokensEstimated": {
    "withoutEngrm": 45000,
    "withEngrm": 12000,
    "savings": 0.73
  }
}`}</CodeBlock>

      <H2 id="full">Full Analytics</H2>
      <Endpoint method="POST" path="/v1/analytics" />
      <P>
        Get detailed analytics with time-series data and breakdowns.
      </P>

      <H3>Request Body</H3>
      <Table
        headers={["Field", "Type", "Required", "Description"]}
        rows={[
          ["period", "string", "No", "7d | 30d | 90d (default: 30d)"],
          ["namespace", "string", "No", "Filter by namespace"],
          ["includeTimeSeries", "boolean", "No", "Include daily data points"],
        ]}
      />

      <H3>Example Request</H3>
      <CodeBlock language="bash">{`curl -X POST "https://engrm.xyz/api/v1/analytics" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"period": "30d", "includeTimeSeries": true}'`}</CodeBlock>

      <H3>Response</H3>
      <CodeBlock language="json">{`{
  "period": "30d",
  "memories": {
    "total": 247,
    "created": 34,
    "deleted": 5,
    "archived": 12,
    "byType": {
      "preference": 45,
      "fact": 89,
      "decision": 23,
      "identity": 12,
      "constraint": 8,
      "event": 70
    },
    "byTier": {
      "critical": 12,
      "high": 45,
      "normal": 190
    }
  },
  "sessions": {
    "total": 156,
    "thisMonth": 48,
    "averageDuration": 342,
    "averageTurns": 6.2,
    "outcomes": {
      "success": 135,
      "partial": 12,
      "failure": 4,
      "abandoned": 5
    }
  },
  "searches": {
    "total": 1247,
    "thisMonth": 412,
    "averageResultsReturned": 4.3,
    "topQueries": [
      {"query": "user preferences", "count": 45},
      {"query": "project decisions", "count": 32}
    ]
  },
  "tokens": {
    "estimatedWithoutEngrm": 45000,
    "estimatedWithEngrm": 12000,
    "savingsPercent": 73,
    "costSavingsEstimate": 1.65
  },
  "reinforcement": {
    "positive": 78,
    "negative": 12,
    "promotions": 8,
    "demotions": 2
  },
  "timeSeries": [
    {
      "date": "2026-03-01",
      "memoriesCreated": 3,
      "searches": 15,
      "sessions": 2
    },
    {
      "date": "2026-03-02",
      "memoriesCreated": 5,
      "searches": 22,
      "sessions": 4
    }
  ]
}`}</CodeBlock>

      <H2 id="token-savings">Token Savings Calculation</H2>
      <P>
        Engrm estimates token savings by comparing:
      </P>
      <ul className="list-disc list-inside text-zinc-400 space-y-2 mb-4">
        <li><strong>Without Engrm:</strong> Loading all memories into every session</li>
        <li><strong>With Engrm:</strong> Loading only critical + relevant memories</li>
      </ul>

      <CodeBlock language="text">{`Savings = 1 - (tokensWithEngrm / tokensWithoutEngrm)

Example:
- Total memory tokens: 15,000
- Critical tier: 500 tokens
- Average high tier per session: 300 tokens
- Sessions this month: 50

Without Engrm: 15,000 × 50 = 750,000 tokens
With Engrm: (500 + 300) × 50 = 40,000 tokens
Savings: 94.7%`}</CodeBlock>

      <Note type="tip">
        At $3/million tokens, saving 710,000 tokens saves ~$2.13/month.
        For high-volume agents, this adds up quickly.
      </Note>

      <H2 id="misses-analysis">Misses Analysis</H2>
      <P>
        Use the misses endpoint to identify gaps in your memory coverage:
      </P>
      <CodeBlock language="bash">{`# Get recent misses
curl "https://engrm.xyz/api/v1/memories/misses?limit=20" \\
  -H "Authorization: Bearer mem_your_api_key"`}</CodeBlock>

      <P>
        Common miss patterns indicate topics you should proactively store memories about.
      </P>

      <Footer />
    </>
  );
}
