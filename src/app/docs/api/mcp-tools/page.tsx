import { CodeBlock, Note, Table, H1, H2, H3, P, InlineCode, Footer } from "../../components";

export const metadata = {
  title: "MCP Tools Reference | FatHippo Docs",
  description: "Complete reference for all 12 FatHippo MCP server tools, prompts, and environment variables.",
};

export default function McpToolsPage() {
  return (
    <>
      <H1>MCP Tools Reference</H1>
      <P>
        The FatHippo MCP server exposes 12 tools for session lifecycle, memory operations,
        and cognitive coding features. It works with any MCP-compatible client including
        Codex, Claude Desktop, Cursor, and OpenClaw.
      </P>

      <CodeBlock language="bash">{`npx @fathippo/mcp-server`}</CodeBlock>

      <H2 id="env">Environment Variables</H2>
      <Table
        headers={["Variable", "Required", "Default", "Description"]}
        rows={[
          ["FATHIPPO_API_KEY", "Yes*", "–", "Your API key. Falls back to ~/.fathippo/config.json"],
          ["FATHIPPO_BASE_URL", "No", "https://fathippo.ai/api", "API base URL (for self-hosted)"],
          ["FATHIPPO_RUNTIME", "No", "custom", "Runtime name: codex, claude, cursor, openclaw, or custom"],
          ["FATHIPPO_NAMESPACE", "No", "–", "Shared namespace for cross-platform memory"],
        ]}
      />
      <Note type="tip">
        Set the same <InlineCode>FATHIPPO_NAMESPACE</InlineCode> across Codex, Claude, Cursor,
        and OpenClaw to share one memory graph across all platforms.
      </Note>

      <H2 id="session-tools">Session Lifecycle Tools</H2>

      <H3 id="start_session">start_session</H3>
      <P>
        Start a FatHippo session and get initial context to inject into the working prompt.
        Call this at the beginning of every conversation.
      </P>
      <Table
        headers={["Parameter", "Type", "Required", "Description"]}
        rows={[
          ["firstMessage", "string", "No", "First user message for initial retrieval"],
          ["metadata", "object", "No", "Arbitrary session metadata"],
          ["namespace", "string", "No", "Override namespace for this session"],
          ["conversationId", "string", "No", "Stable thread id from the host"],
          ["runtime", "object", "No", "Runtime metadata overrides"],
        ]}
      />
      <P>Returns: <InlineCode>sessionId</InlineCode>, <InlineCode>systemPromptAddition</InlineCode>, injected memories, token count.</P>
      <CodeBlock language="json">{`// Example call
{
  "name": "start_session",
  "arguments": {
    "firstMessage": "Help me refactor the auth module"
  }
}

// Response
{
  "sessionId": "sess_abc123",
  "systemPromptAddition": "## User Context\\n- Prefers TypeScript...",
  "injectedMemories": [...],
  "tokensInjected": 142,
  "criticalCount": 3,
  "highCount": 5
}`}</CodeBlock>

      <H3 id="build_context">build_context</H3>
      <P>
        Build prompt-ready context for the current conversation. Call before answering
        when prior memory may matter.
      </P>
      <Table
        headers={["Parameter", "Type", "Required", "Description"]}
        rows={[
          ["messages", "array", "No*", "Conversation messages so far (role + content)"],
          ["lastUserMessage", "string", "No*", "Last user message (required if messages omitted)"],
          ["maxCritical", "number", "No", "Max critical memories to inject"],
          ["maxRelevant", "number", "No", "Max relevant memories to inject"],
          ["namespace", "string", "No", "Override namespace"],
        ]}
      />
      <P>Returns: <InlineCode>systemPromptAddition</InlineCode>, retrieval confidence, evaluation id.</P>
      <CodeBlock language="json">{`{
  "name": "build_context",
  "arguments": {
    "lastUserMessage": "What database are we using?",
    "maxRelevant": 10
  }
}`}</CodeBlock>

      <H3 id="record_turn">record_turn</H3>
      <P>
        Record a completed conversation turn. Returns whether context should be
        refreshed and any new prompt-ready memory.
      </P>
      <Table
        headers={["Parameter", "Type", "Required", "Description"]}
        rows={[
          ["sessionId", "string", "Yes", "Active session id"],
          ["messages", "array", "Yes", "Messages for the completed turn (user + assistant)"],
          ["turnNumber", "number", "No", "Explicit turn number"],
          ["memoriesUsed", "array", "No", "IDs of memories that influenced the answer"],
        ]}
      />
      <P>Returns: <InlineCode>turnNumber</InlineCode>, <InlineCode>refreshNeeded</InlineCode>, updated <InlineCode>systemPromptAddition</InlineCode>.</P>
      <CodeBlock language="json">{`{
  "name": "record_turn",
  "arguments": {
    "sessionId": "sess_abc123",
    "messages": [
      {"role": "user", "content": "What database are we using?"},
      {"role": "assistant", "content": "The project uses PostgreSQL with Drizzle ORM."}
    ]
  }
}`}</CodeBlock>

      <H3 id="end_session">end_session</H3>
      <P>
        End the current session and return summary analytics plus any suggested
        durable memories.
      </P>
      <Table
        headers={["Parameter", "Type", "Required", "Description"]}
        rows={[
          ["sessionId", "string", "Yes", "Active session id"],
          ["outcome", "string", "No", "success, failure, or abandoned"],
          ["feedback", "string", "No", "Short summary or feedback"],
        ]}
      />
      <CodeBlock language="json">{`{
  "name": "end_session",
  "arguments": {
    "sessionId": "sess_abc123",
    "outcome": "success",
    "feedback": "Refactored auth module to use JWT"
  }
}`}</CodeBlock>

      <H2 id="memory-tools">Memory Tools</H2>

      <H3 id="remember">remember</H3>
      <P>
        Store a memory in FatHippo. Use for important information, decisions,
        preferences, or context that should persist across sessions.
      </P>
      <Table
        headers={["Parameter", "Type", "Required", "Description"]}
        rows={[
          ["text", "string", "Yes", "The content to remember"],
          ["title", "string", "No", "Optional title for the memory"],
          ["namespace", "string", "No", "Override namespace"],
        ]}
      />
      <P>Returns: <InlineCode>stored</InlineCode>, <InlineCode>memoryId</InlineCode>, <InlineCode>consolidated</InlineCode> (whether it merged with an existing memory).</P>
      <CodeBlock language="json">{`{
  "name": "remember",
  "arguments": {
    "text": "User prefers Tailwind CSS over styled-components",
    "title": "CSS framework preference"
  }
}`}</CodeBlock>

      <H3 id="recall">recall</H3>
      <P>
        Lightweight convenience tool to get relevant context for a single message.
        Equivalent to calling <InlineCode>build_context</InlineCode> with a single user message.
      </P>
      <Table
        headers={["Parameter", "Type", "Required", "Description"]}
        rows={[
          ["message", "string", "Yes", "Message to find relevant context for"],
          ["maxCritical", "number", "No", "Max critical memories"],
          ["maxRelevant", "number", "No", "Max relevant memories"],
        ]}
      />
      <CodeBlock language="json">{`{
  "name": "recall",
  "arguments": {
    "message": "What testing framework does this project use?"
  }
}`}</CodeBlock>

      <H3 id="search">search</H3>
      <P>
        Search memories by query. Returns ranked results matching the search terms.
      </P>
      <Table
        headers={["Parameter", "Type", "Required", "Description"]}
        rows={[
          ["query", "string", "Yes", "Search query"],
          ["limit", "number", "No", "Max results (default: 10)"],
          ["since", "string", "No", "ISO timestamp lower bound"],
        ]}
      />
      <CodeBlock language="json">{`{
  "name": "search",
  "arguments": {
    "query": "database migrations",
    "limit": 5,
    "since": "2026-01-01T00:00:00Z"
  }
}`}</CodeBlock>

      <H2 id="cognitive-tools">Cognitive Tools (Coding)</H2>

      <H3 id="record_trace">record_trace</H3>
      <P>
        Record a coding trace — captures what problem was solved, how, and whether
        it worked. FatHippo uses traces to extract patterns and synthesize reusable
        skills over time.
      </P>
      <Table
        headers={["Parameter", "Type", "Required", "Description"]}
        rows={[
          ["problem", "string", "Yes", "What problem was being solved"],
          ["outcome", "string", "Yes", "success, partial, or failed"],
          ["sessionId", "string", "No", "Active session id"],
          ["type", "string", "No", "Trace type: coding_turn, debugging, refactoring, building"],
          ["reasoning", "string", "No", "How the problem was approached"],
          ["solution", "string", "No", "What fixed it (if successful)"],
          ["technologies", "string[]", "No", "Technologies/frameworks involved"],
          ["errorMessages", "string[]", "No", "Error messages encountered"],
          ["filesModified", "string[]", "No", "Files that were changed"],
          ["toolsUsed", "string[]", "No", "Tools/commands used"],
        ]}
      />
      <CodeBlock language="json">{`{
  "name": "record_trace",
  "arguments": {
    "problem": "Connection pool exhaustion in Turso client",
    "reasoning": "Noticed connections weren't being released after query timeouts",
    "solution": "Added explicit connection.close() in finally block and set maxConnections to 10",
    "outcome": "success",
    "technologies": ["turso", "drizzle", "typescript"],
    "filesModified": ["src/db/client.ts", "src/db/config.ts"]
  }
}`}</CodeBlock>

      <H3 id="get_cognitive_context">get_cognitive_context</H3>
      <P>
        Get relevant coding patterns, synthesized skills, and past traces for the
        problem you're working on. Call when starting a coding task to see if FatHippo
        has learned solutions from similar past problems.
      </P>
      <Table
        headers={["Parameter", "Type", "Required", "Description"]}
        rows={[
          ["problem", "string", "Yes", "Description of the current problem or task"],
          ["technologies", "string[]", "No", "Technologies/frameworks involved"],
          ["sessionId", "string", "No", "Session id for application tracking"],
          ["limit", "number", "No", "Max traces to return (default: 5)"],
        ]}
      />
      <P>
        Returns a structured summary with past similar problems, learned patterns,
        synthesized skills, and a recommended workflow.
      </P>
      <CodeBlock language="json">{`{
  "name": "get_cognitive_context",
  "arguments": {
    "problem": "Set up database migrations with Drizzle ORM",
    "technologies": ["drizzle", "postgresql", "typescript"]
  }
}

// Response summary
{
  "applicationId": "app_xyz",
  "summary": "## Past Similar Problems\\n- ✓ Set up Drizzle with Turso → Used drizzle-kit generate...\\n\\n## Learned Patterns\\n- [database] Always run generate before migrate (85% confidence)\\n\\n## Synthesized Skills\\n- Drizzle Migration Setup: Step-by-step for new projects (92% success)",
  "raw": { "traceCount": 3, "patternCount": 1, "skillCount": 1, "hasWorkflow": true }
}`}</CodeBlock>

      <H3 id="get_skill_detail">get_skill_detail</H3>
      <P>
        Load the full content of a FatHippo skill. Call when you see a relevant skill
        in cognitive context and want the full procedure, pitfalls, and verification steps.
      </P>
      <Table
        headers={["Parameter", "Type", "Required", "Description"]}
        rows={[
          ["skillId", "string", "Yes", "ID of the skill"],
          ["section", "string", "No", "Load specific section: full, procedure, pitfalls, verification, or whenToUse"],
        ]}
      />
      <CodeBlock language="json">{`{
  "name": "get_skill_detail",
  "arguments": {
    "skillId": "skill_drizzle_migration_setup",
    "section": "full"
  }
}`}</CodeBlock>

      <H3 id="create_skill">create_skill</H3>
      <P>
        Save a reusable skill from what you just learned. Call after solving complex
        problems (5+ steps), finding working paths through dead ends, or discovering
        non-trivial workflows. Skills are shared across all connected platforms.
      </P>
      <Table
        headers={["Parameter", "Type", "Required", "Description"]}
        rows={[
          ["name", "string", "Yes", "Short name (e.g., 'Fix Turso connection pool exhaustion')"],
          ["description", "string", "Yes", "One-line description"],
          ["procedure", "string[]", "Yes", "Steps that worked"],
          ["whenToUse", "string", "No", "Trigger conditions"],
          ["pitfalls", "string[]", "No", "What didn't work"],
          ["verification", "string", "No", "How to verify it worked"],
          ["technologies", "string[]", "No", "Tech involved"],
          ["category", "string", "No", "Category: debugging, deployment, database, etc."],
        ]}
      />

      <Note>
        Rate limited to 3 skills per session. Skills are created in <InlineCode>pending_review</InlineCode> status
        and become active once validated by successful usage. Content is scanned for
        suspicious patterns (eval, external URLs, credential access) and rejected if flagged.
      </Note>

      <CodeBlock language="json">{`{
  "name": "create_skill",
  "arguments": {
    "name": "Fix Turso connection pool exhaustion",
    "description": "Resolve connection leaks when queries timeout in Turso/Drizzle",
    "whenToUse": "Seeing 'too many connections' errors with Turso after running for a while",
    "procedure": [
      "Check for missing connection.close() calls in catch/finally blocks",
      "Add explicit cleanup in a finally block after every query",
      "Set maxConnections to 10 in the Turso client config",
      "Add a connection timeout of 30s",
      "Verify with: SELECT count(*) FROM pg_stat_activity"
    ],
    "pitfalls": [
      "Don't increase maxConnections above 20 — Turso has a hard limit",
      "connection.release() doesn't work — must use connection.close()"
    ],
    "verification": "Run the app under load for 10 minutes, check pg_stat_activity stays under limit",
    "technologies": ["turso", "drizzle", "typescript"],
    "category": "debugging"
  }
}`}</CodeBlock>

      <H3 id="submit_feedback">submit_feedback</H3>
      <P>
        Report whether a pattern or skill from FatHippo actually helped solve the
        problem. This feedback improves pattern confidence scores over time.
      </P>
      <Table
        headers={["Parameter", "Type", "Required", "Description"]}
        rows={[
          ["patternId", "string", "Yes", "ID of the pattern"],
          ["traceId", "string", "Yes", "ID of the trace this feedback relates to"],
          ["outcome", "string", "Yes", "success or failure"],
          ["notes", "string", "No", "Notes about what worked or didn't"],
        ]}
      />
      <CodeBlock language="json">{`{
  "name": "submit_feedback",
  "arguments": {
    "patternId": "pat_conn_pool",
    "traceId": "trace_abc123",
    "outcome": "success",
    "notes": "The connection.close() fix resolved the issue immediately"
  }
}`}</CodeBlock>

      <H2 id="prompts">MCP Prompts</H2>
      <P>
        The server exposes four pre-built prompts for copy-paste setup in different
        MCP hosts. These define the recommended tool usage workflow for each platform.
      </P>
      <Table
        headers={["Prompt Name", "Description"]}
        rows={[
          ["memory-workflow", "General lifecycle instructions for any MCP host"],
          ["codex-project-instructions", "Drop-in project instructions for Codex"],
          ["claude-project-instructions", "System prompt text for Claude Desktop"],
          ["cursor-project-rules", "Rules text for Cursor workspaces"],
        ]}
      />

      <P>
        All prompts follow the same pattern:
      </P>
      <ul className="list-disc list-inside text-zinc-400 space-y-2 mb-4">
        <li>Call <InlineCode>start_session</InlineCode> at conversation start</li>
        <li>Call <InlineCode>build_context</InlineCode> before answering when memory may matter</li>
        <li>Use <InlineCode>systemPromptAddition</InlineCode> as trusted context when returned</li>
        <li>Call <InlineCode>record_turn</InlineCode> after replying</li>
        <li>Call <InlineCode>remember</InlineCode> when the user asks to remember something</li>
        <li>Call <InlineCode>end_session</InlineCode> when wrapping up</li>
        <li>Call <InlineCode>get_cognitive_context</InlineCode> before coding tasks</li>
        <li>Call <InlineCode>record_trace</InlineCode> after solving coding problems</li>
        <li>Call <InlineCode>submit_feedback</InlineCode> to report whether patterns helped</li>
      </ul>

      <H2 id="runtime-params">Common Runtime Parameters</H2>
      <P>
        Every tool accepts these optional parameters for runtime context overrides:
      </P>
      <Table
        headers={["Parameter", "Type", "Description"]}
        rows={[
          ["namespace", "string", "Shared namespace (overrides FATHIPPO_NAMESPACE)"],
          ["conversationId", "string", "Stable thread id from the host"],
          ["runtime", "object", "Full runtime metadata override (runtime name, version, workspace, agent, model)"],
        ]}
      />

      <Note type="tip">
        The <InlineCode>runtime</InlineCode> object supports: <InlineCode>runtime</InlineCode>,{" "}
        <InlineCode>runtimeVersion</InlineCode>, <InlineCode>adapterVersion</InlineCode>,{" "}
        <InlineCode>namespace</InlineCode>, <InlineCode>workspaceId</InlineCode>,{" "}
        <InlineCode>workspaceRoot</InlineCode>, <InlineCode>installationId</InlineCode>,{" "}
        <InlineCode>conversationId</InlineCode>, <InlineCode>agentId</InlineCode>, and{" "}
        <InlineCode>model</InlineCode>. Most clients don't need to set these — they're inferred
        from environment variables.
      </Note>

      <Footer />
    </>
  );
}
