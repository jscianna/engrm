import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getDb } from "@/lib/turso";
import { validateApiKey } from "@/lib/api-auth";

export const runtime = "nodejs";

interface SharedSignalBody {
  errorType: string;
  errorMessage: string;
  framework: string;
  resolution: string;
  success: boolean;
  attemptsBeforeFix: number;
  patternHash: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  // Auth
  const identity = await validateApiKey(request, "collective:submit");
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as SharedSignalBody;

    // Validate required fields
    if (!body.errorType || !body.errorMessage || !body.resolution || !body.patternHash) {
      return NextResponse.json(
        { error: "Missing required fields: errorType, errorMessage, resolution, patternHash" },
        { status: 400 },
      );
    }

    // Safety: reject if any path separators or URLs leaked through
    const allText = [body.errorType, body.errorMessage, body.framework, body.resolution].join(" ");
    if (/[/\\]/.test(body.errorMessage) || /[/\\]/.test(body.resolution)) {
      return NextResponse.json(
        { error: "Signal contains path separators — rejected for safety" },
        { status: 422 },
      );
    }
    if (/https?:\/\//.test(allText)) {
      return NextResponse.json(
        { error: "Signal contains URLs — rejected for safety" },
        { status: 422 },
      );
    }
    if (/\b(?:key|token|password|secret|credential)\b/i.test(allText)) {
      return NextResponse.json(
        { error: "Signal contains potential secrets — rejected for safety" },
        { status: 422 },
      );
    }

    const db = getDb();
    const now = new Date().toISOString();

    // Check for existing pattern with same hash (dedup)
    const existing = await db.execute({
      sql: `SELECT id, success_count, total_attempts, contributor_count, confidence
            FROM collective_patterns WHERE pattern_hash = ? LIMIT 1`,
      args: [body.patternHash],
    });

    if (existing.rows[0]) {
      // Update existing pattern
      const row = existing.rows[0] as Record<string, unknown>;
      const newSuccessCount = Number(row.success_count ?? 0) + (body.success ? 1 : 0);
      const newTotalAttempts = Number(row.total_attempts ?? 0) + 1;
      const newContributorCount = Number(row.contributor_count ?? 0) + 1;
      const newConfidence = newTotalAttempts > 0 ? newSuccessCount / newTotalAttempts : 0.5;
      const newDifficulty = body.attemptsBeforeFix > 3 ? 0.8 : body.attemptsBeforeFix > 1 ? 0.5 : 0.2;

      await db.execute({
        sql: `UPDATE collective_patterns
              SET success_count = ?,
                  total_attempts = ?,
                  contributor_count = ?,
                  confidence = ?,
                  difficulty = ?,
                  last_confirmed = ?,
                  updated_at = ?
              WHERE pattern_hash = ?`,
        args: [
          newSuccessCount,
          newTotalAttempts,
          newContributorCount,
          newConfidence,
          newDifficulty,
          now,
          now,
          body.patternHash,
        ],
      });

      return NextResponse.json({ ok: true, updated: true });
    }

    // Create new pattern
    const id = crypto.randomUUID();
    const confidence = body.success ? 0.6 : 0.3;
    const difficulty = body.attemptsBeforeFix > 3 ? 0.8 : body.attemptsBeforeFix > 1 ? 0.5 : 0.2;

    await db.execute({
      sql: `INSERT INTO collective_patterns (
              id, pattern_hash, category, error_type, framework,
              trigger_context, resolution_approach, confidence,
              success_count, total_attempts, contributor_count,
              difficulty, first_seen, last_confirmed, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        body.patternHash,
        "error-fix",
        body.errorType,
        body.framework || "",
        body.errorMessage.slice(0, 500),
        body.resolution.slice(0, 1000),
        confidence,
        body.success ? 1 : 0,
        1,
        1,
        difficulty,
        now,
        now,
        now,
        now,
      ],
    });

    return NextResponse.json({ ok: true, created: true, id });
  } catch (error) {
    console.error("[Collective Submit] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
