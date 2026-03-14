import crypto from "node:crypto";
import { FatHippoError } from "@/lib/errors";
import type { OperationalAlert } from "@/lib/operational-alerts";
import { getOperationalAlertsSummary } from "@/lib/operational-alerts";
import { releaseJobLease, tryAcquireJobLease } from "@/lib/cognitive-db";

export type OperationalAlertsSummary = {
  generatedAt: string;
  alerts: OperationalAlert[];
};

export type DeliveredOperationalAlerts = {
  delivered: boolean;
  skipped: boolean;
  destination: string | null;
  alertCount: number;
  format: "generic" | "slack";
  reason?: string;
  responseStatus?: number;
};

export type ScheduledOperationalAlertsResult = DeliveredOperationalAlerts & {
  acquiredLease: boolean;
  jobName: string;
  fingerprint: string | null;
  summary: OperationalAlertsSummary;
};

function deliveryFormat(): "generic" | "slack" {
  return process.env.OPS_ALERT_WEBHOOK_FORMAT === "slack" ? "slack" : "generic";
}

function configuredDestination(): string | null {
  const url = process.env.OPS_ALERT_WEBHOOK_URL?.trim();
  return url ? url : null;
}

function dispatchIntervalMinutes(): number {
  const value = Number(process.env.OPS_ALERT_DISPATCH_INTERVAL_MINUTES ?? 15);
  return Number.isFinite(value) ? Math.max(5, Math.min(720, Math.trunc(value))) : 15;
}

function repeatIntervalMinutes(): number {
  const value = Number(process.env.OPS_ALERT_REPEAT_MINUTES ?? 240);
  return Number.isFinite(value) ? Math.max(15, Math.min(7 * 24 * 60, Math.trunc(value))) : 240;
}

function dispatchSecretConfigured(): boolean {
  return Boolean(process.env.OPS_ALERT_DISPATCH_SECRET || process.env.CRON_SECRET || process.env.ADMIN_API_KEY);
}

function severityRank(severity: OperationalAlert["severity"]): number {
  if (severity === "critical") {
    return 3;
  }
  if (severity === "warning") {
    return 2;
  }
  return 1;
}

function severitySummary(alerts: OperationalAlert[]): Record<OperationalAlert["severity"], number> {
  return alerts.reduce<Record<OperationalAlert["severity"], number>>(
    (accumulator, alert) => {
      accumulator[alert.severity] += 1;
      return accumulator;
    },
    {
      critical: 0,
      warning: 0,
      info: 0,
    },
  );
}

export function getOperationalAlertDeliveryConfig(): {
  configured: boolean;
  destination: string | null;
  format: "generic" | "slack";
  hasBearerToken: boolean;
  schedule: {
    intervalMinutes: number;
    repeatMinutes: number;
    secretConfigured: boolean;
    jobName: string;
  };
} {
  const destination = configuredDestination();
  return {
    configured: destination !== null,
    destination,
    format: deliveryFormat(),
    hasBearerToken: Boolean(process.env.OPS_ALERT_WEBHOOK_BEARER_TOKEN),
    schedule: {
      intervalMinutes: dispatchIntervalMinutes(),
      repeatMinutes: repeatIntervalMinutes(),
      secretConfigured: dispatchSecretConfigured(),
      jobName: "operational-alert-delivery",
    },
  };
}

function fingerprintAlerts(summary: OperationalAlertsSummary): string | null {
  if (summary.alerts.length === 0) {
    return null;
  }

  const normalized = [...summary.alerts]
    .map((alert) => ({
      id: alert.id,
      severity: alert.severity,
      source: alert.source,
      message: alert.message,
      count: alert.count,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function parseCheckpoint(raw: string | null | undefined): {
  lastDeliveredAt: string | null;
  lastDeliveredFingerprint: string | null;
  lastResolvedAt: string | null;
} {
  if (!raw) {
    return {
      lastDeliveredAt: null,
      lastDeliveredFingerprint: null,
      lastResolvedAt: null,
    };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      lastDeliveredAt: typeof parsed.lastDeliveredAt === "string" ? parsed.lastDeliveredAt : null,
      lastDeliveredFingerprint:
        typeof parsed.lastDeliveredFingerprint === "string" ? parsed.lastDeliveredFingerprint : null,
      lastResolvedAt: typeof parsed.lastResolvedAt === "string" ? parsed.lastResolvedAt : null,
    };
  } catch {
    return {
      lastDeliveredAt: null,
      lastDeliveredFingerprint: null,
      lastResolvedAt: null,
    };
  }
}

export function formatOperationalAlertsMessage(
  summary: OperationalAlertsSummary,
  options?: {
    reason?: string;
  },
): string {
  const counts = severitySummary(summary.alerts);
  const sortedAlerts = [...summary.alerts].sort((left, right) => severityRank(right.severity) - severityRank(left.severity));
  const header = `FatHippo operational alerts: ${summary.alerts.length} active (${counts.critical} critical, ${counts.warning} warning, ${counts.info} info)`;
  const lines = [header];

  if (options?.reason) {
    lines.push(`Reason: ${options.reason}`);
  }
  lines.push(`Generated at: ${summary.generatedAt}`);

  if (sortedAlerts.length === 0) {
    lines.push("No active alerts.");
    return lines.join("\n");
  }

  for (const alert of sortedAlerts) {
    lines.push(`- [${alert.severity.toUpperCase()}] ${alert.message} (count: ${alert.count}, source: ${alert.source})`);
  }

  return lines.join("\n");
}

export function buildOperationalAlertsPayload(
  summary: OperationalAlertsSummary,
  options?: {
    reason?: string;
    source?: string;
  },
): Record<string, unknown> {
  const source = options?.source ?? "manual";
  const message = formatOperationalAlertsMessage(summary, options);

  if (deliveryFormat() === "slack") {
    return {
      text: message,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "FatHippo operational alerts",
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: message,
          },
        },
      ],
      metadata: {
        event_type: "fathippo_operational_alerts",
        event_payload: {
          source,
          generatedAt: summary.generatedAt,
          alertCount: summary.alerts.length,
        },
      },
    };
  }

  return {
    type: "operational_alerts",
    source,
    generatedAt: summary.generatedAt,
    alertCount: summary.alerts.length,
    severityCounts: severitySummary(summary.alerts),
    message,
    alerts: summary.alerts,
  };
}

export async function deliverOperationalAlerts(
  summary: OperationalAlertsSummary,
  options?: {
    force?: boolean;
    reason?: string;
    source?: string;
  },
): Promise<DeliveredOperationalAlerts> {
  const config = getOperationalAlertDeliveryConfig();
  if (!config.configured || config.destination == null) {
    throw new FatHippoError("INTERNAL_ERROR", {
      reason: "ops_alert_webhook_not_configured",
    });
  }

  if (summary.alerts.length === 0 && !options?.force) {
    return {
      delivered: false,
      skipped: true,
      destination: config.destination,
      alertCount: 0,
      format: config.format,
      reason: "no_alerts",
    };
  }

  const payload = buildOperationalAlertsPayload(summary, options);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (process.env.OPS_ALERT_WEBHOOK_BEARER_TOKEN) {
    headers.authorization = `Bearer ${process.env.OPS_ALERT_WEBHOOK_BEARER_TOKEN}`;
  }

  const response = await fetch(config.destination, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new FatHippoError("INTERNAL_ERROR", {
      reason: "ops_alert_delivery_failed",
      status: response.status,
    });
  }

  return {
    delivered: true,
    skipped: false,
    destination: config.destination,
    alertCount: summary.alerts.length,
    format: config.format,
    reason: options?.reason,
    responseStatus: response.status,
  };
}

export async function dispatchOperationalAlertsIfDue(options?: {
  force?: boolean;
  reason?: string;
  source?: string;
}): Promise<ScheduledOperationalAlertsResult> {
  const intervalMinutes = dispatchIntervalMinutes();
  const repeatMinutes = repeatIntervalMinutes();
  const jobName = "operational-alert-delivery";
  const lease = await tryAcquireJobLease({
    jobName,
    intervalMs: intervalMinutes * 60 * 1000,
    leaseMs: 5 * 60 * 1000,
  });

  const summary = await getOperationalAlertsSummary();
  const fingerprint = fingerprintAlerts(summary);

  if (!lease) {
    return {
      delivered: false,
      skipped: true,
      destination: configuredDestination(),
      alertCount: summary.alerts.length,
      format: deliveryFormat(),
      reason: "lease_unavailable",
      acquiredLease: false,
      jobName,
      fingerprint,
      summary,
    };
  }

  const checkpoint = parseCheckpoint(lease.checkpointJson);
  const now = new Date();
  const nowIso = now.toISOString();

  try {
    const dueForRepeat =
      checkpoint.lastDeliveredAt == null ||
      new Date(checkpoint.lastDeliveredAt).getTime() <= now.getTime() - repeatMinutes * 60 * 1000;
    const alertsChanged =
      fingerprint !== null &&
      fingerprint !== checkpoint.lastDeliveredFingerprint;
    const shouldSendResolved =
      summary.alerts.length === 0 &&
      checkpoint.lastDeliveredFingerprint !== null &&
      checkpoint.lastResolvedAt == null;

    if (!options?.force && summary.alerts.length === 0 && !shouldSendResolved) {
      const result: ScheduledOperationalAlertsResult = {
        delivered: false,
        skipped: true,
        destination: configuredDestination(),
        alertCount: 0,
        format: deliveryFormat(),
        reason: "no_alerts",
        acquiredLease: true,
        jobName,
        fingerprint,
        summary,
      };
      await releaseJobLease({
        jobName,
        leaseToken: lease.leaseToken,
        success: true,
        checkpoint: {
          lastDeliveredAt: checkpoint.lastDeliveredAt,
          lastDeliveredFingerprint: null,
          lastResolvedAt: checkpoint.lastResolvedAt ?? nowIso,
        },
      });
      return result;
    }

    if (
      !options?.force &&
      summary.alerts.length > 0 &&
      !alertsChanged &&
      !dueForRepeat
    ) {
      const result: ScheduledOperationalAlertsResult = {
        delivered: false,
        skipped: true,
        destination: configuredDestination(),
        alertCount: summary.alerts.length,
        format: deliveryFormat(),
        reason: "unchanged_alerts",
        acquiredLease: true,
        jobName,
        fingerprint,
        summary,
      };
      await releaseJobLease({
        jobName,
        leaseToken: lease.leaseToken,
        success: true,
        checkpoint: {
          lastDeliveredAt: checkpoint.lastDeliveredAt,
          lastDeliveredFingerprint: checkpoint.lastDeliveredFingerprint,
          lastResolvedAt: checkpoint.lastResolvedAt,
        },
      });
      return result;
    }

    const deliveryReason =
      options?.reason ??
      (shouldSendResolved
        ? "alerts resolved"
        : alertsChanged
          ? "alert set changed"
          : "scheduled repeat");
    const deliveryResult = await deliverOperationalAlerts(summary, {
      force: Boolean(options?.force || shouldSendResolved),
      reason: deliveryReason,
      source: options?.source ?? "scheduled_dispatch",
    });

    await releaseJobLease({
      jobName,
      leaseToken: lease.leaseToken,
      success: true,
      checkpoint: {
        lastDeliveredAt: deliveryResult.delivered ? nowIso : checkpoint.lastDeliveredAt,
        lastDeliveredFingerprint: fingerprint,
        lastResolvedAt: summary.alerts.length === 0 ? nowIso : null,
      },
    });

    return {
      ...deliveryResult,
      acquiredLease: true,
      jobName,
      fingerprint,
      summary,
    };
  } catch (error) {
    await releaseJobLease({
      jobName,
      leaseToken: lease.leaseToken,
      success: false,
      checkpoint: {
        lastDeliveredAt: checkpoint.lastDeliveredAt,
        lastDeliveredFingerprint: checkpoint.lastDeliveredFingerprint,
        lastResolvedAt: checkpoint.lastResolvedAt,
        lastErrorAt: nowIso,
      },
    });
    throw error;
  }
}
