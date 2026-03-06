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
    workspaceDir?: string;
    cfg?: {
      hooks?: {
        internal?: {
          entries?: {
            "memory-engrm"?: {
              config?: {
                apiKey?: string;
                triggerWords?: string[];
              };
            };
          };
        };
      };
    };
    [key: string]: unknown;
  };
}

const ENGRM_API_URL = "https://www.engrm.xyz/api/v1";

// Timing
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min = new session
const FETCH_TIMEOUT_MS = 5000; // 5 second timeout

// State tracking per conversation
const conversationState: Map<string, { lastFetch: number; messageCount: number }> = new Map();

// Default trigger patterns
const DEFAULT_TRIGGER_PATTERNS = [
  /\bremember\b/i,
  /\bwhat did (we|i|you) decide/i,
  /\blike we (discussed|talked|said)/i,
  /\bpreviously\b/i,
  /\blast time\b/i,
  /\bwhat('s| is) (my|our|the) (preference|decision|approach)/i,
];

// Skip patterns
const SKIP_PATTERNS = [
  /^(hi|hey|hello|thanks|ok|yes|no|sure|👍|okay)\.?$/i,
  /^\/\w+/, // Commands
];

function buildTriggerPatterns(customWords?: string[]): RegExp[] {
  const patterns = [...DEFAULT_TRIGGER_PATTERNS];
  if (customWords?.length) {
    for (const word of customWords) {
      patterns.push(new RegExp(`\\b${word}\\b`, "i"));
    }
  }
  return patterns;
}

function shouldFetchContext(content: string, conversationId: string, triggerPatterns: RegExp[]): boolean {
  const now = Date.now();
  const state = conversationState.get(conversationId);
  
  if (content.length < 5) return false;
  if (SKIP_PATTERNS.some(p => p.test(content))) return false;
  
  // First message or session timeout
  if (!state || (now - state.lastFetch) > SESSION_TIMEOUT_MS) {
    return true;
  }
  
  // Trigger keywords
  if (triggerPatterns.some(p => p.test(content))) {
    return true;
  }
  
  // Time-based refresh for substantive messages
  if ((now - state.lastFetch) > REFRESH_INTERVAL_MS && content.length > 50) {
    return true;
  }
  
  return false;
}

async function fetchEngrmContext(message: string, apiKey: string): Promise<string | null> {
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

    return await response.text();
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
  if (event.type !== "message" || event.action !== "received") {
    return;
  }

  const content = event.context.content;
  if (!content) return;
  
  // Get API key from config
  const hookConfig = event.context.cfg?.hooks?.internal?.entries?.["memory-engrm"]?.config;
  const apiKey = hookConfig?.apiKey || process.env.ENGRM_API_KEY;
  
  if (!apiKey) {
    console.error("[engrm] API key not configured. Run: openclaw config set hooks.internal.entries.memory-engrm.config.apiKey YOUR_KEY");
    return;
  }

  const conversationId = event.context.conversationId || event.sessionKey || "default";
  const triggerPatterns = buildTriggerPatterns(hookConfig?.triggerWords);
  
  if (!shouldFetchContext(content, conversationId, triggerPatterns)) {
    const state = conversationState.get(conversationId);
    if (state) state.messageCount++;
    return;
  }

  console.log(`[engrm] Fetching context for: "${content.slice(0, 50)}..."`);
  const context = await fetchEngrmContext(content, apiKey);

  conversationState.set(conversationId, {
    lastFetch: Date.now(),
    messageCount: (conversationState.get(conversationId)?.messageCount || 0) + 1,
  });

  if (context) {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      
      // Write to workspace or home
      const workspaceDir = event.context.workspaceDir || process.env.HOME || "/tmp";
      const contextFile = path.join(workspaceDir, "ENGRM_CONTEXT.md");
      
      const contextMd = `# Engrm Memory Context

_Last updated: ${new Date().toISOString()}_
_Triggered by: "${content.slice(0, 100)}${content.length > 100 ? '...' : ''}"_

---

${context}
`;
      await fs.writeFile(contextFile, contextMd, "utf-8");
      console.log(`[engrm] Context written to ${contextFile}`);
    } catch (err) {
      console.error(`[engrm] Failed to write context:`, err instanceof Error ? err.message : err);
    }
  } else {
    console.log("[engrm] No relevant context found");
  }
};

export default handler;
