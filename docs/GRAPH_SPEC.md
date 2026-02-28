# Memory Graph Specification

## Goal
Add persistent graph relationships between memories, with typed edges, temporal reasoning, and visualization. This makes Engrm competitive with Supermemory's graph features while maintaining our zero-knowledge and permanence advantages.

## Database Schema

### New Table: `memory_edges`

```sql
CREATE TABLE IF NOT EXISTS memory_edges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  weight REAL DEFAULT 1.0,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE,
  UNIQUE(source_id, target_id, relationship_type)
);

CREATE INDEX idx_edges_user ON memory_edges(user_id);
CREATE INDEX idx_edges_source ON memory_edges(source_id);
CREATE INDEX idx_edges_target ON memory_edges(target_id);
```

### Relationship Types

| Type | Description | Example |
|------|-------------|---------|
| `similar` | High semantic similarity (auto-detected) | Two notes about React hooks |
| `updates` | Newer memory supersedes older | "Actually the meeting is at 3pm" updates "Meeting at 2pm" |
| `contradicts` | Memories conflict | Two different opinions on same topic |
| `extends` | Adds detail to existing memory | Follow-up note with more info |
| `derives_from` | Synthesized/summarized from source | Weekly summary derives from daily notes |
| `references` | Explicit citation/link | Note that links to another |

## API Endpoints

### Create Edge
```
POST /api/memories/edges
Body: { sourceId, targetId, relationshipType, weight?, metadata? }
Response: { edge }
```

### List Edges for Memory
```
GET /api/memories/[id]/edges
Response: { incoming: Edge[], outgoing: Edge[] }
```

### Delete Edge
```
DELETE /api/memories/edges/[edgeId]
```

### Get Graph (for visualization)
```
GET /api/memories/graph?limit=100
Response: { nodes: Memory[], edges: Edge[] }
```

## Dream Cycle Integration

Update `runDreamCycle()` to:
1. Return existing persisted bonds alongside new suggestions
2. Add `saveBond(bondSuggestion)` function that persists to `memory_edges`
3. Auto-create `similar` edges for bonds with score > 0.85

### New Dream Cycle Actions

The Dream Cycle card should have action buttons:
- **"Save Bond"** - Persists a suggested bond as a `similar` edge
- **"Save All Bonds"** - Batch persist all suggestions above threshold
- **"Dismiss"** - Hide suggestion (don't persist)

## Graph Visualization

### New Route: `/dashboard/graph`

D3.js force-directed graph showing:
- **Nodes**: Memories (sized by importance, colored by type)
- **Edges**: Relationships (colored by type, thickness by weight)
- **Interactions**:
  - Click node → open memory detail
  - Hover → show title + relationship type
  - Drag to reposition
  - Zoom/pan
  - Filter by relationship type

### Component: `src/components/memory-graph.tsx`

```tsx
interface MemoryGraphProps {
  nodes: Array<{
    id: string;
    title: string;
    memoryType: string;
    importance: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    relationshipType: string;
    weight: number;
  }>;
}
```

Use `d3-force` for layout, render with SVG or Canvas.

## Temporal Reasoning

### Memory Supersession

When a memory is marked as `updates` another:
1. The older memory gets a visual indicator (strikethrough or "superseded" badge)
2. Search results prefer the newer memory
3. Context endpoint returns only the latest version

### Contradiction Detection

When storing a new memory:
1. Run similarity search
2. If high similarity (>0.9) + different content, flag as potential contradiction
3. Prompt user: "This seems to contradict [older memory]. Create contradiction link?"

## UI Updates

### Memory Detail Page

Add "Relationships" section showing:
- Incoming edges (memories that reference this one)
- Outgoing edges (memories this one references)
- "Add Relationship" button to manually link memories

### Memory List/Search

Add relationship indicators:
- 🔗 icon if memory has edges
- "Superseded" badge if memory has been updated by another

## Implementation Order

1. **Database**: Add `memory_edges` table in `src/lib/db.ts`
2. **CRUD**: Add edge functions in `src/lib/db.ts` (createEdge, getEdgesForMemory, deleteEdge, getGraph)
3. **API Routes**: Create `/api/memories/edges/` and `/api/memories/graph`
4. **Dream Cycle**: Update to show "Save Bond" buttons, persist on click
5. **Graph Viz**: Create `/dashboard/graph` with D3 force layout
6. **Memory Detail**: Add relationships section
7. **Auto-detection**: Add contradiction/update detection on memory create

## Files to Create/Modify

### Create:
- `src/app/api/memories/edges/route.ts` - CRUD for edges
- `src/app/api/memories/[id]/edges/route.ts` - Get edges for specific memory  
- `src/app/api/memories/graph/route.ts` - Get full graph
- `src/app/dashboard/graph/page.tsx` - Graph visualization page
- `src/components/memory-graph.tsx` - D3 graph component
- `src/components/relationship-badge.tsx` - Edge type badges
- `src/components/add-relationship-modal.tsx` - Manual edge creation

### Modify:
- `src/lib/db.ts` - Add edges table + CRUD functions
- `src/lib/dream-cycle.ts` - Add saveBond function, return existing edges
- `src/components/dream-cycle-card.tsx` - Add "Save Bond" buttons
- `src/app/dashboard/memory/[id]/page.tsx` - Add relationships section
- `src/components/memory-card.tsx` - Add relationship indicator

## Success Criteria

1. ✅ Edges persist in database
2. ✅ Dream Cycle can save suggested bonds
3. ✅ Graph visualization renders nodes + edges
4. ✅ Memory detail shows relationships
5. ✅ Manual edge creation works
6. ✅ Edges respect zero-knowledge (edge metadata encrypted if memory is encrypted)
7. ✅ Build passes, no TypeScript errors
