import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { CURATED_COGNITIVE_BENCHMARKS } from "@/lib/cognitive-curated-benchmarks";
import { evaluateBenchmark, evaluateBenchmarkGate } from "@/lib/cognitive-benchmark";
import { generateRetrievalEvalDataset, getRecentBenchmarkRuns, recordBenchmarkRun } from "@/lib/cognitive-db";
import { logCognitiveAuditEvent } from "@/lib/cognitive-audit";
import { assertBenchmarkRunsEnabled } from "@/lib/cognitive-guards";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.eval.benchmarks");
    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit")) || 10, 50));
    const runs = await getRecentBenchmarkRuns(identity.userId, limit);
    return Response.json({ runs });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.eval.benchmarks.run");
    assertBenchmarkRunsEnabled();
    const body = await request.json().catch(() => ({}));
    const dataset = body.dataset === "generated" ? "generated" : "curated";
    const generated = dataset === "generated"
      ? await generateRetrievalEvalDataset({ userId: identity.userId, limit: 200, acceptedOnly: false })
      : null;
    const fixtures = dataset === "generated" ? generated?.fixtures ?? [] : CURATED_COGNITIVE_BENCHMARKS;
    const predictions = Array.isArray(body.predictions) ? body.predictions : [];
    const result = evaluateBenchmark({ fixtures, predictions });
    const gate = evaluateBenchmarkGate({
      current: result,
      thresholds:
        body.thresholds && typeof body.thresholds === "object" && !Array.isArray(body.thresholds)
          ? body.thresholds
          : {
              minTraceMrr: dataset === "curated" ? 0.55 : 0.35,
              minPatternRecallAtK: dataset === "curated" ? 0.6 : 0.45,
              minWeakOutcomeLift: 0.55,
              minSuccessRate: 0.55,
              minVerificationCompletionRate: 0.5,
            },
    });

    await recordBenchmarkRun({
      userId: identity.userId,
      dataset,
      fixtureCount: fixtures.length,
      result: result as Record<string, unknown>,
      gate: gate as Record<string, unknown>,
    });

    await logCognitiveAuditEvent({
      request,
      userId: identity.userId,
      action: "cognitive.eval.benchmark_run",
      resourceType: "cognitive_benchmark",
      resourceId: dataset,
      metadata: {
        dataset,
        fixtureCount: fixtures.length,
        passed: gate.passed,
        reasons: gate.reasons,
      },
    });

    return Response.json({ dataset, fixtureCount: fixtures.length, result, gate });
  } catch (error) {
    return errorResponse(error);
  }
}
