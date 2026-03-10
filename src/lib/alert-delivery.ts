import { MemryError } from "@/lib/errors";
import type { OperationalAlert } from "@/lib/operational-alerts";

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

function deliveryFormat(): "generic" | "slack" {
  return process.env.OPS_ALERT_WEBHOOK_FORMAT === "slack" ? "slack" : "generic";
}

function configuredDestination(): string | null {
  const url = process.env.OPS_ALERT_WEBHOOK_URL?.trim();
  return url ? url : null;
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
} {
  const destination = configuredDestination();
  return {
    configured: destination !== null,
    destination,
    format: deliveryFormat(),
    hasBearerToken: Boolean(process.env.OPS_ALERT_WEBHOOK_BEARER_TOKEN),
  };
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
    throw new MemryError("INTERNAL_ERROR", {
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
    throw new MemryError("INTERNAL_ERROR", {
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
