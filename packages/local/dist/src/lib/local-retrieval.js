"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.localRetrieve = localRetrieve;
exports.localStoreResult = localStoreResult;
exports.invalidateLocalResultsByMemoryIds = invalidateLocalResultsByMemoryIds;
exports.invalidateAllLocalResultsForUser = invalidateAllLocalResultsForUser;
exports.recordShadowSample = recordShadowSample;
exports.getLocalRetrievalMetrics = getLocalRetrievalMetrics;
const MAX_ENTRIES_PER_USER = 200;
const TTL_MS = 15 * 60 * 1000;
// userId -> normalizedQuery -> cache entry
const cache = new Map();
// userId -> memoryId -> set(normalizedQuery)
const memoryToQueryIndex = new Map();
const metrics = {
    lookups: 0,
    hits: 0,
    misses: 0,
    directHits: 0,
    fuzzyHits: 0,
    stores: 0,
    evictions: 0,
    invalidations: 0,
    shadowSamples: 0,
    shadowOverlapSum: 0,
};
function normalizeQuery(query) {
    return query.toLowerCase().trim().replace(/\s+/g, " ");
}
function tokenize(query) {
    return normalizeQuery(query)
        .split(" ")
        .filter((t) => t.length > 2)
        .slice(0, 24);
}
function jaccard(a, b) {
    if (a.length === 0 || b.length === 0)
        return 0;
    const sa = new Set(a);
    const sb = new Set(b);
    let inter = 0;
    for (const x of sa)
        if (sb.has(x))
            inter += 1;
    const union = new Set([...sa, ...sb]).size;
    return union === 0 ? 0 : inter / union;
}
function getUserCache(userId) {
    const existing = cache.get(userId);
    if (existing)
        return existing;
    const created = new Map();
    cache.set(userId, created);
    return created;
}
function getUserIndex(userId) {
    const existing = memoryToQueryIndex.get(userId);
    if (existing)
        return existing;
    const created = new Map();
    memoryToQueryIndex.set(userId, created);
    return created;
}
function addIndexLinks(userId, key, memoryIds) {
    const idx = getUserIndex(userId);
    for (const id of memoryIds) {
        let keys = idx.get(id);
        if (!keys) {
            keys = new Set();
            idx.set(id, keys);
        }
        keys.add(key);
    }
}
function removeIndexLinks(userId, key, memoryIds) {
    const idx = memoryToQueryIndex.get(userId);
    if (!idx)
        return;
    for (const id of memoryIds) {
        const keys = idx.get(id);
        if (!keys)
            continue;
        keys.delete(key);
        if (keys.size === 0)
            idx.delete(id);
    }
    if (idx.size === 0)
        memoryToQueryIndex.delete(userId);
}
function calibrateConfidence(similarity, ageMs, base = 0.85) {
    const agePenalty = Math.min(0.2, ageMs / TTL_MS / 5);
    const score = base * 0.5 + similarity * 0.5 - agePenalty;
    return Math.max(0.6, Math.min(0.98, score));
}
function touchEntry(entry) {
    entry.lastAccessedAt = Date.now();
}
function evictExpiredAndOverflow(userId) {
    const userCache = cache.get(userId);
    if (!userCache)
        return;
    const now = Date.now();
    for (const [key, entry] of userCache.entries()) {
        if (now - entry.updatedAt > TTL_MS) {
            userCache.delete(key);
            removeIndexLinks(userId, key, entry.memoryIds);
            metrics.evictions += 1;
        }
    }
    while (userCache.size > MAX_ENTRIES_PER_USER) {
        // LRU eviction by lastAccessedAt, fallback to updatedAt
        const oldest = [...userCache.entries()].sort((a, b) => (a[1].lastAccessedAt || a[1].updatedAt) - (b[1].lastAccessedAt || b[1].updatedAt))[0];
        if (!oldest)
            break;
        const [key, entry] = oldest;
        userCache.delete(key);
        removeIndexLinks(userId, key, entry.memoryIds);
        metrics.evictions += 1;
    }
}
async function localRetrieve(query, userId) {
    metrics.lookups += 1;
    const userCache = getUserCache(userId);
    const key = normalizeQuery(query);
    const now = Date.now();
    const direct = userCache.get(key);
    if (direct && now - direct.updatedAt <= TTL_MS) {
        touchEntry(direct);
        metrics.hits += 1;
        metrics.directHits += 1;
        return {
            hit: true,
            memoryIds: direct.memoryIds,
            confidence: calibrateConfidence(1, now - direct.updatedAt, direct.confidence),
        };
    }
    const qTokens = tokenize(query);
    let bestKey = null;
    let bestScore = 0;
    for (const [k, entry] of userCache.entries()) {
        if (now - entry.updatedAt > TTL_MS) {
            userCache.delete(k);
            removeIndexLinks(userId, k, entry.memoryIds);
            metrics.evictions += 1;
            continue;
        }
        const score = jaccard(qTokens, tokenize(k));
        if (score > bestScore) {
            bestScore = score;
            bestKey = k;
        }
    }
    if (bestKey && bestScore >= 0.72) {
        const best = userCache.get(bestKey);
        touchEntry(best);
        metrics.hits += 1;
        metrics.fuzzyHits += 1;
        return {
            hit: true,
            memoryIds: best.memoryIds,
            confidence: calibrateConfidence(bestScore, now - best.updatedAt, best.confidence),
        };
    }
    metrics.misses += 1;
    return { hit: false, memoryIds: [], confidence: 0 };
}
function localStoreResult(userId, query, memoryIds, confidence = 0.85) {
    metrics.stores += 1;
    const userCache = getUserCache(userId);
    const key = normalizeQuery(query);
    const normalizedIds = Array.from(new Set(memoryIds)).slice(0, 20);
    const existing = userCache.get(key);
    if (existing) {
        removeIndexLinks(userId, key, existing.memoryIds);
    }
    const now = Date.now();
    userCache.set(key, {
        memoryIds: normalizedIds,
        confidence: Math.max(0, Math.min(1, confidence)),
        updatedAt: now,
        lastAccessedAt: now,
    });
    addIndexLinks(userId, key, normalizedIds);
    evictExpiredAndOverflow(userId);
}
// Invalidate local cache entries that reference any of these memory IDs
function invalidateLocalResultsByMemoryIds(userId, memoryIds) {
    const idx = memoryToQueryIndex.get(userId);
    const userCache = cache.get(userId);
    if (!idx || !userCache || memoryIds.length === 0)
        return 0;
    const keysToDelete = new Set();
    for (const memoryId of memoryIds) {
        const keys = idx.get(memoryId);
        if (!keys)
            continue;
        for (const key of keys)
            keysToDelete.add(key);
    }
    let removed = 0;
    for (const key of keysToDelete) {
        const entry = userCache.get(key);
        if (!entry)
            continue;
        userCache.delete(key);
        removeIndexLinks(userId, key, entry.memoryIds);
        removed += 1;
    }
    if (removed > 0)
        metrics.invalidations += removed;
    return removed;
}
function invalidateAllLocalResultsForUser(userId) {
    const userCache = cache.get(userId);
    if (userCache) {
        metrics.invalidations += userCache.size;
    }
    cache.delete(userId);
    memoryToQueryIndex.delete(userId);
}
function recordShadowSample(overlapAtK) {
    metrics.shadowSamples += 1;
    metrics.shadowOverlapSum += overlapAtK;
}
function getLocalRetrievalMetrics() {
    let totalEntries = 0;
    for (const userCache of cache.values())
        totalEntries += userCache.size;
    return {
        ...metrics,
        hitRate: metrics.lookups > 0 ? Number((metrics.hits / metrics.lookups).toFixed(4)) : 0,
        users: cache.size,
        entries: totalEntries,
        shadowAvgOverlap: metrics.shadowSamples > 0
            ? Number((metrics.shadowOverlapSum / metrics.shadowSamples).toFixed(4))
            : 0,
    };
}
//# sourceMappingURL=local-retrieval.js.map