import { Redis } from "@upstash/redis";

type Snapshot = {
  ts: number;
  hitRate: number;
  shadowAvgOverlap: number;
  avgRiskScore: number;
  avgFlushQuality: number;
  missingConstraints: number;
};

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const KEY = "edge:snapshots:v1";

export async function appendEdgeSnapshot(snapshot: Snapshot): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  await redis.rpush(KEY, JSON.stringify(snapshot));
  await redis.expire(KEY, 60 * 60 * 24 * 2);

  const length = await redis.llen(KEY);
  if (length > 3000) {
    await redis.ltrim(KEY, length - 3000, -1);
  }
}

export async function getEdgeSnapshotAggregate24h(): Promise<{
  count: number;
  avgHitRate: number;
  avgShadowOverlap: number;
  avgRiskScore: number;
  avgFlushQuality: number;
  totalMissingConstraints: number;
} | null> {
  const redis = getRedis();
  if (!redis) return null;

  const raw = await redis.lrange<string>(KEY, 0, -1);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const points = raw
    .map((line) => {
      try {
        return JSON.parse(line) as Snapshot;
      } catch {
        return null;
      }
    })
    .filter((point): point is Snapshot => point !== null && point.ts >= cutoff);

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

  const sums = points.reduce(
    (accumulator, point) => ({
      hitRate: accumulator.hitRate + point.hitRate,
      overlap: accumulator.overlap + point.shadowAvgOverlap,
      risk: accumulator.risk + point.avgRiskScore,
      flush: accumulator.flush + point.avgFlushQuality,
      missing: accumulator.missing + point.missingConstraints,
    }),
    { hitRate: 0, overlap: 0, risk: 0, flush: 0, missing: 0 },
  );

  return {
    count: points.length,
    avgHitRate: Number((sums.hitRate / points.length).toFixed(4)),
    avgShadowOverlap: Number((sums.overlap / points.length).toFixed(4)),
    avgRiskScore: Number((sums.risk / points.length).toFixed(4)),
    avgFlushQuality: Number((sums.flush / points.length).toFixed(4)),
    totalMissingConstraints: sums.missing,
  };
}
