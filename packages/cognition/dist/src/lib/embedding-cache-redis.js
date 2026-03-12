"use strict";
/**
 * Persistent Embedding Cache using Upstash Redis
 *
 * Why this matters for agents:
 * - Repeat queries skip OpenAI entirely (~0ms vs ~300ms)
 * - Common patterns get faster over time
 * - Agents feel more responsive = smarter UX
 *
 * Cache key: hash of normalized query text
 * TTL: 7 days (embeddings don't change for same text)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCachedEmbeddingPersistent = getCachedEmbeddingPersistent;
exports.setCachedEmbeddingPersistent = setCachedEmbeddingPersistent;
exports.getEmbeddingCacheStats = getEmbeddingCacheStats;
const redis_1 = require("@upstash/redis");
const crypto_1 = __importDefault(require("crypto"));
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const CACHE_PREFIX = "emb:";
let redis = null;
function getRedis() {
    if (redis)
        return redis;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        return null;
    }
    redis = new redis_1.Redis({ url, token });
    return redis;
}
function hashKey(text) {
    const normalized = text.trim().toLowerCase();
    return CACHE_PREFIX + crypto_1.default.createHash("sha256").update(normalized).digest("hex");
}
async function getCachedEmbeddingPersistent(text) {
    try {
        const client = getRedis();
        if (!client)
            return null;
        const key = hashKey(text);
        const cached = await client.get(key);
        if (cached) {
            console.log("[EmbeddingCache] HIT");
            return cached;
        }
        return null;
    }
    catch (error) {
        console.error("[EmbeddingCache] Get error:", error);
        return null;
    }
}
async function setCachedEmbeddingPersistent(text, embedding) {
    try {
        const client = getRedis();
        if (!client)
            return;
        const key = hashKey(text);
        await client.set(key, embedding, { ex: CACHE_TTL_SECONDS });
    }
    catch (error) {
        console.error("[EmbeddingCache] Set error:", error);
    }
}
async function getEmbeddingCacheStats() {
    try {
        const client = getRedis();
        if (!client)
            return { enabled: false };
        // Count embedding keys (approximate)
        const info = await client.dbsize();
        return { enabled: true, keyCount: info };
    }
    catch {
        return { enabled: false };
    }
}
//# sourceMappingURL=embedding-cache-redis.js.map