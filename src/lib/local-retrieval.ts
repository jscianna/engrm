export type LocalRetrievalResult = {
  hit: boolean;
  memoryIds: string[];
  confidence: number;
};

type CacheEntry = {
  memoryIds: string[];
  confidence: number;
  updatedAt: number;
};

const MAX_ENTRIES_PER_USER = 200;
const TTL_MS = 15 * 60 * 1000;

const cache = new Map<string, Map<string, CacheEntry>>();

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

function tokenize(query: string): string[] {
  return normalizeQuery(query)
    .split(" ")
    .filter((t) => t.length > 2)
    .slice(0, 24);
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

function getUserCache(userId: string): Map<string, CacheEntry> {
  const existing = cache.get(userId);
  if (existing) return existing;
  const created = new Map<string, CacheEntry>();
  cache.set(userId, created);
  return created;
}

export async function localRetrieve(query: string, userId: string): Promise<LocalRetrievalResult> {
  const userCache = getUserCache(userId);
  const key = normalizeQuery(query);
  const now = Date.now();

  const direct = userCache.get(key);
  if (direct && now - direct.updatedAt <= TTL_MS) {
    return { hit: true, memoryIds: direct.memoryIds, confidence: direct.confidence };
  }

  const qTokens = tokenize(query);
  let bestKey: string | null = null;
  let bestScore = 0;
  for (const [k, entry] of userCache.entries()) {
    if (now - entry.updatedAt > TTL_MS) {
      userCache.delete(k);
      continue;
    }
    const score = jaccard(qTokens, tokenize(k));
    if (score > bestScore) {
      bestScore = score;
      bestKey = k;
    }
  }

  if (bestKey && bestScore >= 0.72) {
    const best = userCache.get(bestKey)!;
    return {
      hit: true,
      memoryIds: best.memoryIds,
      confidence: Math.max(0.8, Math.min(0.95, bestScore)),
    };
  }

  return { hit: false, memoryIds: [], confidence: 0 };
}

export function localStoreResult(userId: string, query: string, memoryIds: string[], confidence = 0.85): void {
  const userCache = getUserCache(userId);
  const key = normalizeQuery(query);
  userCache.set(key, {
    memoryIds: Array.from(new Set(memoryIds)).slice(0, 20),
    confidence: Math.max(0, Math.min(1, confidence)),
    updatedAt: Date.now(),
  });

  if (userCache.size > MAX_ENTRIES_PER_USER) {
    const entries = [...userCache.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    const removeCount = userCache.size - MAX_ENTRIES_PER_USER;
    for (let i = 0; i < removeCount; i += 1) userCache.delete(entries[i][0]);
  }
}
