import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tryAcquireJobLeaseMock = vi.fn();
const releaseJobLeaseMock = vi.fn();
const getOperationalAlertsSummaryMock = vi.fn();

vi.mock("../../../src/lib/cognitive-db", () => ({
  tryAcquireJobLease: tryAcquireJobLeaseMock,
  releaseJobLease: releaseJobLeaseMock,
}));

vi.mock("../../../src/lib/operational-alerts", () => ({
  getOperationalAlertsSummary: getOperationalAlertsSummaryMock,
}));

describe("operational alert dispatch", () => {
  beforeEach(() => {
    tryAcquireJobLeaseMock.mockReset();
    releaseJobLeaseMock.mockReset();
    getOperationalAlertsSummaryMock.mockReset();
    delete process.env.OPS_ALERT_WEBHOOK_FORMAT;
    process.env.OPS_ALERT_WEBHOOK_URL = "https://ops.example.test/webhook";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPS_ALERT_WEBHOOK_URL;
    delete process.env.OPS_ALERT_WEBHOOK_FORMAT;
  });

  it("skips when the dispatch lease is unavailable", async () => {
    tryAcquireJobLeaseMock.mockResolvedValue(null);
    getOperationalAlertsSummaryMock.mockResolvedValue({
      generatedAt: "2026-03-11T00:00:00.000Z",
      alerts: [],
    });

    const { dispatchOperationalAlertsIfDue } = await import("../../../src/lib/alert-delivery");
    const result = await dispatchOperationalAlertsIfDue();

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("lease_unavailable");
    expect(result.acquiredLease).toBe(false);
    expect(releaseJobLeaseMock).not.toHaveBeenCalled();
  });

  it("delivers new alerts and checkpoints the fingerprint", async () => {
    tryAcquireJobLeaseMock.mockResolvedValue({
      jobName: "operational-alert-delivery",
      leaseToken: "lease-1",
      leaseExpiresAt: "2026-03-11T00:05:00.000Z",
      lastRunAt: null,
      lastSuccessAt: null,
      checkpointJson: null,
    });
    getOperationalAlertsSummaryMock.mockResolvedValue({
      generatedAt: "2026-03-11T00:00:00.000Z",
      alerts: [
        {
          id: "wildcard_api_keys",
          severity: "warning",
          source: "api_keys",
          message: "Some active API keys still have wildcard access.",
          count: 2,
        },
      ],
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
    });
    vi.stubGlobal("fetch", fetchMock);

    const { dispatchOperationalAlertsIfDue } = await import("../../../src/lib/alert-delivery");
    const result = await dispatchOperationalAlertsIfDue();

    expect(result.delivered).toBe(true);
    expect(result.acquiredLease).toBe(true);
    expect(result.fingerprint).toMatch(/[a-f0-9]{64}/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(releaseJobLeaseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobName: "operational-alert-delivery",
        leaseToken: "lease-1",
        success: true,
        checkpoint: expect.objectContaining({
          lastDeliveredFingerprint: result.fingerprint,
          lastResolvedAt: null,
        }),
      }),
    );
  });

  it("skips unchanged alerts until the repeat interval elapses", async () => {
    const summary = {
      generatedAt: "2026-03-11T00:00:00.000Z",
      alerts: [
        {
          id: "stale_cognitive_jobs",
          severity: "critical",
          source: "cognitive_jobs",
          message: "Some cognitive heartbeat jobs are stale or have never succeeded.",
          count: 1,
        },
      ],
    };
    getOperationalAlertsSummaryMock.mockResolvedValue(summary);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal("fetch", fetchMock);

    const { dispatchOperationalAlertsIfDue } = await import("../../../src/lib/alert-delivery");

    tryAcquireJobLeaseMock.mockResolvedValueOnce({
      jobName: "operational-alert-delivery",
      leaseToken: "lease-first",
      leaseExpiresAt: "2026-03-11T00:05:00.000Z",
      lastRunAt: null,
      lastSuccessAt: null,
      checkpointJson: null,
    });

    const first = await dispatchOperationalAlertsIfDue();
    const checkpoint = releaseJobLeaseMock.mock.calls[0]?.[0]?.checkpoint;

    tryAcquireJobLeaseMock.mockResolvedValueOnce({
      jobName: "operational-alert-delivery",
      leaseToken: "lease-second",
      leaseExpiresAt: "2026-03-11T00:20:00.000Z",
      lastRunAt: "2026-03-11T00:15:00.000Z",
      lastSuccessAt: "2026-03-11T00:15:00.000Z",
      checkpointJson: JSON.stringify(checkpoint),
    });

    const second = await dispatchOperationalAlertsIfDue();

    expect(first.delivered).toBe(true);
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe("unchanged_alerts");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
