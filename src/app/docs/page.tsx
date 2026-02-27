"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// Navigation sections
const NAV_SECTIONS = [
  { id: "quick-start", label: "Quick Start" },
  { id: "authentication", label: "Authentication" },
  { id: "storing-memories", label: "Storing Memories" },
  { id: "retrieving-memories", label: "Retrieving Memories" },
  { id: "heuristic-scoring", label: "Heuristic Scoring" },
  { id: "reinforcement", label: "Reinforcement" },
  { id: "memory-decay", label: "Memory Decay" },
  { id: "memory-types", label: "Memory Types" },
  { id: "zero-knowledge", label: "Zero-Knowledge" },
  { id: "mcp-server", label: "MCP Server" },
  { id: "python-sdk", label: "Python SDK" },
];

function CodeBlock({ children, language = "typescript" }: { children: string; language?: string }) {
  return (
    <div className="relative group">
      <pre className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 overflow-x-auto text-sm">
        <code className="text-zinc-300 font-mono">{children}</code>
      </pre>
      <button
        onClick={() => navigator.clipboard.writeText(children)}
        className="absolute top-2 right-2 px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded opacity-0 group-hover:opacity-100 transition-opacity"
      >
        Copy
      </button>
    </div>
  );
}

function Note({ children, type = "info" }: { children: React.ReactNode; type?: "info" | "warning" | "tip" }) {
  const styles = {
    info: "border-cyan-500/30 bg-cyan-500/5",
    warning: "border-amber-500/30 bg-amber-500/5",
    tip: "border-emerald-500/30 bg-emerald-500/5",
  };
  const labels = {
    info: "Note",
    warning: "Warning",
    tip: "Tip",
  };
  return (
    <div className={`border-l-4 ${styles[type]} p-4 rounded-r-lg my-4`}>
      <p className="text-sm font-semibold text-zinc-400 mb-1">{labels[type]}</p>
      <div className="text-zinc-300 text-sm">{children}</div>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto my-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800">
            {headers.map((h, i) => (
              <th key={i} className="text-left py-3 px-4 text-zinc-400 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/50">
              {row.map((cell, j) => (
                <td key={j} className="py-3 px-4 text-zinc-300">
                  {j === 0 ? <code className="text-cyan-400">{cell}</code> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("quick-start");

  useEffect(() => {
    const handleScroll = () => {
      const sections = NAV_SECTIONS.map((s) => document.getElementById(s.id));
      const scrollPos = window.scrollY + 100;

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section && section.offsetTop <= scrollPos) {
          setActiveSection(NAV_SECTIONS[i].id);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold">MEMRY</span>
            <span className="text-zinc-500 text-sm">docs</span>
          </Link>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/jscianna/memry"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-white transition-colors text-sm"
            >
              GitHub
            </a>
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-medium rounded-lg transition-colors text-sm"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="flex pt-16">
        {/* Sidebar */}
        <aside className="fixed left-0 top-16 w-64 h-[calc(100vh-4rem)] overflow-y-auto border-r border-zinc-800 bg-zinc-950 p-6">
          <nav className="space-y-1">
            {NAV_SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeSection === section.id
                    ? "bg-cyan-500/10 text-cyan-400 font-medium"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                }`}
              >
                {section.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 ml-64 px-12 py-12 max-w-4xl">
          {/* Quick Start */}
          <section id="quick-start" className="mb-16">
            <h1 className="text-4xl font-bold mb-4">Quick Start</h1>
            <p className="text-zinc-400 text-lg mb-8">
              Give your AI agent permanent, encrypted memory in under 5 minutes.
            </p>

            <h3 className="text-xl font-semibold mb-4">1. Create a Vault</h3>
            <p className="text-zinc-400 mb-4">
              Sign up at <a href="https://memry.ai" className="text-cyan-400 hover:underline">memry.ai</a>, 
              then create your encrypted vault with a password. Your password never leaves your device.
            </p>

            <h3 className="text-xl font-semibold mb-4 mt-8">2. Generate an API Key</h3>
            <p className="text-zinc-400 mb-4">
              In your dashboard, go to Settings → API Keys and create a new key for your agent.
            </p>

            <h3 className="text-xl font-semibold mb-4 mt-8">3. Store a Memory</h3>
            <CodeBlock>{`curl -X POST https://memry.ai/api/v1/memories \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "content": "User prefers dark theme and concise responses",
    "type": "preference",
    "importance": 8
  }'`}</CodeBlock>

            <h3 className="text-xl font-semibold mb-4 mt-8">4. Retrieve Context</h3>
            <CodeBlock>{`curl -X POST https://memry.ai/api/v1/context \\
  -H "Authorization: Bearer mem_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query_embedding": [0.1, 0.2, ...],
    "limit": 5
  }'`}</CodeBlock>

            <Note type="tip">
              For zero-knowledge retrieval, encrypt your content client-side before storing. 
              MEMRY never sees your plaintext—only encrypted blobs and embedding vectors.
            </Note>
          </section>

          {/* Authentication */}
          <section id="authentication" className="mb-16">
            <h2 className="text-3xl font-bold mb-4">Authentication</h2>
            <p className="text-zinc-400 mb-6">
              All API requests require a Bearer token. Generate API keys from your dashboard.
            </p>

            <CodeBlock>{`Authorization: Bearer mem_your_api_key`}</CodeBlock>

            <Table
              headers={["Header", "Required", "Description"]}
              rows={[
                ["Authorization", "Yes", "Bearer token with your API key"],
                ["Content-Type", "Yes", "application/json for POST requests"],
                ["X-Vault-Key", "Optional", "Encrypted vault key for ZK operations"],
              ]}
            />

            <Note>
              API keys are scoped to your account. Each key has an associated agent_id 
              for tracking which agent stored which memories.
            </Note>
          </section>

          {/* Storing Memories */}
          <section id="storing-memories" className="mb-16">
            <h2 className="text-3xl font-bold mb-4">Storing Memories</h2>
            <p className="text-zinc-400 mb-6">
              Store memories with automatic importance scoring, type detection, and reinforcement.
            </p>

            <h3 className="text-xl font-semibold mb-4">POST /api/v1/memories</h3>
            <CodeBlock>{`{
  "content": "User's timezone is Singapore (GMT+8)",
  "embedding": [0.1, 0.2, ...],  // 384-dim vector
  "type": "fact",                 // optional, auto-detected
  "importance": 7,                // optional, auto-scored
  "entities": ["Singapore"],      // optional, auto-extracted
  "namespace": "personal",        // optional, for organization
  "session_id": "sess_abc123"     // optional, for grouping
}`}</CodeBlock>

            <h3 className="text-xl font-semibold mb-4 mt-8">Response</h3>
            <CodeBlock>{`{
  "id": "mem_xyz789",
  "action": "created",      // or "reinforced"
  "strength": 1.0,
  "mentionCount": 1,
  "type": "fact",
  "importance": 7
}`}</CodeBlock>

            <Note type="tip">
              If you store a memory similar to one that already exists (cosine similarity &gt; 0.85), 
              MEMRY will <strong>reinforce</strong> the existing memory instead of creating a duplicate.
              This implements the "fire together, wire together" principle.
            </Note>

            <Table
              headers={["Field", "Type", "Description"]}
              rows={[
                ["content", "string", "Memory content (encrypted for ZK mode)"],
                ["embedding", "number[]", "384-dimensional embedding vector"],
                ["type", "MemoryType", "One of: constraint, identity, relationship, preference, how_to, fact, event"],
                ["importance", "number", "1-10 scale. Auto-scored if omitted"],
                ["entities", "string[]", "Named entities. Auto-extracted if omitted"],
                ["namespace", "string", "Project/namespace for organization"],
                ["session_id", "string", "Conversation session ID"],
                ["metadata", "object", "Arbitrary JSON metadata"],
              ]}
            />
          </section>

          {/* Retrieving Memories */}
          <section id="retrieving-memories" className="mb-16">
            <h2 className="text-3xl font-bold mb-4">Retrieving Memories</h2>
            <p className="text-zinc-400 mb-6">
              Retrieve relevant memories using vector similarity search. 
              Memories that are retrieved together strengthen their connections.
            </p>

            <h3 className="text-xl font-semibold mb-4">POST /api/v1/context</h3>
            <CodeBlock>{`{
  "query_embedding": [0.1, 0.2, ...],
  "limit": 10,
  "namespace": "personal",      // optional
  "min_strength": 0.3,          // optional, filter weak memories
  "types": ["fact", "preference"] // optional, filter by type
}`}</CodeBlock>

            <h3 className="text-xl font-semibold mb-4 mt-8">Response</h3>
            <CodeBlock>{`{
  "memories": [
    {
      "id": "mem_abc",
      "content": "<encrypted>",
      "type": "fact",
      "importance": 8,
      "strength": 1.2,
      "similarity": 0.89,
      "createdAt": "2026-02-27T10:00:00Z"
    }
  ],
  "co_retrieval_strengthened": 3  // edges strengthened
}`}</CodeBlock>

            <Note>
              When memories are retrieved together, MEMRY automatically strengthens the edges between them. 
              This creates an associative network where related memories surface together more often.
            </Note>
          </section>

          {/* Heuristic Scoring */}
          <section id="heuristic-scoring" className="mb-16">
            <h2 className="text-3xl font-bold mb-4">Heuristic Scoring</h2>
            <p className="text-zinc-400 mb-6">
              MEMRY scores memory importance using deterministic heuristics—no LLM required at extraction time.
              This keeps costs at zero while maintaining high accuracy.
            </p>

            <Table
              headers={["Signal", "Points", "Pattern Examples"]}
              rows={[
                ["Explicit markers", "+3.0", '"remember this", "my name is", "I prefer"'],
                ["Decision markers", "+2.0", '"decided", "going with", "committed to"'],
                ["Correction signals", "+1.5", '"actually", "no wait", "I meant"'],
                ["Emotional intensity", "+1.5", 'High arousal words, exclamations, ALL CAPS'],
                ["Temporal specificity", "+1.0", '"January 5th", "next Tuesday", "every morning"'],
                ["Causality", "+1.0", '"because", "therefore", "as a result"'],
                ["Task completion", "+1.0", '"done", "shipped", "finished", "failed"'],
                ["Entity density", "+2.0", 'Named entities per sentence'],
              ]}
            />

            <h3 className="text-xl font-semibold mb-4 mt-8">Scoring Formula</h3>
            <CodeBlock language="text">{`Final_Score = Base_Heuristic_Score (0-7) 
            + Context_Modifiers (0-2) 
            + Safety_Boost (0-2)
            
Type_Adjusted = Final_Score × Type_Multiplier

Threshold: ≥ 6.0 for storage`}</CodeBlock>

            <Note type="tip">
              Constraints with safety keywords ("allergic", "emergency", "deadline") get an automatic +2.0 boost.
              These memories are critical and should never be forgotten.
            </Note>
          </section>

          {/* Reinforcement */}
          <section id="reinforcement" className="mb-16">
            <h2 className="text-3xl font-bold mb-4">Reinforcement</h2>
            <p className="text-zinc-400 mb-6">
              Instead of deduplicating, MEMRY <strong>strengthens</strong> memories that are mentioned repeatedly.
              This mirrors how biological memory consolidation works.
            </p>

            <h3 className="text-xl font-semibold mb-4">Frequency Boost</h3>
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

            <h3 className="text-xl font-semibold mb-4 mt-8">Strength Update (EMA)</h3>
            <CodeBlock language="text">{`new_strength = (existing_strength × 0.7) + (trigger_intensity × 0.3)

trigger_intensity = heuristic_score / 10`}</CodeBlock>

            <Note>
              <strong>Example:</strong> User mentions their dog "Rex" 5 times across conversations.
              Memory strength: 0.6 → 0.84 → 0.97 → 1.08 → 1.13 (capped).
              Rex becomes highly resistant to decay.
            </Note>
          </section>

          {/* Memory Decay */}
          <section id="memory-decay" className="mb-16">
            <h2 className="text-3xl font-bold mb-4">Memory Decay</h2>
            <p className="text-zinc-400 mb-6">
              Memories that aren't accessed fade over time, following an Ebbinghaus-inspired forgetting curve.
              Access resets the decay clock.
            </p>

            <h3 className="text-xl font-semibold mb-4">Decay Formula</h3>
            <CodeBlock language="text">{`current_strength = base_strength × (0.9 ^ (days_since_access / halflife))`}</CodeBlock>

            <h3 className="text-xl font-semibold mb-4 mt-8">Type-Specific Halflives</h3>
            <Table
              headers={["Memory Type", "Halflife", "Rationale"]}
              rows={[
                ["constraint", "180 days", "Safety-critical, persists longest"],
                ["how_to", "120 days", "Procedural knowledge, slow decay"],
                ["identity", "120 days", "Core self-concept, stable"],
                ["fact", "90 days", "Encyclopedic knowledge"],
                ["preference", "60 days", "Tastes can change"],
                ["relationship", "30 days", "Social data needs maintenance"],
                ["event", "14 days", "Episodic memories fade fast"],
              ]}
            />

            <h3 className="text-xl font-semibold mb-4 mt-8">Pruning Strategy</h3>
            <ul className="list-disc list-inside text-zinc-400 space-y-2">
              <li>Strength drops below 0.3 → Memory enters <strong>Limbic Archive</strong> (soft delete)</li>
              <li>30 days in archive without access → <strong>Hard delete</strong> (true forgetting)</li>
              <li>Retrieval resets the decay clock to zero</li>
              <li>3+ retrievals in a week → +50% halflife boost (consolidation)</li>
            </ul>
          </section>

          {/* Memory Types */}
          <section id="memory-types" className="mb-16">
            <h2 className="text-3xl font-bold mb-4">Memory Types</h2>
            <p className="text-zinc-400 mb-6">
              Each memory type has different scoring multipliers and decay rates, optimized for its use case.
            </p>

            <Table
              headers={["Type", "Multiplier", "Halflife", "Use Case"]}
              rows={[
                ["constraint", "1.3×", "180 days", "Hard limits, allergies, deadlines, must-nots"],
                ["identity", "1.2×", "120 days", "Self-concept, roles, core values"],
                ["relationship", "1.1×", "30 days", "Social graph, colleagues, connections"],
                ["preference", "1.0×", "60 days", "Likes, dislikes, tastes"],
                ["how_to", "1.0×", "120 days", "Procedures, workflows, recipes"],
                ["fact", "0.9×", "90 days", "Objective knowledge, properties"],
                ["event", "0.8×", "14 days", "Specific occurrences, episodes"],
              ]}
            />

            <Note type="warning">
              <strong>Safety Rule:</strong> Constraints containing medical/danger keywords 
              ("allergic", "emergency contact", "diabetic") always receive a +2.0 importance boost.
            </Note>
          </section>

          {/* Zero-Knowledge */}
          <section id="zero-knowledge" className="mb-16">
            <h2 className="text-3xl font-bold mb-4">Zero-Knowledge Architecture</h2>
            <p className="text-zinc-400 mb-6">
              MEMRY is designed so the server <strong>never</strong> sees your plaintext data.
              All encryption and embedding happens client-side.
            </p>

            <h3 className="text-xl font-semibold mb-4">What MEMRY Sees</h3>
            <Table
              headers={["Component", "Server Access", "Notes"]}
              rows={[
                ["Memory content", "❌ No", "Only encrypted ciphertext"],
                ["Embedding vectors", "✅ Yes", "Used for similarity search"],
                ["Memory metadata", "✅ Yes", "Type, importance, timestamps"],
                ["Vault password", "❌ No", "Never leaves your device"],
                ["Arweave wallet", "❌ No", "Encrypted with your vault key"],
              ]}
            />

            <h3 className="text-xl font-semibold mb-4 mt-8">Encryption Flow</h3>
            <CodeBlock language="text">{`1. Agent extracts memory from conversation
2. Agent scores importance (heuristics run locally)
3. Agent generates embedding (local ONNX model)
4. Agent encrypts content with vault key (AES-256-GCM)
5. Agent sends encrypted blob + embedding to MEMRY
6. MEMRY stores without decryption capability`}</CodeBlock>

            <Note type="tip">
              The MCP Server and Python SDK handle encryption automatically.
              Just provide your vault password at initialization.
            </Note>
          </section>

          {/* MCP Server */}
          <section id="mcp-server" className="mb-16">
            <h2 className="text-3xl font-bold mb-4">MCP Server</h2>
            <p className="text-zinc-400 mb-6">
              The MEMRY MCP Server integrates with Claude Desktop and other MCP-compatible agents.
            </p>

            <h3 className="text-xl font-semibold mb-4">Installation</h3>
            <CodeBlock language="bash">{`npm install -g @memry/mcp-server`}</CodeBlock>

            <h3 className="text-xl font-semibold mb-4 mt-8">Configuration (Claude Desktop)</h3>
            <CodeBlock>{`{
  "mcpServers": {
    "memry": {
      "command": "memry-mcp",
      "args": [],
      "env": {
        "MEMRY_API_KEY": "mem_your_api_key",
        "MEMRY_VAULT_PASSWORD": "your_vault_password"
      }
    }
  }
}`}</CodeBlock>

            <h3 className="text-xl font-semibold mb-4 mt-8">Available Tools</h3>
            <Table
              headers={["Tool", "Description"]}
              rows={[
                ["memry_store", "Store an encrypted memory"],
                ["memry_search", "Search memories by semantic similarity"],
                ["memry_context", "Get relevant context for a query"],
                ["memry_list", "List recent memories"],
                ["memry_delete", "Delete a memory by ID"],
              ]}
            />
          </section>

          {/* Python SDK */}
          <section id="python-sdk" className="mb-16">
            <h2 className="text-3xl font-bold mb-4">Python SDK</h2>
            <p className="text-zinc-400 mb-6">
              The Python SDK provides full ZK encryption with local embeddings via FastEmbed.
            </p>

            <h3 className="text-xl font-semibold mb-4">Installation</h3>
            <CodeBlock language="bash">{`pip install memry-sdk`}</CodeBlock>

            <h3 className="text-xl font-semibold mb-4 mt-8">Usage</h3>
            <CodeBlock language="python">{`from memry import MemryClient

client = MemryClient(
    api_key="mem_your_api_key",
    vault_password="your_vault_password"
)

# Store a memory (auto-encrypted, auto-embedded)
client.store(
    content="User prefers dark theme",
    memory_type="preference"
)

# Retrieve context
memories = client.context(
    query="What are the user's UI preferences?",
    limit=5
)

for mem in memories:
    print(f"{mem.type}: {mem.content}")`}</CodeBlock>

            <Note>
              The Python SDK uses <code>fastembed</code> for local ONNX embeddings.
              No API calls to external embedding services—everything runs locally.
            </Note>
          </section>

          {/* Footer */}
          <footer className="border-t border-zinc-800 pt-8 mt-16">
            <p className="text-zinc-500 text-sm">
              Built by <a href="https://web3.com" className="text-cyan-400 hover:underline">Web3.com Ventures</a>.
              Open source on <a href="https://github.com/jscianna/memry" className="text-cyan-400 hover:underline">GitHub</a>.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
