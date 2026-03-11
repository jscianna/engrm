import { beforeEach, describe, expect, it, vi } from "vitest";

const validateApiKeyMock = vi.fn();
const updatePatternFeedbackMock = vi.fn();
const logCognitiveAuditEventMock = vi.fn();

vi.mock("../../../src/lib/api-auth", () => ({
  validateApiKey: validateApiKeyMock,
}));

vi.mock("../../../src/lib/cognitive-db", () => ({
  updatePatternFeedback: updatePatternFeedbackMock,
}));

vi.mock("../../../src/lib/cognitive-audit", () => ({
  logCognitiveAuditEvent: logCognitiveAuditEventMock,
}));

describe("pattern feedback route", () => {
  beforeEach(() => {
    validateApiKeyMock.mockReset();
    updatePatternFeedbackMock.mockReset();
    logCognitiveAuditEventMock.mockReset();
    validateApiKeyMock.mockResolvedValue({ userId: "user-route" });
  });

  it("returns forbidden when the feedback target is not accessible", async () => {
    updatePatternFeedbackMock.mockResolvedValue(false);
    const { POST } = await import("../../../src/app/api/v1/cognitive/patterns/feedback/route");

    const response = await POST(
      new Request("http://localhost/api/v1/cognitive/patterns/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer test-key",
        },
        body: JSON.stringify({
          patternId: "pattern-missing",
          traceId: "trace-missing",
          outcome: "success",
        }),
      }),
    );

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload).toMatchObject({
      error: {
        code: "AUTH_FORBIDDEN",
      },
    });
    expect(logCognitiveAuditEventMock).not.toHaveBeenCalled();
  });

  it("returns success and logs when feedback is recorded", async () => {
    updatePatternFeedbackMock.mockResolvedValue(true);
    const { POST } = await import("../../../src/app/api/v1/cognitive/patterns/feedback/route");

    const response = await POST(
      new Request("http://localhost/api/v1/cognitive/patterns/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer test-key",
        },
        body: JSON.stringify({
          patternId: "pattern-1",
          traceId: "trace-1",
          outcome: "failure",
          notes: "Did not help",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      updated: true,
      patternId: "pattern-1",
      traceId: "trace-1",
      outcome: "failure",
    });
    expect(logCognitiveAuditEventMock).toHaveBeenCalledTimes(1);
  });
});
