const ENGRM_API_URL = "https://www.engrm.xyz/api/v1";
const ENGRM_API_KEY = process.env.ENGRM_API_KEY || "mem_3e245c3069f3e096044577dfaf5a4e9c2f000bbaa73c7161";
const CONTEXT_FILE = `${process.env.HOME}/clawd/ENGRM_CONTEXT.md`;
const REFRESH_INTERVAL_MS = 5 * 60 * 1e3;
const SESSION_TIMEOUT_MS = 30 * 60 * 1e3;
const FETCH_TIMEOUT_MS = 5e3;
const conversationState = /* @__PURE__ */ new Map();
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
  /\bdogecat\b/i
];
const SKIP_PATTERNS = [
  /^(hi|hey|hello|thanks|ok|yes|no|sure|👍|okay)\.?$/i,
  /^\/\w+/
  // Commands like /status
];
function shouldFetchContext(content, conversationId) {
  const now = Date.now();
  const state = conversationState.get(conversationId);
  if (content.length < 5) return false;
  if (SKIP_PATTERNS.some((p) => p.test(content))) return false;
  if (!state || now - state.lastFetch > SESSION_TIMEOUT_MS) {
    return true;
  }
  if (TRIGGER_PATTERNS.some((p) => p.test(content))) {
    return true;
  }
  if (now - state.lastFetch > REFRESH_INTERVAL_MS && content.length > 50) {
    return true;
  }
  return false;
}
async function fetchEngrmContext(message, apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${ENGRM_API_URL}/simple/context`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      console.error(`[engrm] Context API error: ${response.status}`);
      return null;
    }
    const text = await response.text();
    return text || null;
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
const handler = async (event) => {
  if (event.type !== "message" || event.action !== "received") {
    return;
  }
  const content = event.context.content;
  if (!content) return;
  const conversationId = event.context.conversationId || event.sessionKey || "default";
  if (!shouldFetchContext(content, conversationId)) {
    const state = conversationState.get(conversationId);
    if (state) {
      state.messageCount++;
    }
    return;
  }
  const apiKey = ENGRM_API_KEY;
  if (!apiKey) {
    console.error("[engrm] ENGRM_API_KEY not set");
    return;
  }
  console.log(`[engrm] Fetching context for: "${content.slice(0, 50)}..."`);
  const context = await fetchEngrmContext(content, apiKey);
  conversationState.set(conversationId, {
    lastFetch: Date.now(),
    messageCount: (conversationState.get(conversationId)?.messageCount || 0) + 1
  });
  if (context) {
    try {
      const fs = await import("fs/promises");
      const contextMd = `# Engrm Memory Context

_Last updated: ${(/* @__PURE__ */ new Date()).toISOString()}_
_Triggered by: "${content.slice(0, 100)}${content.length > 100 ? "..." : ""}"_

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
var handler_default = handler;
export {
  handler_default as default
};
