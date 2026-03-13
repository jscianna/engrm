const API_BASE = 'https://www.fathippo.ai/api/v1';

export async function uploadMemories(memories, apiKey) {
  let uploaded = 0;
  
  for (const memory of memories) {
    try {
      const res = await fetch(`${API_BASE}/memories`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: memory.title,
          content: memory.content
        })
      });
      
      if (res.ok) {
        uploaded++;
      } else {
        const err = await res.json().catch(() => ({}));
        console.warn(`Failed to upload "${memory.title}": ${err.error || res.status}`);
      }
      
      // Rate limiting - small delay between uploads
      await new Promise(r => setTimeout(r, 100));
    } catch (err) {
      console.warn(`Failed to upload "${memory.title}": ${err.message}`);
    }
  }
  
  return uploaded;
}

export async function searchMemories(query, apiKey, limit = 5) {
  const res = await fetch(`${API_BASE}/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, limit })
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  
  return res.json();
}

export async function storeMemory(title, content, apiKey) {
  const res = await fetch(`${API_BASE}/memories`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title, content })
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  
  return res.json();
}

export function generateSkill(apiKey) {
  // Mask the API key for the skill file
  const maskedKey = apiKey.slice(0, 8) + '...' + apiKey.slice(-4);
  
  return `---
name: fathippo
description: Query FatHippo for persistent memory before answering questions about projects, decisions, preferences, or context that may have changed.
---

# FatHippo Memory Recall

**When to use:** Before answering questions about:
- Active projects and their current state
- Recent decisions or architecture changes
- User preferences or communication style
- Anything where your local context might be stale

## API Reference

**Endpoint:** \`https://www.fathippo.ai/api/v1/search\`
**API Key:** \`${maskedKey}\` (set FATHIPPO_API_KEY in environment)

### Search Memories

\`\`\`bash
curl -s -X POST "https://www.fathippo.ai/api/v1/search" \\
  -H "Authorization: Bearer $FATHIPPO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "YOUR SEARCH QUERY", "limit": 5}'
\`\`\`

### Store Memory

\`\`\`bash
curl -s -X POST "https://www.fathippo.ai/api/v1/memories" \\
  -H "Authorization: Bearer $FATHIPPO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Memory Title", "content": "Memory content"}'
\`\`\`

## Workflow

1. **Before answering:** If the question touches stored context, search first
2. **Parse results:** Extract relevant memories from the response
3. **Answer with confidence:** Now you have the latest context
4. **Store if new:** If you learn something important, store it back

## Token Budget

- Search returns ~500-1500 tokens for 5 memories
- More efficient than loading full context every session
- Use \`limit: 3\` for tighter context, \`limit: 10\` for broad recall
`;
}
