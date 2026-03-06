/**
 * Engrm Memory Hook for OpenClaw
 * 
 * Smart context recall - only fetches when likely useful:
 * 1. First message of conversation (session start)
 * 2. Trigger keywords (remember, decided, project names)
 * 3. Time-based refresh (max once per 5 min unless triggered)
 */

interface HookEvent {
  type: string;
  action: string;
  sessionKey: string;
  timestamp: Date;
  messages: string[];
  context: {
    from?: string;
    content?: string;
    channelId?: string;
    conversationId?: string;
    [key: string]: unknown;
  };
}

const ENGRM_API_URL = "https://www.engrm.xyz/api/v1";
// Write to workspace so agent can see it in context
const CONTEXT_FILE = `${process.env.HOME}/clawd/ENGRM_CONTEXT.md`;

// Timing
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min = new session
const FETCH_TIMEOUT_MS = 5000; // 5 second timeout for API calls

// State tracking per conversation
const conversationState: Map<string, { lastFetch: number; messageCount: number }> = new Map();

// Trigger patterns - when to fetch context
const TRIGGER_PATTERNS = [
  /\bremember\b/i,
  /\bwhat did (we|i|you) decide/i,
  /\blike we (discussed|talked|said)/i,
  /\bpreviously\b/i,
  /\blast time\b/i,
  /\bwhat('s| is) (my|our|the) (preference|decision|approach)/i,
  // Project names (add your common ones)
  /\bengrm\b/i,
  /\bgnkscan\b/i,
  /\bgonka\b/i,
  /\bdogecat\b/i,
];

// Skip patterns - don't fetch for these
const SKIP_PATTERNS = [
  /^(hi|hey|hello|thanks|ok|yes|no|sure|👍|okay)\.?$/i,
  /^\/\w+/, // Commands like /status
];

function shouldFetchContext(content: string, conversationId: string): boolean {
  const now = Date.now();
  const state = conversationState.get(conversationId);
  
  // Skip very short or trivial messages
  if (content.length < 10) return false;
  if (SKIP_PATTERNS.some(p => p.test(content))) return false;
  
  // First message of conversation or session timeout
  if (!state || (now - state.lastFetch) > SESSION_TIMEOUT_MS) {
    return true;
  }
  
  // Trigger keywords always fetch
  if (TRIGGER_PATTERNS.some(p => p.test(content))) {
    return true;
  }
  
  // Time-based refresh (every 5 min if substantive message)
  if ((now - state.lastFetch) > REFRESH_INTERVAL_MS && content.length > 50) {
    return true;
  }
  
  return false;
}

async function fetchEngrmContext(message: string, apiKey: string): Promise<string | null> {
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  
  try {
    const response = await fetch(`${ENGRM_API_URL}/simple/context`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[engrm] Context API error: ${response.status}`);
      return null;
    }

    const data = await response.json() as { context?: string; memories?: unknown[] };
    return data.context || null;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[engrm] Context fetch timed out");
    } else {
      console.error(`[engrm] Context fetch failed:`, err instanceof Error ? err.message : err);
    }
    return null;
  }
}

const handler = async (event: HookEvent) => {
  // Only handle incoming messages
  if (event.type !== "message" || event.action !== "received") {
    return;
  }

  const content = event.context.content;
  if (!content) return;
  
  const conversationId = event.context.conversationId || event.sessionKey || "default";
  
  // Check if we should fetch
  if (!shouldFetchContext(content, conversationId)) {
    // Update message count but don't fetch
    const state = conversationState.get(conversationId);
    if (state) {
      state.messageCount++;
    }
    return;
  }

  // Get API key
  const apiKey = process.env.ENGRM_API_KEY;
  if (!apiKey) {
    console.error("[engrm] ENGRM_API_KEY not set");
    return;
  }

  // Fetch context
  console.log(`[engrm] Fetching context for: "${content.slice(0, 50)}..."`);
  const context = await fetchEngrmContext(content, apiKey);

  // Update state
  conversationState.set(conversationId, {
    lastFetch: Date.now(),
    messageCount: (conversationState.get(conversationId)?.messageCount || 0) + 1,
  });

  if (context) {
    // Write to context file with error handling
    try {
      const fs = await import("fs/promises");
      const contextMd = `# Engrm Memory Context

_Last updated: ${new Date().toISOString()}_
_Triggered by: "${content.slice(0, 100)}${content.length > 100 ? '...' : ''}"_

---

${context}
`;
      await fs.writeFile(CONTEXT_FILE, contextMd, "utf-8");
      console.log(`[engrm] Context written (${context.length} chars)`);
    } catch (err) {
      console.error(`[engrm] Failed to write context file:`, err instanceof Error ? err.message : err);
    }
  } else {
    console.log("[engrm] No relevant context found");
  }
};

export default handler;
