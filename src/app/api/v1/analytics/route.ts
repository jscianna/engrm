import { validateApiKey } from "@/lib/api-auth";
import { errorResponse, MemryError } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";
import { getAnalytics, type AnalyticsMetric } from "@/lib/analytics";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "analytics");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new MemryError("VALIDATION_ERROR", { field: "body", reason: "Invalid request body" });
    }

    const period = typeof body.period === "string" && ["7d", "30d", "90d"].includes(body.period)
      ? body.period as "7d" | "30d" | "90d"
      : "7d";

    const validMetrics: AnalyticsMetric[] = ["token_savings", "memory_growth", "tier_distribution", "access_patterns"];
    const metrics: AnalyticsMetric[] = Array.isArray(body.metrics) 
      ? body.metrics.filter((m: unknown): m is AnalyticsMetric => 
          typeof m === "string" && (validMetrics as string[]).includes(m)
        )
      : validMetrics;

    const analytics = await getAnalytics({
      userId: identity.userId,
      period,
      metrics,
    });

    return Response.json(analytics);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "analytics");
    const url = new URL(request.url);
    
    const period = url.searchParams.get("period") as "7d" | "30d" | "90d" ?? "7d";
    if (!["7d", "30d", "90d"].includes(period)) {
      throw new MemryError("VALIDATION_ERROR", { field: "period", reason: "Must be 7d, 30d, or 90d" });
    }

    const analytics = await getAnalytics({
      userId: identity.userId,
      period,
      metrics: ["token_savings", "memory_growth", "tier_distribution", "access_patterns"],
    });

    return Response.json(analytics);
  } catch (error) {
    return errorResponse(error);
  }
}
