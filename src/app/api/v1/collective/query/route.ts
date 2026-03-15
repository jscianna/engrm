import { NextResponse } from "next/server";
import { getDb } from "@/lib/turso";
import { validateApiKey } from "@/lib/api-auth";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  // Auth
  const identity = await validateApiKey(request, "collective:query");
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const errorType = searchParams.get("errorType");
    const framework = searchParams.get("framework");

    if (!errorType) {
      return NextResponse.json(
        { error: "Missing required parameter: errorType" },
        { status: 400 },
      );
    }

    const db = getDb();

    // Query matching patterns
    const args: (string | number)[] = [errorType];
    let frameworkClause = "";
    if (framework) {
      frameworkClause = "AND (framework = ? OR framework = '')";
      args.push(framework);
    }

    const result = await db.execute({
      sql: `SELECT id, pattern_hash, category, error_type, framework,
                   trigger_context, resolution_approach, confidence,
                   success_count, total_attempts, contributor_count,
                   difficulty, first_seen, last_confirmed
            FROM collective_patterns
            WHERE error_type = ? ${frameworkClause}
              AND confidence > 0.2
            ORDER BY confidence DESC, last_confirmed DESC
            LIMIT 10`,
      args,
    });

    const patterns = result.rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        patternHash: r.pattern_hash as string,
        category: (r.category as string) || "error-fix",
        trigger: {
          errorType: r.error_type as string,
          framework: (r.framework as string) || "",
          context: (r.trigger_context as string) || "",
        },
        resolution: {
          approach: r.resolution_approach as string,
          confidence: Number(r.confidence ?? 0.5),
          successCount: Number(r.success_count ?? 0),
          totalAttempts: Number(r.total_attempts ?? 0),
        },
        metadata: {
          contributorCount: Number(r.contributor_count ?? 1),
          firstSeen: r.first_seen as string,
          lastConfirmed: r.last_confirmed as string,
          difficulty: Number(r.difficulty ?? 0.5),
        },
      };
    });

    return NextResponse.json({ patterns });
  } catch (error) {
    console.error("[Collective Query] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
