import { CodeBlock, Note, H1, H2, H3, P, InlineCode, Footer } from "../../components";

export const metadata = {
  title: "OpenClaw Integration | FatHippo Docs",
  description: "Add persistent memory to OpenClaw agents.",
};

export default function OpenClawGuidePage() {
  return (
    <>
      <H1>OpenClaw Integration</H1>
      <P>
        Add persistent memory to OpenClaw-powered agents. This guide shows how to
        connect FatHippo after OpenClaw is already part of your workflow, then let it quietly improve recall,
        workflows, and repeated fixes over time.
      </P>

      <H2 id="plugin">Plugin Installation (Recommended)</H2>
      <P>
        OpenClaw users only install <InlineCode>@fathippo/fathippo-context-engine</InlineCode>. The other Fathippo packages are
        developer boundaries, not separate end-user installs.
      </P>

      <H3>Hosted Mode</H3>
      <CodeBlock language="bash">{`# Install the plugin
openclaw plugins install @fathippo/fathippo-context-engine

# Set as context engine
openclaw config set plugins.slots.contextEngine=fathippo-context-engine

# Configure hosted mode
openclaw config set plugins.entries.fathippo-context-engine.config.mode=hosted
openclaw config set plugins.entries.fathippo-context-engine.config.apiKey=mem_your_key
openclaw config set plugins.entries.fathippo-context-engine.config.baseUrl=https://fathippo.ai/api
openclaw config set plugins.entries.fathippo-context-engine.config.injectCritical=true

# Restart
openclaw gateway restart`}</CodeBlock>

      <H3>Local-Only Mode (No API Key)</H3>
      <CodeBlock language="bash">{`# Install the plugin
openclaw plugins install @fathippo/fathippo-context-engine

# Set as context engine
openclaw config set plugins.slots.contextEngine=fathippo-context-engine

# Configure local mode
openclaw config set plugins.entries.fathippo-context-engine.config.mode=local

# Restart
openclaw gateway restart`}</CodeBlock>

      <Note type="tip">
        Hosted mode reports the plugin version back to your FatHippo dashboard and unlocks hosted cognition, sync,
        and import features. Local-only mode stays private, does not send version telemetry to the hosted dashboard,
        and only uses lightweight on-device learning stored locally on disk. If you used the older
        <InlineCode>@fathippo/context-engine</InlineCode> package, reinstall from
        <InlineCode>@fathippo/fathippo-context-engine</InlineCode> so OpenClaw discovers the matching plugin id cleanly.
      </Note>

      <H3>Features</H3>
      <ul className="list-disc list-inside text-zinc-400 space-y-2 mb-4">
        <li><strong>Per-turn context injection:</strong> Retrieves relevant memories for each user turn</li>
        <li><strong>Auto-capture:</strong> Stores useful user insights while filtering noise</li>
        <li><strong>Dream Cycle compaction:</strong> Hosted mode uses FatHippo synthesis on compaction</li>
        <li><strong>Subagent context handoff:</strong> Preserves context across spawned agents</li>
        <li><strong>Storage:</strong> Hosted mode uses your FatHippo account; local mode stores private data in its configured local file.</li>
      </ul>

      <H3>Configuration Options</H3>
      <CodeBlock language="json">{`{
  "plugins": {
    "slots": {
      "contextEngine": "fathippo-context-engine"
    },
    "entries": {
      "fathippo-context-engine": {
        "enabled": true,
        "config": {
          "apiKey": "mem_your_key",
          "mode": "hosted",
          "injectCritical": true,
          "injectLimit": 20,
          "captureUserOnly": true,
          "dreamCycleOnCompact": true,
          "hippoNodsEnabled": true
        }
      }
    }
  }
}`}</CodeBlock>

      <Note type="tip">
        With the plugin installed, your agent automatically remembers and recalls. When FatHippo materially helps, OpenClaw can occasionally use a subtle 🦛 acknowledgement without interrupting the flow.
      </Note>

      <H2 id="setup">Manual Setup (Alternative)</H2>
      <P>
        If you prefer manual control, add your FatHippo API key to your agent&apos;s <InlineCode>TOOLS.md</InlineCode>:
      </P>

      <CodeBlock language="markdown">{`## FatHippo — Agent Memory
**URL:** https://www.fathippo.ai
**API Key:** mem_your_api_key

**Usage:**
\`\`\`bash
# Store a memory
curl -X POST "https://www.fathippo.ai/api/v1/simple/remember" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Memory content here"}'

# Search memories
curl -X POST "https://www.fathippo.ai/api/v1/simple/recall" \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "search query", "limit": 5}'
\`\`\``}</CodeBlock>

      <H2 id="skill">Create an FatHippo Skill</H2>
      <P>
        Create a skill file at <InlineCode>skills/fathippo/SKILL.md</InlineCode>:
      </P>

      <CodeBlock language="markdown">{`# FatHippo Memory Skill

Persistent memory for cross-session context.

## When to Use

**Query FatHippo before answering questions about:**
- User preferences, habits, or history
- Past decisions or architecture choices  
- Project context that might have changed
- Anything that should persist across sessions

**Store to FatHippo when:**
- User states a preference or makes a decision
- Important facts are revealed
- User explicitly asks you to remember something
- A conversation produces learnings worth keeping

## Commands

### Store Memory
\`\`\`bash
curl -X POST "https://www.fathippo.ai/api/v1/simple/remember" \\
  -H "Authorization: Bearer $FATHIPPO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "What to remember"}'
\`\`\`

### Search Memories
\`\`\`bash
curl -X POST "https://www.fathippo.ai/api/v1/simple/recall" \\
  -H "Authorization: Bearer $FATHIPPO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "what to search for", "limit": 5}'
\`\`\`

### Get Session Context
\`\`\`bash
curl -X POST "https://www.fathippo.ai/api/v1/simple/context" \\
  -H "Authorization: Bearer $FATHIPPO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "current user message"}'
\`\`\`

## Environment Variable
Set in your environment or OpenClaw config:
\`\`\`bash
export FATHIPPO_API_KEY="mem_your_api_key"
\`\`\``}</CodeBlock>

      <H2 id="agents-md">Update AGENTS.md</H2>
      <P>
        Add guidance to your <InlineCode>AGENTS.md</InlineCode>:
      </P>

      <CodeBlock language="markdown">{`## Memory

### Local Files
- **Daily notes:** \`memory/YYYY-MM-DD.md\` — raw session logs
- **Long-term:** \`MEMORY.md\` — curated core identity (slim version)

### FatHippo — External Memory
MEMORY.md can go stale. Before answering questions about:
- **Active projects** (architecture, decisions, status)
- **Recent decisions** or changes
- **User preferences** that might have evolved
- **Anything that might have changed**

→ **Query FatHippo first.** Load the \`fathippo\` skill and search before responding.

This catches decisions made in other sessions and prevents confidently stating outdated info.

### What to Store in FatHippo
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
        Add FatHippo checks to your heartbeat routine:
      </P>

      <CodeBlock language="markdown">{`## HEARTBEAT.md

### Memory Maintenance (Weekly)
Every few days during a heartbeat:
1. Query FatHippo for recent memories: \`/v1/search?query=decisions this week\`
2. Check for outdated MEMORY.md content
3. Update MEMORY.md with distilled learnings from FatHippo
4. Store any new MEMORY.md content to FatHippo for redundancy

### Before Proactive Outreach
Before reaching out to your human about something:
1. Query FatHippo for recent context
2. Make sure you're not repeating something already discussed`}</CodeBlock>

      <H2 id="workflow">Typical Workflow</H2>
      <P>
        Here&apos;s how an OpenClaw agent should use FatHippo:
      </P>

      <H3>1. Session Start</H3>
      <CodeBlock language="bash">{`# When starting a new conversation, get context
curl -X POST "https://www.fathippo.ai/api/v1/simple/context" \\
  -H "Authorization: Bearer $FATHIPPO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "User just asked about the API project"}'

# Response includes relevant context to inject into your thinking`}</CodeBlock>

      <H3>2. During Conversation</H3>
      <CodeBlock language="bash">{`# When user asks about something that might be in memory
curl -X POST "https://www.fathippo.ai/api/v1/simple/recall" \\
  -H "Authorization: Bearer $FATHIPPO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "database choice for project alpha"}'

# Use the results to inform your response`}</CodeBlock>

      <H3>3. After Important Exchanges</H3>
      <CodeBlock language="bash">{`# When user makes a decision or reveals a preference
curl -X POST "https://www.fathippo.ai/api/v1/simple/remember" \\
  -H "Authorization: Bearer $FATHIPPO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "User decided to use PostgreSQL for Project Alpha because of team familiarity with SQL"}'`}</CodeBlock>

      <H2 id="example-session">Example Session</H2>
      <CodeBlock language="text">{`User: What database should I use for the new project?

[Agent queries FatHippo: "database decisions project preferences"]

FatHippo returns:
- "User prefers SQL databases for transactional workloads"
- "Team has experience with PostgreSQL"
- "Previous project used MySQL but had scaling issues"

Agent: Based on your team's PostgreSQL experience and preference 
for SQL databases, I'd recommend PostgreSQL. You mentioned MySQL 
had scaling issues in your previous project - PostgreSQL handles 
that better with its advanced indexing and partitioning features.

User: Good point. Let's go with PostgreSQL.

[Agent stores to FatHippo: "User chose PostgreSQL for new project, 
confirming preference for SQL databases over NoSQL"]`}</CodeBlock>

      <H2 id="advanced">Advanced Patterns</H2>

      <H3>Namespace by Project</H3>
      <P>
        Use namespaces to separate memory by project or context:
      </P>
      <CodeBlock language="bash">{`# Store in project namespace
curl -X POST "https://www.fathippo.ai/api/v1/memories" \\
  -H "Authorization: Bearer $FATHIPPO_API_KEY" \\
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
SESSION=$(curl -s -X POST "https://www.fathippo.ai/api/v1/sessions/start" \\
  -H "Authorization: Bearer $FATHIPPO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"firstMessage": "Help with API design"}' | jq -r '.sessionId')

# ... conversation happens ...

# End session
curl -X POST "https://www.fathippo.ai/api/v1/sessions/$SESSION/end" \\
  -H "Authorization: Bearer $FATHIPPO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"outcome": "success"}'`}</CodeBlock>

      <H2 id="best-practices">Best Practices</H2>
      <ul className="list-disc list-inside text-zinc-400 space-y-2 mb-4">
        <li>
          <strong>Query before answering:</strong> Check FatHippo for context on any 
          topic that might have prior history
        </li>
        <li>
          <strong>Store decisions, not facts:</strong> &quot;User chose X because Y&quot; is 
          more valuable than &quot;X is good&quot;
        </li>
        <li>
          <strong>Keep MEMORY.md slim:</strong> Use it for core identity, store 
          everything else in FatHippo
        </li>
        <li>
          <strong>Use namespaces:</strong> Separate personal/work or by project
        </li>
        <li>
          <strong>Review during heartbeats:</strong> Periodically sync FatHippo → MEMORY.md
        </li>
      </ul>

      <Note type="tip">
        Think of FatHippo as your external brain and MEMORY.md as your core identity.
        External brain holds everything; core identity is who you are at your essence.
      </Note>

      <Footer />
    </>
  );
}
