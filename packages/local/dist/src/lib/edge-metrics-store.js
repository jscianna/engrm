"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendEdgeSnapshot = appendEdgeSnapshot;
exports.getEdgeSnapshotAggregate24h = getEdgeSnapshotAggregate24h;
const redis_1 = require("@upstash/redis");
function getRedis() {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token)
        return null;
    return new redis_1.Redis({ url, token });
}
const KEY = "edge:snapshots:v1";
async function appendEdgeSnapshot(snapshot) {
    const redis = getRedis();
    if (!redis)
        return;
    await redis.rpush(KEY, JSON.stringify(snapshot));
    await redis.expire(KEY, 60 * 60 * 24 * 2);
    const len = await redis.llen(KEY);
    if (len > 3000) {
        await redis.ltrim(KEY, len - 3000, -1);
    }
}
async function getEdgeSnapshotAggregate24h() {
    const redis = getRedis();
    if (!redis)
        return null;
    const raw = await redis.lrange(KEY, 0, -1);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const points = raw
        .map((line) => {
        try {
            return JSON.parse(line);
        }
        catch {
            return null;
        }
    })
        .filter((p) => Boolean(p) && p.ts >= cutoff);
    if (points.length === 0) {
        return {
            count: 0,
            avgHitRate: 0,
            avgShadowOverlap: 0,
            avgRiskScore: 0,
            avgFlushQuality: 0,
            totalMissingConstraints: 0,
        };
    }
    const sum = points.reduce((acc, p) => ({
        hitRate: acc.hitRate + p.hitRate,
        overlap: acc.overlap + p.shadowAvgOverlap,
        risk: acc.risk + p.avgRiskScore,
        flush: acc.flush + p.avgFlushQuality,
        missing: acc.missing + p.missingConstraints,
    }), { hitRate: 0, overlap: 0, risk: 0, flush: 0, missing: 0 });
    return {
        count: points.length,
        avgHitRate: Number((sum.hitRate / points.length).toFixed(4)),
        avgShadowOverlap: Number((sum.overlap / points.length).toFixed(4)),
        avgRiskScore: Number((sum.risk / points.length).toFixed(4)),
        avgFlushQuality: Number((sum.flush / points.length).toFixed(4)),
        totalMissingConstraints: sum.missing,
    };
}
//# sourceMappingURL=edge-metrics-store.js.map