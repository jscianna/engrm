import { CodeBlock, Note, Table, H1, H2, H3, P, InlineCode, Footer } from "../components";

export const metadata = {
  title: "Core Concepts | Engrm Docs",
  description: "Understand memory tiers, decay, reinforcement, namespaces, and encryption in Engrm.",
};

export default function ConceptsPage() {
  return (
    <>
      <H1>Core Concepts</H1>
      <P>
        Engrm is designed to work like human memory—important things stick, 
        irrelevant things fade, and frequently accessed memories get stronger.
        Here's how it works.
      </P>

      <H2 id="memory-tiers">Memory Tiers</H2>
      <P>
        Not all memories are equal. Engrm uses a tiered system to prioritize what 
        gets injected into context windows.
      </P>

      <Table
        headers={["Tier", "Description", "When Injected"]}
        rows={[
          ["critical", "Core principles, identity, must-never-forget", "Always injected at session start"],
          ["working", "Synthesized summaries of related memories", "Injected when relevant (synthesize mode)"],
          ["high", "Important facts, strong preferences, decisions", "Injected when relevant to query"],
          ["normal", "Regular memories, facts, events", "Injected only if highly relevant"],
        ]}
      />

      <Note type="tip">
        Critical memories are your agent's "identity layer"—things like user name, 
        timezone, core preferences. These are always available, never decay.
      </Note>

      <H3 id="auto-promotion">Auto-Promotion</H3>
      <P>
        Memories can be promoted automatically based on access patterns:
      </P>
      <ul className="list-disc list-inside text-zinc-400 space-y-2 mb-4">
        <li><strong>normal → high:</strong> Accessed 5+ times</li>
        <li><strong>high → critical:</strong> Accessed 10+ times with positive feedback</li>
      </ul>
      <P>
        You can also manually promote memories using the <InlineCode>/v1/memories/{"{id}"}/lock</InlineCode> endpoint.
      </P>

      <H2 id="memory-types">Memory Types</H2>
      <P>
        Engrm auto-classifies memories into types, each with different decay rates:
      </P>

      <Table
        headers={["Type", "Halflife", "Examples"]}
        rows={[
          ["identity", "365 days (never deleted)", "Name, location, role, values"],
          ["constraint", "180 days", "Allergies, hard limits, must-nots"],
          ["how_to", "120 days", "Procedures, workflows, preferences"],
          ["decision", "90 days", "Choices made, architecture decisions"],
          ["fact", "90 days", "Objective knowledge, properties"],
          ["preference", "60 days", "Likes, dislikes, stylistic preferences"],
          ["relationship", "30 days", "People, colleagues, social context"],
          ["event", "14 days", "Specific occurrences, meetings, episodes"],
          ["belief", "45 days", "Opinions, perspectives, viewpoints"],
        ]}
      />

      <H2 id="reinforcement">Reinforcement</H2>
      <P>
        When something is mentioned multiple times, it becomes a stronger memory.
        This mirrors the "fire together, wire together" principle in neuroscience.
      </P>

      <H3>Frequency Boost</H3>
      <Table
        headers={["Mention Count", "Strength Multiplier"]}
        rows={[
          ["1st mention", "1.0× (base)"],
          ["2nd mention", "1.4× (+40%)"],
          ["3rd-5th mention", "+20% each"],
          ["6th+ mention", "+5% each (logarithmic)"],
          ["Maximum", "2.5× cap"],
        ]}
      />

      <H3>Explicit Feedback</H3>
      <P>
        Use the <InlineCode>/v1/memories/{"{id}"}/reinforce</InlineCode> endpoint to give explicit feedback:
      </P>
      <CodeBlock language="json">{`// Positive reinforcement (+1)
{"value": 1, "reason": "This was helpful"}

// Negative reinforcement (-1)  
{"value": -1, "reason": "This was outdated"}`}</CodeBlock>

      <Note>
        Explicit feedback is weighted 5× more than passive access. One positive 
        reinforcement equals 5 passive retrievals.
      </Note>

      <H2 id="memory-decay">Memory Decay</H2>
      <P>
        Memories that aren't accessed fade over time, following an Ebbinghaus-inspired 
        forgetting curve. This keeps your memory store clean and relevant.
      </P>

      <H3>Decay Formula</H3>
      <CodeBlock language="text">{`current_strength = base_strength × (0.9 ^ (days_since_access / halflife))`}</CodeBlock>

      <H3>Lifecycle</H3>
      <ul className="list-disc list-inside text-zinc-400 space-y-2 mb-4">
        <li><strong>Auto-archive:</strong> 90 days without access → archived (searchable, deprioritized)</li>
        <li><strong>Auto-delete:</strong> Strength drops below 0.20 (~210 days of neglect)</li>
        <li><strong>Identity protection:</strong> Identity memories never auto-delete</li>
        <li><strong>Retrieval = strengthening:</strong> Every recall bumps strength back up</li>
      </ul>

      <Note type="warning">
        Archived memories aren't gone—they're still searchable. They just won't be 
        proactively injected into context. Think of it like moving old files to cold storage.
      </Note>

      <H2 id="namespaces">Namespaces</H2>
      <P>
        Namespaces let you organize memories by project, chat, or any logical grouping.
        Memories in different namespaces are isolated from each other.
      </P>

      <CodeBlock language="bash">{`# Store in a specific namespace
curl -X POST "https://fathippo.ai/api/v1/memories" \\
  -H "Authorization: Bearer mem_..." \\
  -H "Content-Type: application/json" \\
  -d '{"content": "Project uses PostgreSQL", "namespace": "project-alpha"}'`}</CodeBlock>

      <H3>Global Namespace</H3>
      <P>
        Identity memories (detected automatically) are stored in a special <InlineCode>__global__</InlineCode> namespace.
        These are available in ALL namespaces—your agent always knows who the user is.
      </P>

      <H3>Layered Search</H3>
      <P>
        Every search automatically queries both the current namespace AND the global namespace.
        Results are merged and ranked by relevance.
      </P>

      <H2 id="sessions">Sessions</H2>
      <P>
        Sessions track conversations over time. They help Engrm understand:
      </P>
      <ul className="list-disc list-inside text-zinc-400 space-y-2 mb-4">
        <li>Which memories were used in which conversations</li>
        <li>How long conversations last</li>
        <li>Success/failure rates (for analytics)</li>
        <li>When to refresh context mid-conversation</li>
      </ul>

      <H3>Session Lifecycle</H3>
      <CodeBlock language="text">{`1. POST /v1/sessions/start
   → Returns sessionId + initial context (critical + relevant high memories)

2. POST /v1/sessions/{id}/turn (optional, per message pair)
   → Tracks memory usage, returns refresh signal every 5 turns

3. POST /v1/sessions/{id}/end
   → Closes session, records outcome, updates analytics`}</CodeBlock>

      <Note type="tip">
        Sessions are optional for simple use cases. Use <InlineCode>/v1/simple/*</InlineCode> endpoints 
        if you just want remember/recall without session tracking.
      </Note>

      <H2 id="encryption">Encryption Model</H2>
      <P>
        All memory content is encrypted at rest using AES-256-GCM with per-user keys.
        This protects your data against database breaches.
      </P>

      <H3>How It Works</H3>
      <ul className="list-disc list-inside text-zinc-400 space-y-2 mb-4">
        <li>You send plaintext content to the API</li>
        <li>Engrm generates embeddings for semantic search</li>
        <li>Content is encrypted with your user-specific key</li>
        <li>Encrypted content is stored in the database</li>
        <li>On retrieval, content is decrypted server-side</li>
      </ul>

      <H3>What's Protected</H3>
      <Table
        headers={["Threat", "Protected?"]}
        rows={[
          ["Database breach", "✅ Yes — content encrypted at rest"],
          ["SQL injection", "✅ Yes — attacker gets encrypted data only"],
          ["Network interception", "✅ Yes — HTTPS required"],
          ["API key compromise", "❌ No — protect your API keys!"],
        ]}
      />

      <Note type="warning">
        Protect your API keys! Anyone with your key can read your memories.
        Generate separate keys for different agents and revoke them if compromised.
      </Note>

      <H2 id="consolidation">Smart Consolidation</H2>
      <P>
        When you store a memory similar to one that already exists (cosine similarity &gt; 0.85),
        Engrm suggests consolidation instead of creating duplicates.
      </P>

      <CodeBlock language="json">{`// Response when similar memory exists
{
  "status": "consolidation_suggested",
  "newMemory": { "text": "User prefers REST APIs" },
  "similarMemories": [
    {
      "id": "mem_abc",
      "text": "User chose REST over GraphQL",
      "similarity": 0.89
    }
  ],
  "hint": "Add ?force=true to create anyway"
}`}</CodeBlock>

      <P>
        The simple API (<InlineCode>/v1/simple/remember</InlineCode>) auto-consolidates at 
        similarity &gt; 0.90, merging content into the existing memory.
      </P>

      <Footer />
    </>
  );
}
