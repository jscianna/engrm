"use strict";
/**
 * Simple LRU cache for embeddings.
 * Persists in warm serverless functions, reducing OpenAI calls.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCachedEmbedding = getCachedEmbedding;
exports.setCachedEmbedding = setCachedEmbedding;
exports.getCacheStats = getCacheStats;
const node_crypto_1 = __importDefault(require("node:crypto"));
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const MAX_CACHE_SIZE = 500;
const cache = new Map();
function hashQuery(query) {
    const normalized = query.toLowerCase().trim();
    return `emb_${node_crypto_1.default.createHash("sha256").update(normalized).digest("hex")}`;
}
function getCachedEmbedding(query) {
    const key = hashQuery(query);
    const entry = cache.get(key);
    if (!entry)
        return null;
    // Check TTL
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return entry.vector;
}
function setCachedEmbedding(query, vector) {
    const key = hashQuery(query);
    // Evict oldest entries if cache is full
    if (cache.size >= MAX_CACHE_SIZE) {
        const firstKey = cache.keys().next().value;
        if (firstKey)
            cache.delete(firstKey);
    }
    cache.set(key, {
        vector,
        timestamp: Date.now(),
    });
}
function getCacheStats() {
    return { size: cache.size, maxSize: MAX_CACHE_SIZE };
}
//# sourceMappingURL=embedding-cache.js.map