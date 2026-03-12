const MAX_ENTRIES_PER_USER = 200;
const TTL_MS = 15 * 60 * 1000;
const cache = new Map();
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
        .filter((token) => token.length > 2)
        .slice(0, 24);
}
function jaccard(left, right) {
    if (left.length === 0 || right.length === 0)
        return 0;
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    let intersection = 0;
    for (const token of leftSet) {
        if (rightSet.has(token)) {
            intersection += 1;
        }
    }
    const union = new Set([...leftSet, ...rightSet]).size;
    return union === 0 ? 0 : intersection / union;
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
    const index = getUserIndex(userId);
    for (const memoryId of memoryIds) {
        let keys = index.get(memoryId);
        if (!keys) {
            keys = new Set();
            index.set(memoryId, keys);
        }
        keys.add(key);
    }
}
function removeIndexLinks(userId, key, memoryIds) {
    const index = memoryToQueryIndex.get(userId);
    if (!index)
        return;
    for (const memoryId of memoryIds) {
        const keys = index.get(memoryId);
        if (!keys)
            continue;
        keys.delete(key);
        if (keys.size === 0) {
            index.delete(memoryId);
        }
    }
    if (index.size === 0) {
        memoryToQueryIndex.delete(userId);
    }
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
        const oldest = [...userCache.entries()].sort((left, right) => (left[1].lastAccessedAt || left[1].updatedAt) - (right[1].lastAccessedAt || right[1].updatedAt))[0];
        if (!oldest)
            break;
        const [key, entry] = oldest;
        userCache.delete(key);
        removeIndexLinks(userId, key, entry.memoryIds);
        metrics.evictions += 1;
    }
}
export async function localRetrieve(query, userId) {
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
    const queryTokens = tokenize(query);
    let bestKey = null;
    let bestScore = 0;
    for (const [candidateKey, entry] of userCache.entries()) {
        if (now - entry.updatedAt > TTL_MS) {
            userCache.delete(candidateKey);
            removeIndexLinks(userId, candidateKey, entry.memoryIds);
            metrics.evictions += 1;
            continue;
        }
        const score = jaccard(queryTokens, tokenize(candidateKey));
        if (score > bestScore) {
            bestKey = candidateKey;
            bestScore = score;
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
export function localStoreResult(userId, query, memoryIds, confidence = 0.85) {
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
export function invalidateLocalResultsByMemoryIds(userId, memoryIds) {
    const index = memoryToQueryIndex.get(userId);
    const userCache = cache.get(userId);
    if (!index || !userCache || memoryIds.length === 0)
        return 0;
    const keysToDelete = new Set();
    for (const memoryId of memoryIds) {
        const keys = index.get(memoryId);
        if (!keys)
            continue;
        for (const key of keys) {
            keysToDelete.add(key);
        }
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
    if (removed > 0) {
        metrics.invalidations += removed;
    }
    return removed;
}
export function invalidateAllLocalResultsForUser(userId) {
    const userCache = cache.get(userId);
    if (userCache) {
        metrics.invalidations += userCache.size;
    }
    cache.delete(userId);
    memoryToQueryIndex.delete(userId);
}
export function recordShadowSample(overlapAtK) {
    metrics.shadowSamples += 1;
    metrics.shadowOverlapSum += Math.max(0, overlapAtK);
}
export function getLocalRetrievalMetrics() {
    const entries = [...cache.values()].reduce((sum, userCache) => sum + userCache.size, 0);
    return {
        lookups: metrics.lookups,
        hits: metrics.hits,
        misses: metrics.misses,
        directHits: metrics.directHits,
        fuzzyHits: metrics.fuzzyHits,
        stores: metrics.stores,
        evictions: metrics.evictions,
        invalidations: metrics.invalidations,
        hitRate: metrics.lookups === 0 ? 0 : Number((metrics.hits / metrics.lookups).toFixed(4)),
        users: cache.size,
        entries,
        shadowSamples: metrics.shadowSamples,
        shadowOverlapSum: metrics.shadowOverlapSum,
        shadowAvgOverlap: metrics.shadowSamples === 0 ? 0 : Number((metrics.shadowOverlapSum / metrics.shadowSamples).toFixed(4)),
    };
}
//# sourceMappingURL=local-retrieval.js.map