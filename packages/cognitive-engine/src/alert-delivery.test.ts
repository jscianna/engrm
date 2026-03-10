import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOperationalAlertsPayload,
  deliverOperationalAlerts,
  formatOperationalAlertsMessage,
  getOperationalAlertDeliveryConfig,
} from "../../../src/lib/alert-delivery";

describe("alert delivery", () => {
  const summary = {
    generatedAt: "2026-03-10T00:00:00.000Z",
    alerts: [
      {
        id: "stale_cognitive_jobs",
        severity: "critical" as const,
        source: "cognitive_jobs" as const,
        message: "Some cognitive heartbeat jobs are stale or have never succeeded.",
        count: 2,
      },
      {
        id: "wildcard_api_keys",
        severity: "warning" as const,
        source: "api_keys" as const,
        message: "Some active API keys still have wildcard access.",
        count: 1,
      },
    ],
  };

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPS_ALERT_WEBHOOK_URL;
    delete process.env.OPS_ALERT_WEBHOOK_FORMAT;
    delete process.env.OPS_ALERT_WEBHOOK_BEARER_TOKEN;
  });

  it("formats a readable summary message", () => {
    const message = formatOperationalAlertsMessage(summary, { reason: "launch smoke test" });
    expect(message).toContain("FatHippo operational alerts: 2 active");
    expect(message).toContain("Reason: launch smoke test");
    expect(message).toContain("[CRITICAL]");
  });

  it("builds a generic payload by default", () => {
    const payload = buildOperationalAlertsPayload(summary, { source: "test" });
    expect(payload.type).toBe("operational_alerts");
    expect(payload.alertCount).toBe(2);
    expect(payload.source).toBe("test");
  });

  it("delivers a webhook payload when configured", async () => {
    process.env.OPS_ALERT_WEBHOOK_URL = "https://ops.example.test/webhook";
    process.env.OPS_ALERT_WEBHOOK_BEARER_TOKEN = "secret-token";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await deliverOperationalAlerts(summary, {
      reason: "test send",
      source: "vitest",
    });

    expect(result.delivered).toBe(true);
    expect(result.responseStatus).toBe(202);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://ops.example.test/webhook");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret-token",
      },
    });
  });

  it("skips delivery when there are no alerts unless forced", async () => {
    process.env.OPS_ALERT_WEBHOOK_URL = "https://ops.example.test/webhook";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await deliverOperationalAlerts({
      generatedAt: summary.generatedAt,
      alerts: [],
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("no_alerts");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports delivery configuration", () => {
    process.env.OPS_ALERT_WEBHOOK_URL = "https://ops.example.test/webhook";
    process.env.OPS_ALERT_WEBHOOK_FORMAT = "slack";
    const config = getOperationalAlertDeliveryConfig();
    expect(config.configured).toBe(true);
    expect(config.format).toBe("slack");
  });
});
