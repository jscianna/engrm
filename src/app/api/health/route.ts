import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";
import { embedText } from "@/lib/embeddings";

export const runtime = "nodejs";

export async function GET() {
  const checks: Record<string, string | number> = {
    timestamp: new Date().toISOString(),
    env_turso_url: process.env.TURSO_DATABASE_URL ? "set" : "MISSING",
    env_turso_token: process.env.TURSO_AUTH_TOKEN ? "set" : "MISSING",
    env_encryption_key: process.env.ENCRYPTION_KEY ? "set" : "MISSING",
    env_clerk_key: process.env.CLERK_SECRET_KEY ? "set" : "MISSING",
    env_openai_key: process.env.OPENAI_API_KEY ? "set" : "MISSING",
    env_cohere_key: process.env.COHERE_API_KEY ? "set" : "MISSING",
  };

  try {
    const db = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    
    const result = await db.execute("SELECT 1 as ok");
    checks.db_connection = result.rows[0]?.ok === 1 ? "ok" : "failed";
    
    const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
    checks.db_tables = tables.rows.map(r => r.name as string).join(", ") || "none";
  } catch (error) {
    checks.db_connection = "error";
    checks.db_error = error instanceof Error ? error.message : String(error);
  }

  // Test embeddings
  try {
    const testEmbed = await embedText("test embedding");
    const nonZeroCount = testEmbed.filter(v => v !== 0).length;
    checks.embeddings = nonZeroCount > 0 ? "ok" : "zero_vector";
    checks.embedding_dims = testEmbed.length;
  } catch (error) {
    checks.embeddings = "error";
    checks.embeddings_error = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json(checks);
}
