# Spec: Port Landing Page Brain to Real Authenticated Data

## Problem
The landing page `/brain` shows a beautiful 3D brain visualization with fake demo data.
The dashboard `/dashboard/brain` shows real user data but is behind auth.

**UX Gap:** User sees amazing demo → signs in → sees their actual data. But the landing page brain doesn't show real data even if user is already logged in.

## Goal
Make the landing page `/brain` use real authenticated data when the user is logged in.

## Implementation

### 1. Update `/app/brain/page.tsx`

**Current:**
- Always generates fake demo data via `generateDemoData()`
- Shows 108 fake memories with artificial type-based edges

**After:**
- Check if user is authenticated (use Clerk's `useAuth()` or similar)
- If authenticated: fetch real data from `/api/memories/graph?limit=200&full=true`
- If not authenticated: show existing demo data

### 2. Code Changes

```tsx
// Add at top
import { useAuth } from "@clerk/nextjs";

// In component
const { isSignedIn, isLoaded } = useAuth();
const [loading, setLoading] = useState(true);

useEffect(() => {
  async function loadData() {
    if (!isLoaded) return;
    
    if (isSignedIn) {
      // Fetch real data
      try {
        const response = await fetch("/api/memories/graph?limit=200&full=true");
        const payload = await response.json();
        
        if (response.ok && payload.nodes) {
          // Convert API format to Brain3D format (same as dashboard/brain/page.tsx)
          const brainNodes = payload.nodes.map((n, i) => {
            const phi = Math.acos(-1 + (2 * i) / payload.nodes.length);
            const theta = Math.sqrt(payload.nodes.length * Math.PI) * phi;
            const radius = 60 + Math.random() * 40;
            const isSynthesis = n.nodeType === "synthesis";
            
            return {
              id: n.id,
              x: radius * Math.sin(phi) * Math.cos(theta),
              y: radius * Math.sin(phi) * Math.sin(theta),
              z: radius * Math.cos(phi),
              vx: 0, vy: 0, vz: 0,
              type: n.memoryType || "fact",
              nodeType: n.nodeType,
              strength: 0.7 + Math.random() * 0.3,
              importance: (n.importance ?? 5) / 10,
              title: n.title,
              radius: isSynthesis ? 8 + (n.sourceCount ?? 0) * 0.5 : 4 + ((n.importance ?? 5) / 10) * 4,
            };
          });
          
          const brainEdges = payload.edges.map(e => ({
            source: e.source,
            target: e.target,
            weight: e.weight,
            type: e.edgeType,
          }));
          
          setNodes(brainNodes);
          setEdges(brainEdges);
          setStats({ ... });
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error("Failed to load real data, falling back to demo", err);
      }
    }
    
    // Fallback: use demo data
    const { nodes: demoNodes, edges: demoEdges } = generateDemoData();
    setNodes(demoNodes);
    setEdges(demoEdges);
    setStats({ ... });
    setLoading(false);
  }
  
  loadData();
}, [isLoaded, isSignedIn]);
```

### 3. UI Changes

- Add loading state while fetching
- Update "DEMO" badge to "YOUR BRAIN" or "LIVE" when showing real data
- Update footer note from "This is demo data • Sign in to see your real memories" to something relevant

### 4. Keep Demo Data Clean

The demo data generator is fine as-is. It provides a realistic preview for non-authenticated users.

## Files to Modify
- `src/app/brain/page.tsx` - Main changes

## Testing
1. Load `/brain` when logged out → should see demo data
2. Load `/brain` when logged in → should see real memories
3. Click nodes → should show real memory details
4. Navigation should work (View Memory button)

## Notes
- Use same conversion logic as `/dashboard/brain/page.tsx` for consistency
- Handle empty state (new user with no memories) gracefully
- Keep the "Neural Activity" simulation running regardless of data source
