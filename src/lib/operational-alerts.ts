import { getDb } from "@/lib/turso";
import { getApiKeyScopeMigrationStatus } from "@/lib/db";
import { getCognitiveJobHealth, getFailedBenchmarkRunsSince } from "@/lib/cognitive-db";

export type OperationalAlert = {
  id: string;
  severity: "info" | "warning" | "critical";
  source: "api_keys" | "cognitive_jobs" | "benchmarks" | "audit";
  message: string;
  count: number;
  metadata?: Record<string, unknown>;
};

function staleThresholdMs(jobName: string): number {
  if (jobName.includes("operational-alert-delivery")) {
    return 2 * 60 * 60 * 1000;
  }
  if (jobName.includes("pattern-extraction")) {
    return 18 * 60 * 60 * 1000;
  }
  if (jobName.includes("skill-synthesis")) {
    return 30 * 60 * 60 * 1000;
  }
  return 24 * 60 * 60 * 1000;
}

export async function getOperationalAlertsSummary(): Promise<{
  generatedAt: string;
  alerts: OperationalAlert[];
}> {
  const client = getDb();
  const now = Date.now();
  const alerts: OperationalAlert[] = [];

  const apiKeyStatus = await getApiKeyScopeMigrationStatus();
  if (apiKeyStatus.legacyKeysMissingScopes > 0) {
    alerts.push({
      id: "legacy_api_key_scopes",
      severity: "warning",
      source: "api_keys",
      message: "Some API keys are missing explicit scopes and should be backfilled before launch.",
      count: apiKeyStatus.legacyKeysMissingScopes,
      metadata: apiKeyStatus,
    });
  }
  if (apiKeyStatus.revocableWildcardKeys > 0) {
    alerts.push({
      id: "wildcard_api_keys",
      severity: "warning",
      source: "api_keys",
      message: "Some active API keys still have wildcard access.",
      count: apiKeyStatus.revocableWildcardKeys,
      metadata: apiKeyStatus,
    });
  }

  const jobs = await getCognitiveJobHealth();
  const staleJobs = jobs.filter((row) => {
    const lastSuccessAt = row.lastSuccessAt;
    if (!lastSuccessAt) {
      return true;
    }
    return new Date(lastSuccessAt).getTime() < now - staleThresholdMs(row.jobName);
  });
  if (staleJobs.length > 0) {
    alerts.push({
      id: "stale_cognitive_jobs",
      severity: "critical",
      source: "cognitive_jobs",
      message: "Some cognitive heartbeat jobs are stale or have never succeeded.",
      count: staleJobs.length,
      metadata: {
        jobs: staleJobs.map((job) => ({
          jobName: job.jobName,
          lastSuccessAt: job.lastSuccessAt ?? null,
        })),
      },
    });
  }

  const failedBenchmarks = await getFailedBenchmarkRunsSince(new Date(now - 24 * 60 * 60 * 1000).toISOString(), 20);
  if (failedBenchmarks.length > 0) {
    alerts.push({
      id: "failed_benchmark_runs",
      severity: "critical",
      source: "benchmarks",
      message: "Recent benchmark runs failed their release gates.",
      count: failedBenchmarks.length,
      metadata: {
        runs: failedBenchmarks.slice(0, 5).map((run) => ({
          id: run.id,
          dataset: run.dataset,
          fixtureCount: run.fixtureCount,
          createdAt: run.createdAt,
        })),
      },
    });
  }

  const suspiciousResult = await client.execute({
    sql: `
      SELECT 
        user_id,
        COUNT(*) as total_requests,
        COUNT(DISTINCT ip_address) as unique_ips,
        SUM(CASE WHEN action LIKE 'auth.%' AND metadata_json LIKE '%"success":false%' THEN 1 ELSE 0 END) as failed_auths
      FROM audit_logs
      WHERE timestamp >= ?
      GROUP BY user_id
    `,
    args: [new Date(now - 60 * 60 * 1000).toISOString()],
  }).catch(() => null);
  const suspiciousUsers = suspiciousResult == null
    ? []
    : (suspiciousResult.rows as Array<Record<string, unknown>>).filter((row) => {
        const rapidRequests = Number(row.total_requests ?? 0);
        const uniqueIps = Number(row.unique_ips ?? 0);
        const failedAuths = Number(row.failed_auths ?? 0);
        return rapidRequests > 100 || uniqueIps > 5 || failedAuths > 3;
      });
  if (suspiciousUsers.length > 0) {
    alerts.push({
      id: "suspicious_activity",
      severity: "warning",
      source: "audit",
      message: "Recent request patterns look suspicious for one or more users.",
      count: suspiciousUsers.length,
      metadata: {
        users: suspiciousUsers.slice(0, 10).map((row) => ({
          userId: row.user_id,
          totalRequests: Number(row.total_requests ?? 0),
          uniqueIps: Number(row.unique_ips ?? 0),
          failedAuths: Number(row.failed_auths ?? 0),
        })),
      },
    });
  }

  return {
    generatedAt: new Date(now).toISOString(),
    alerts,
  };
}
