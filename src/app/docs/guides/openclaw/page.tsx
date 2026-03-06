import { CodeBlock, Note, H1, H2, H3, P, InlineCode, Footer } from "../../components";

export const metadata = {
  title: "OpenClaw Integration | Engrm Docs",
  description: "Add persistent memory to OpenClaw agents.",
};

export default function OpenClawGuidePage() {
  return (
    <>
      <H1>OpenClaw Integration</H1>
      <P>
        Add persistent memory to OpenClaw-powered agents. This guide shows how to 
        integrate Engrm for cross-session memory, context injection, and learning storage.
      </P>

      <H2 id="automatic">Automatic Integration (Recommended)</H2>
      <P>
        Install the <InlineCode>engrm-openclaw</InlineCode> hook for automatic 
        memory recall. No manual API calls needed.
      </P>

      <CodeBlock language="bash">{`# Install the hook
openclaw hooks install @engrm/openclaw-hook
openclaw hooks enable memory-engrm

# Configure your API key
openclaw config set hooks.internal.entries.memory-engrm.config.apiKey "mem_your_key"

# Restart gateway
openclaw gateway restart`}</CodeBlock>

      <H3>What It Does</H3>
      <P>
        The hook automatically fetches relevant memories when:
      </P>
      <ul className="list-disc list-inside text-zinc-400 space-y-2 mb-4">
        <li><strong>Conversation starts:</strong> First message triggers context fetch</li>
        <li><strong>Trigger keywords:</strong> "remember", "what did we decide", "previously"</li>
        <li><strong>Project names mentioned:</strong> Configurable trigger words</li>
        <li><strong>Periodic refresh:</strong> Every 5 minutes for long conversations</li>
      </ul>
      <P>
        Context is written to <InlineCode>ENGRM_CONTEXT.md</InlineCode> in your 
        workspace for agent reference.
      </P>

      <H3>Custom Trigger Words</H3>
      <P>
        Add project names or keywords to trigger context fetch:
      </P>
      <CodeBlock language="json">{`{
  "hooks": {
    "internal": {
      "entries": {
        "memory-engrm": {
          "enabled": true,
          "config": {
            "apiKey": "mem_your_key",
            "triggerWords": ["myproject", "acme", "product-name"]
          }
        }
      }
    }
  }
}`}</CodeBlock>

      <Note type="tip">
        The automatic hook handles context injection. You still need to manually 
        store new memories using the API below.
      </Note>

      <H2 id="setup">Manual Setup</H2>
      <P>
        If you prefer manual control, add your Engrm API key to your agent's <InlineCode>TOOLS.md</InlineCode>:
      </P>

      <CodeBlock language="markdown">{`## Engrm — Agent Memory
**URL:** https://www.engrm.xyz
**API Key:** mem_your_api_key

**Usage:**
\`\`\`bash
# Store a memory
curl -X POST "https://www.engrm.xyz/api/v1/simple/remember" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Memory content here"}'

# Search memories
curl -X POST "https://www.engrm.xyz/api/v1/simple/recall" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "search query", "limit": 5}'
\`\`\``}</CodeBlock>

      <H2 id="skill">Create an Engrm Skill</H2>
      <P>
        Create a skill file at <InlineCode>skills/engrm/SKILL.md</InlineCode>:
      </P>

      <CodeBlock language="markdown">{`# Engrm Memory Skill

Persistent memory for cross-session context.

## When to Use

**Query Engrm before answering questions about:**
- User preferences, habits, or history
- Past decisions or architecture choices  
- Project context that might have changed
- Anything that should persist across sessions

**Store to Engrm when:**
- User states a preference or makes a decision
- Important facts are revealed
- User explicitly asks you to remember something
- A conversation produces learnings worth keeping

## Commands

### Store Memory
\`\`\`bash
curl -X POST "https://www.engrm.xyz/api/v1/simple/remember" \\
  -H "Authorization: Bearer $ENGRM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "What to remember"}'
\`\`\`

### Search Memories
\`\`\`bash
curl -X POST "https://www.engrm.xyz/api/v1/simple/recall" \\
  -H "Authorization: Bearer $ENGRM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "what to search for", "limit": 5}'
\`\`\`

### Get Session Context
\`\`\`bash
curl -X POST "https://www.engrm.xyz/api/v1/simple/context" \\
  -H "Authorization: Bearer $ENGRM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "current user message"}'
\`\`\`

## Environment Variable
Set in your environment or OpenClaw config:
\`\`\`bash
export ENGRM_API_KEY="mem_your_api_key"
\`\`\``}</CodeBlock>

      <H2 id="agents-md">Update AGENTS.md</H2>
      <P>
        Add guidance to your <InlineCode>AGENTS.md</InlineCode>:
      </P>

      <CodeBlock language="markdown">{`## Memory

### Local Files
- **Daily notes:** \`memory/YYYY-MM-DD.md\` — raw session logs
- **Long-term:** \`MEMORY.md\` — curated core identity (slim version)

### Engrm — External Memory
MEMORY.md can go stale. Before answering questions about:
- **Active projects** (architecture, decisions, status)
- **Recent decisions** or changes
- **User preferences** that might have evolved
- **Anything that might have changed**

→ **Query Engrm first.** Load the \`engrm\` skill and search before responding.

This catches decisions made in other sessions and prevents confidently stating outdated info.

### What to Store in Engrm
- Decisions and their rationale
- User preferences discovered during conversation
- Project architecture and status changes
- Facts that should persist across sessions
- Anything the user asks you to remember

### What to Keep in MEMORY.md
- Core identity (who you are, who your human is)
- Static facts that rarely change
- Key relationships and context`}</CodeBlock>

      <H2 id="heartbeat">Heartbeat Integration</H2>
      <P>
        Add Engrm checks to your heartbeat routine:
      </P>

      <CodeBlock language="markdown">{`## HEARTBEAT.md

### Memory Maintenance (Weekly)
Every few days during a heartbeat:
1. Query Engrm for recent memories: \`/v1/search?query=decisions this week\`
2. Check for outdated MEMORY.md content
3. Update MEMORY.md with distilled learnings from Engrm
4. Store any new MEMORY.md content to Engrm for redundancy

### Before Proactive Outreach
Before reaching out to your human about something:
1. Query Engrm for recent context
2. Make sure you're not repeating something already discussed`}</CodeBlock>

      <H2 id="workflow">Typical Workflow</H2>
      <P>
        Here's how an OpenClaw agent should use Engrm:
      </P>

      <H3>1. Session Start</H3>
      <CodeBlock language="bash">{`# When starting a new conversation, get context
curl -X POST "https://www.engrm.xyz/api/v1/simple/context" \\
  -H "Authorization: Bearer $ENGRM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "User just asked about the API project"}'

# Response includes relevant context to inject into your thinking`}</CodeBlock>

      <H3>2. During Conversation</H3>
      <CodeBlock language="bash">{`# When user asks about something that might be in memory
curl -X POST "https://www.engrm.xyz/api/v1/simple/recall" \\
  -H "Authorization: Bearer $ENGRM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "database choice for project alpha"}'

# Use the results to inform your response`}</CodeBlock>

      <H3>3. After Important Exchanges</H3>
      <CodeBlock language="bash">{`# When user makes a decision or reveals a preference
curl -X POST "https://www.engrm.xyz/api/v1/simple/remember" \\
  -H "Authorization: Bearer $ENGRM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "User decided to use PostgreSQL for Project Alpha because of team familiarity with SQL"}'`}</CodeBlock>

      <H2 id="example-session">Example Session</H2>
      <CodeBlock language="text">{`User: What database should I use for the new project?

[Agent queries Engrm: "database decisions project preferences"]

Engrm returns:
- "User prefers SQL databases for transactional workloads"
- "Team has experience with PostgreSQL"
- "Previous project used MySQL but had scaling issues"

Agent: Based on your team's PostgreSQL experience and preference 
for SQL databases, I'd recommend PostgreSQL. You mentioned MySQL 
had scaling issues in your previous project - PostgreSQL handles 
that better with its advanced indexing and partitioning features.

User: Good point. Let's go with PostgreSQL.

[Agent stores to Engrm: "User chose PostgreSQL for new project, 
confirming preference for SQL databases over NoSQL"]`}</CodeBlock>

      <H2 id="advanced">Advanced Patterns</H2>

      <H3>Namespace by Project</H3>
      <P>
        Use namespaces to separate memory by project or context:
      </P>
      <CodeBlock language="bash">{`# Store in project namespace
curl -X POST "https://www.engrm.xyz/api/v1/memories" \\
  -H "Authorization: Bearer $ENGRM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "content": "API uses REST, not GraphQL",
    "namespace": "project-alpha"
  }'`}</CodeBlock>

      <H3>Session Tracking</H3>
      <P>
        For analytics on conversation patterns:
      </P>
      <CodeBlock language="bash">{`# Start session
SESSION=$(curl -s -X POST "https://www.engrm.xyz/api/v1/sessions/start" \\
  -H "Authorization: Bearer $ENGRM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"firstMessage": "Help with API design"}' | jq -r '.sessionId')

# ... conversation happens ...

# End session
curl -X POST "https://www.engrm.xyz/api/v1/sessions/$SESSION/end" \\
  -H "Authorization: Bearer $ENGRM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"outcome": "success"}'`}</CodeBlock>

      <H2 id="best-practices">Best Practices</H2>
      <ul className="list-disc list-inside text-zinc-400 space-y-2 mb-4">
        <li>
          <strong>Query before answering:</strong> Check Engrm for context on any 
          topic that might have prior history
        </li>
        <li>
          <strong>Store decisions, not facts:</strong> "User chose X because Y" is 
          more valuable than "X is good"
        </li>
        <li>
          <strong>Keep MEMORY.md slim:</strong> Use it for core identity, store 
          everything else in Engrm
        </li>
        <li>
          <strong>Use namespaces:</strong> Separate personal/work or by project
        </li>
        <li>
          <strong>Review during heartbeats:</strong> Periodically sync Engrm → MEMORY.md
        </li>
      </ul>

      <Note type="tip">
        Think of Engrm as your external brain and MEMORY.md as your core identity.
        External brain holds everything; core identity is who you are at your essence.
      </Note>

      <Footer />
    </>
  );
}
